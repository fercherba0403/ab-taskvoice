-- ============================================================
-- TASKVOICE
-- 09_worker_accept_reject.sql
--
-- Flujo del técnico:
--
-- pendiente
--    ├── aceptada
--    └── rechazada
--
-- El rechazo es INDIVIDUAL.
-- No cancela automáticamente la tarea completa.
-- ============================================================

begin;


-- ============================================================
-- 1. DATOS DEL RECHAZO
-- ============================================================

alter table public.task_assignees
add column if not exists rejected_at timestamptz;


alter table public.task_assignees
add column if not exists rejection_reason text;



-- ============================================================
-- 2. ESTADO RECHAZADA
-- ============================================================

alter table public.task_assignees
drop constraint if exists
task_assignees_estado_check;


alter table public.task_assignees
add constraint
task_assignees_estado_check

check (

    estado in (

        'pendiente',
        'aceptada',
        'en_progreso',
        'completada',
        'cancelada',
        'rechazada'

    )

);



-- ============================================================
-- 3. TRANSICIONES INDIVIDUALES
-- ============================================================

create or replace function
public.validate_task_assignee_transition()

returns trigger

language plpgsql

set search_path = ''

as $$

begin

    if new.estado =
       old.estado then

        return new;

    end if;


    -- --------------------------------------------------------
    -- Pendiente
    -- --------------------------------------------------------

    if old.estado = 'pendiente'

       and new.estado in (

            'aceptada',
            'rechazada',
            'cancelada'

       ) then

        return new;

    end if;


    -- --------------------------------------------------------
    -- Aceptada
    --
    -- Permitimos rechazo mientras todavía no inició.
    -- --------------------------------------------------------

    if old.estado = 'aceptada'

       and new.estado in (

            'en_progreso',
            'rechazada',
            'cancelada'

       ) then

        return new;

    end if;


    -- --------------------------------------------------------
    -- En progreso
    -- --------------------------------------------------------

    if old.estado = 'en_progreso'

       and new.estado in (

            'completada',
            'cancelada'

       ) then

        return new;

    end if;


    raise exception

        'TASKVOICE: transición individual no permitida: % -> %',

        old.estado,

        new.estado;

end;

$$;


drop trigger if exists
task_assignee_state_transition
on public.task_assignees;


create trigger
task_assignee_state_transition

before update of estado

on public.task_assignees

for each row

execute function
public.validate_task_assignee_transition();



-- ============================================================
-- 4. SINCRONIZACIÓN DEL ESTADO GENERAL
--
-- Los técnicos rechazados dejan de participar en el cálculo.
--
-- Ejemplo:
--
-- Juan   completada
-- Pedro  rechazada
-- Carlos completada
--
-- tarea = completada
-- ============================================================

create or replace function
public.sync_task_state(
    p_task_id bigint
)

returns void

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_current_state text;

    v_active_total integer;

    v_pending integer;

    v_accepted integer;

    v_progress integer;

    v_completed integer;

    v_new_state text;

begin

    select estado

    into v_current_state

    from public.tasks

    where id =
        p_task_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: tarea inexistente.';

    end if;


    -- Estados finales globales.

    if v_current_state in (
        'cancelada',
        'completada'
    ) then

        return;

    end if;


    select

        count(*) filter (
            where estado <> 'rechazada'
        ),

        count(*) filter (
            where estado = 'pendiente'
        ),

        count(*) filter (
            where estado = 'aceptada'
        ),

        count(*) filter (
            where estado = 'en_progreso'
        ),

        count(*) filter (
            where estado = 'completada'
        )

    into

        v_active_total,

        v_pending,

        v_accepted,

        v_progress,

        v_completed

    from public.task_assignees

    where task_id =
        p_task_id;


    -- --------------------------------------------------------
    -- Todos rechazaron.
    --
    -- La tarea queda pendiente para que administración pueda
    -- reasignarla.
    -- --------------------------------------------------------

    if v_active_total = 0 then

        if v_current_state =
            'vencida' then

            return;

        end if;


        v_new_state :=
            'pendiente';


    elsif v_completed =
          v_active_total then

        v_new_state :=
            'completada';


    elsif (
        v_progress > 0
        or
        v_completed > 0
    ) then

        v_new_state :=
            'en_progreso';


    elsif v_current_state =
          'vencida' then

        v_new_state :=
            'vencida';


    elsif v_accepted > 0 then

        v_new_state :=
            'aceptada';


    else

        v_new_state :=
            'pendiente';

    end if;


    if v_new_state
       is distinct from
       v_current_state then

        update public.tasks

        set estado =
            v_new_state

        where id =
            p_task_id;

    end if;

end;

$$;



-- ============================================================
-- 5. REJECT_TASK
-- ============================================================

create or replace function
public.reject_task(

    p_task_id bigint,

    p_motivo text

)

returns void

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_user_id uuid;

    v_task record;

    v_assignment record;

    v_reason text;

    v_user_name text;

begin

    v_user_id :=
        auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


    if not exists (

        select 1

        from public.profiles

        where id =
            v_user_id

        and activo =
            true

    ) then

        raise exception
        'TASKVOICE: usuario inexistente o inactivo.';

    end if;


    -- --------------------------------------------------------
    -- Motivo obligatorio
    -- --------------------------------------------------------

    v_reason :=
        nullif(
            btrim(p_motivo),
            ''
        );


    if v_reason is null then

        raise exception
        'TASKVOICE: debe indicar el motivo del rechazo.';

    end if;


    -- --------------------------------------------------------
    -- Tarea
    -- --------------------------------------------------------

    select *

    into v_task

    from public.tasks

    where id =
        p_task_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: tarea inexistente.';

    end if;


    if v_task.estado in (

        'completada',
        'cancelada'

    ) then

        raise exception
        'TASKVOICE: la tarea ya fue finalizada.';

    end if;


    -- --------------------------------------------------------
    -- Asignación individual
    -- --------------------------------------------------------

    select *

    into v_assignment

    from public.task_assignees

    where task_id =
        p_task_id

    and user_id =
        v_user_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: esta tarea no está asignada al usuario actual.';

    end if;


    if v_assignment.estado =
        'rechazada' then

        return;

    end if;


    if v_assignment.estado =
        'en_progreso' then

        raise exception
        'TASKVOICE: una tarea ya iniciada no puede rechazarse.';

    end if;


    if v_assignment.estado =
        'completada' then

        raise exception
        'TASKVOICE: la tarea ya fue completada por este técnico.';

    end if;


    if v_assignment.estado =
        'cancelada' then

        raise exception
        'TASKVOICE: la asignación está cancelada.';

    end if;


    -- --------------------------------------------------------
    -- Rechazar
    -- --------------------------------------------------------

    update public.task_assignees

    set

        estado =
            'rechazada',

        rejected_at =
            now(),

        rejection_reason =
            v_reason

    where task_id =
        p_task_id

    and user_id =
        v_user_id;


    -- --------------------------------------------------------
    -- Nombre del técnico
    -- --------------------------------------------------------

    select

        concat_ws(
            ' ',
            nombre,
            apellido
        )

    into v_user_name

    from public.profiles

    where id =
        v_user_id;


    -- --------------------------------------------------------
    -- Historial
    -- --------------------------------------------------------

    insert into public.task_history (

        task_id,

        user_id,

        accion,

        comentario

    )

    values (

        p_task_id,

        v_user_id,

        'tarea_rechazada',

        coalesce(
            v_user_name,
            'Técnico'
        )

        ||

        ': '

        ||

        v_reason

    );


    -- --------------------------------------------------------
    -- Avisar al creador/admin que asignó la tarea
    -- --------------------------------------------------------

    if v_task.creado_por
       is not null

       and v_task.creado_por
           is distinct from
           v_user_id then

        insert into public.notifications (

            organization_id,

            user_id,

            task_id,

            titulo,

            mensaje,

            tipo

        )

        values (

            v_task.organization_id,

            v_task.creado_por,

            p_task_id,

            'Tarea rechazada',

            coalesce(
                v_user_name,
                'Un técnico'
            )

            ||

            ' rechazó la tarea: '

            ||

            v_task.titulo

            ||

            '. Motivo: '

            ||

            v_reason,

            'tarea_rechazada'

        );

    end if;


    perform
    public.sync_task_state(
        p_task_id
    );

end;

$$;



-- ============================================================
-- 6. ACCEPT_TASK
--
-- Evitamos que una asignación ya rechazada pueda aceptarse
-- nuevamente sin intervención del administrador.
-- ============================================================

create or replace function
public.accept_task(
    p_task_id bigint
)

returns void

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_user_id uuid;

    v_task record;

    v_assignment record;

begin

    v_user_id :=
        auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


    if not exists (

        select 1

        from public.profiles

        where id =
            v_user_id

        and activo =
            true

    ) then

        raise exception
        'TASKVOICE: usuario inactivo.';

    end if;


    select *

    into v_task

    from public.tasks

    where id =
        p_task_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: tarea inexistente.';

    end if;


    if v_task.estado in (

        'completada',
        'cancelada'

    ) then

        raise exception
        'TASKVOICE: esta tarea ya fue finalizada.';

    end if;


    select *

    into v_assignment

    from public.task_assignees

    where task_id =
        p_task_id

    and user_id =
        v_user_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: esta tarea no está asignada al usuario actual.';

    end if;


    if v_assignment.estado in (

        'aceptada',
        'en_progreso',
        'completada'

    ) then

        return;

    end if;


    if v_assignment.estado =
        'rechazada' then

        raise exception
        'TASKVOICE: esta tarea ya fue rechazada.';

    end if;


    if v_assignment.estado =
        'cancelada' then

        raise exception
        'TASKVOICE: asignación cancelada.';

    end if;


    update public.task_assignees

    set

        estado =
            'aceptada',

        accepted_at =
            coalesce(
                accepted_at,
                now()
            )

    where task_id =
        p_task_id

    and user_id =
        v_user_id;


    perform
    public.sync_task_state(
        p_task_id
    );

end;

$$;



-- ============================================================
-- 7. PERMISOS
-- ============================================================

revoke execute
on function public.reject_task(
    bigint,
    text
)
from public, anon;


grant execute
on function public.reject_task(
    bigint,
    text
)
to authenticated;


revoke execute
on function public.accept_task(bigint)
from public, anon;


grant execute
on function public.accept_task(bigint)
to authenticated;



commit;