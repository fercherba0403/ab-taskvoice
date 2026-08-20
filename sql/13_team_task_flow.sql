-- ============================================================
-- TASKVOICE
-- 13_team_task_flow.sql
--
-- TAREAS DE EQUIPO
--
-- Una tarea asignada a varios técnicos se comporta como
-- una única intervención grupal:
--
-- - uno acepta    -> acepta el equipo
-- - uno inicia    -> inicia el equipo
-- - uno completa  -> completa el equipo
--
-- Se conserva UNA única ejecución operativa.
--
-- Rechazadas/canceladas quedan fuera del avance automático.
-- ============================================================

begin;


-- ============================================================
-- HELPER
-- ¿EL USUARIO ACTUAL ESTÁ ASIGNADO A LA TAREA?
-- ============================================================

create or replace function
public.is_assigned_to_task(
    p_task_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$

    select exists (

        select 1

        from public.task_assignees ta

        where ta.task_id =
            p_task_id

        and ta.user_id =
            auth.uid()

    );

$$;


revoke all
on function
public.is_assigned_to_task(bigint)
from public, anon;


grant execute
on function
public.is_assigned_to_task(bigint)
to authenticated;



-- ============================================================
-- HELPER
-- ACCESO A EJECUCIÓN COMPARTIDA
-- ============================================================

create or replace function
public.can_access_task_execution(
    p_execution_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$

    select exists (

        select 1

        from public.task_executions e

        join public.task_assignees ta

            on ta.task_id =
               e.task_id

        where e.id =
            p_execution_id

        and ta.user_id =
            auth.uid()

    );

$$;


revoke all
on function
public.can_access_task_execution(bigint)
from public, anon;


grant execute
on function
public.can_access_task_execution(bigint)
to authenticated;



-- ============================================================
-- ACEPTAR TAREA
--
-- Un integrante acepta:
-- todos los integrantes pendientes pasan a aceptada.
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

    v_now timestamptz :=
        now();

begin


    v_user_id :=
        auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;



    if not exists (

        select 1

        from public.profiles p

        where p.id =
            v_user_id

        and p.activo =
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



    if v_assignment.estado =
        'rechazada' then

        raise exception
        'TASKVOICE: esta tarea ya fue rechazada por el usuario.';

    end if;



    if v_assignment.estado =
        'cancelada' then

        raise exception
        'TASKVOICE: asignación cancelada.';

    end if;



    if v_assignment.estado in (
        'en_progreso',
        'completada'
    ) then

        return;

    end if;



    -- --------------------------------------------------------
    -- Todos los integrantes PENDIENTES pasan a ACEPTADA.
    --
    -- Se hace solamente pendiente -> aceptada para respetar
    -- las reglas actuales del trigger de transiciones.
    -- --------------------------------------------------------

    update public.task_assignees

    set

        estado =
            'aceptada',

        accepted_at =
            coalesce(
                accepted_at,
                v_now
            )

    where task_id =
        p_task_id

    and estado =
        'pendiente';



    -- Por seguridad, completar accepted_at en asignaciones
    -- aceptadas provenientes de datos anteriores.

    update public.task_assignees

    set accepted_at =
        coalesce(
            accepted_at,
            v_now
        )

    where task_id =
        p_task_id

    and estado =
        'aceptada';



    perform
    public.sync_task_state(
        p_task_id
    );


end;

$$;



-- ============================================================
-- INICIAR TAREA
--
-- Uno inicia:
-- - todo el equipo activo pasa a en_progreso
-- - existe UNA única ejecución abierta para la tarea
-- ============================================================

create or replace function
public.start_task(
    p_task_id bigint
)
returns bigint

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_user_id uuid;

    v_task record;

    v_assignment record;

    v_execution_id bigint;

    v_now timestamptz :=
        now();

begin


    v_user_id :=
        auth.uid();



    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;



    if not exists (

        select 1

        from public.profiles p

        where p.id =
            v_user_id

        and p.activo =
            true

    ) then

        raise exception
        'TASKVOICE: usuario inactivo.';

    end if;



    -- Bloqueamos la tarea.
    --
    -- Esto también evita que dos técnicos creen simultáneamente
    -- dos ejecuciones para la misma tarea.

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



    if v_assignment.estado =
        'rechazada' then

        raise exception
        'TASKVOICE: esta tarea fue rechazada por el usuario.';

    end if;



    if v_assignment.estado =
        'cancelada' then

        raise exception
        'TASKVOICE: asignación cancelada.';

    end if;



    if v_assignment.estado =
        'completada' then

        raise exception
        'TASKVOICE: esta tarea ya fue completada.';

    end if;



    -- ========================================================
    -- NORMALIZAR EQUIPO:
    -- pendiente -> aceptada
    -- ========================================================

    update public.task_assignees

    set

        estado =
            'aceptada',

        accepted_at =
            coalesce(
                accepted_at,
                v_now
            )

    where task_id =
        p_task_id

    and estado =
        'pendiente';



    -- ========================================================
    -- aceptada -> en_progreso
    -- ========================================================

    update public.task_assignees

    set

        estado =
            'en_progreso',

        accepted_at =
            coalesce(
                accepted_at,
                v_now
            ),

        started_at =
            coalesce(
                started_at,
                v_now
            )

    where task_id =
        p_task_id

    and estado =
        'aceptada';



    -- Completar started_at en datos anteriores.

    update public.task_assignees

    set started_at =
        coalesce(
            started_at,
            v_now
        )

    where task_id =
        p_task_id

    and estado =
        'en_progreso';



    -- ========================================================
    -- BUSCAR EJECUCIÓN ABIERTA DE TODA LA TAREA
    --
    -- Ya NO buscamos por user_id.
    -- ========================================================

    select e.id

    into v_execution_id

    from public.task_executions e

    where e.task_id =
        p_task_id

    and e.fin is null

    order by e.id desc

    limit 1;



    -- ========================================================
    -- SI NO EXISTE, CREAR UNA
    --
    -- user_id conserva quién inició físicamente la intervención.
    -- ========================================================

    if v_execution_id is null then

        insert into public.task_executions (

            task_id,

            user_id,

            inicio

        )

        values (

            p_task_id,

            v_user_id,

            v_now

        )

        returning id

        into v_execution_id;

    end if;



    perform
    public.sync_task_state(
        p_task_id
    );



    return
        v_execution_id;


end;

$$;



-- ============================================================
-- COMPLETAR TAREA
--
-- Puede completar cualquier técnico asignado activo.
--
-- La ejecución sigue conservando user_id del técnico que
-- inició originalmente la intervención.
-- ============================================================

create or replace function
public.complete_task(

    p_execution_id bigint,

    p_descripcion text default null,

    p_transcripcion text default null,

    p_audio_path text default null

)
returns void

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_user_id uuid;

    v_execution record;

    v_task record;

    v_assignment record;

    v_description text;

    v_transcription text;

    v_audio_path text;

    v_expected_prefix text;

    v_now timestamptz :=
        now();

begin


    v_user_id :=
        auth.uid();



    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;



    if not exists (

        select 1

        from public.profiles p

        where p.id =
            v_user_id

        and p.activo =
            true

    ) then

        raise exception
        'TASKVOICE: usuario inactivo.';

    end if;



    -- ========================================================
    -- EJECUCIÓN
    -- ========================================================

    select *

    into v_execution

    from public.task_executions

    where id =
        p_execution_id

    for update;



    if not found then

        raise exception
        'TASKVOICE: ejecución inexistente.';

    end if;



    -- ========================================================
    -- TAREA
    -- ========================================================

    select *

    into v_task

    from public.tasks

    where id =
        v_execution.task_id

    for update;



    if not found then

        raise exception
        'TASKVOICE: tarea inexistente.';

    end if;



    -- ========================================================
    -- EL USUARIO DEBE FORMAR PARTE DEL EQUIPO
    -- ========================================================

    select *

    into v_assignment

    from public.task_assignees

    where task_id =
        v_task.id

    and user_id =
        v_user_id

    for update;



    if not found then

        raise exception
        'TASKVOICE: el usuario no está asignado a esta tarea.';

    end if;



    if v_assignment.estado =
        'rechazada' then

        raise exception
        'TASKVOICE: esta tarea fue rechazada por el usuario.';

    end if;



    if v_assignment.estado =
        'cancelada' then

        raise exception
        'TASKVOICE: asignación cancelada.';

    end if;



    -- ========================================================
    -- IDEMPOTENCIA
    -- ========================================================

    if v_execution.fin is not null then

        if v_assignment.estado =
            'completada' then

            return;

        end if;


        raise exception
        'TASKVOICE: esta ejecución ya fue completada.';

    end if;



    -- ========================================================
    -- INFORME
    -- ========================================================

    v_description :=
        nullif(
            btrim(
                p_descripcion
            ),
            ''
        );


    v_transcription :=
        nullif(
            btrim(
                p_transcripcion
            ),
            ''
        );


    v_audio_path :=
        nullif(
            btrim(
                p_audio_path
            ),
            ''
        );



    if v_description is null

       and v_transcription is null

       and v_audio_path is null then

        raise exception
        'TASKVOICE: debe registrar una descripción, transcripción o audio.';

    end if;



    -- ========================================================
    -- VALIDAR RUTA DEL AUDIO
    -- ========================================================

    if v_audio_path is not null then

        v_expected_prefix :=

            v_task.organization_id::text

            || '/'

            || v_task.id::text

            || '/'

            || p_execution_id::text

            || '/';



        if left(

            v_audio_path,

            length(
                v_expected_prefix
            )

        ) <> v_expected_prefix then

            raise exception
            'TASKVOICE: ruta de audio inválida.';

        end if;

    end if;



    -- ========================================================
    -- CERRAR EJECUCIÓN COMPARTIDA
    -- ========================================================

    update public.task_executions

    set

        fin =
            v_now,

        descripcion =
            v_description,

        transcripcion =
            v_transcription,

        audio_path =
            v_audio_path

    where id =
        p_execution_id;



    -- ========================================================
    -- NORMALIZAR TODO EL EQUIPO
    --
    -- Se realizan las transiciones por etapas para respetar
    -- el trigger existente:
    --
    -- pendiente -> aceptada
    -- aceptada  -> en_progreso
    -- progreso  -> completada
    -- ========================================================

    update public.task_assignees

    set

        estado =
            'aceptada',

        accepted_at =
            coalesce(
                accepted_at,
                v_now
            )

    where task_id =
        v_task.id

    and estado =
        'pendiente';



    update public.task_assignees

    set

        estado =
            'en_progreso',

        accepted_at =
            coalesce(
                accepted_at,
                v_now
            ),

        started_at =
            coalesce(
                started_at,
                v_execution.inicio,
                v_now
            )

    where task_id =
        v_task.id

    and estado =
        'aceptada';



    update public.task_assignees

    set

        estado =
            'completada',

        started_at =
            coalesce(
                started_at,
                v_execution.inicio,
                v_now
            ),

        completed_at =
            coalesce(
                completed_at,
                v_now
            )

    where task_id =
        v_task.id

    and estado =
        'en_progreso';



    perform
    public.sync_task_state(
        v_task.id
    );


end;

$$;



-- ============================================================
-- COMPLETAR CON TIPOS DE TRABAJO
--
-- Misma lógica existente, pero ahora cualquier integrante
-- activo del equipo puede completar la ejecución compartida.
-- ============================================================

create or replace function
public.complete_task_with_work_types(

    p_execution_id bigint,

    p_work_type_ids bigint[],

    p_descripcion text default null,

    p_transcripcion text default null,

    p_audio_path text default null

)
returns void

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_user_id uuid;

    v_execution record;

    v_task record;

    v_valid_types integer;

    v_selected_types integer;

begin


    v_user_id :=
        auth.uid();



    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;



    -- ========================================================
    -- EJECUCIÓN
    -- ========================================================

    select *

    into v_execution

    from public.task_executions

    where id =
        p_execution_id

    for update;



    if not found then

        raise exception
        'TASKVOICE: ejecución inexistente.';

    end if;



    if v_execution.fin is not null then

        raise exception
        'TASKVOICE: esta ejecución ya fue completada.';

    end if;



    -- ========================================================
    -- TAREA
    -- ========================================================

    select *

    into v_task

    from public.tasks

    where id =
        v_execution.task_id

    for update;



    if not found then

        raise exception
        'TASKVOICE: tarea inexistente.';

    end if;



    -- ========================================================
    -- DEBE SER INTEGRANTE ACTIVO DEL EQUIPO
    -- ========================================================

    if not exists (

        select 1

        from public.task_assignees ta

        where ta.task_id =
            v_task.id

        and ta.user_id =
            v_user_id

        and ta.estado not in (
            'rechazada',
            'cancelada'
        )

    ) then

        raise exception
        'TASKVOICE: el usuario no pertenece al equipo activo de esta tarea.';

    end if;



    -- ========================================================
    -- DEBE SELECCIONAR AL MENOS UN TIPO
    -- ========================================================

    if p_work_type_ids is null

       or cardinality(
            p_work_type_ids
       ) = 0 then

        raise exception
        'TASKVOICE: debe seleccionar al menos un tipo de trabajo realizado.';

    end if;



    -- ========================================================
    -- NO PERMITIR NULL
    -- ========================================================

    if array_position(
        p_work_type_ids,
        null
    ) is not null then

        raise exception
        'TASKVOICE: selección de trabajos inválida.';

    end if;



    -- ========================================================
    -- NO PERMITIR REPETIDOS
    -- ========================================================

    select count(
        distinct value
    )

    into v_selected_types

    from unnest(
        p_work_type_ids
    ) as value;



    if v_selected_types <>
       cardinality(
            p_work_type_ids
       ) then

        raise exception
        'TASKVOICE: hay tipos de trabajo repetidos.';

    end if;



    -- ========================================================
    -- VALIDAR TIPOS
    -- ========================================================

    select count(*)

    into v_valid_types

    from public.work_types wt

    where wt.id =
        any(
            p_work_type_ids
        )

    and wt.organization_id =
        v_task.organization_id

    and wt.activo =
        true;



    if v_valid_types <>
       cardinality(
            p_work_type_ids
       ) then

        raise exception
        'TASKVOICE: uno o más tipos de trabajo son inválidos.';

    end if;



    -- ========================================================
    -- GUARDAR TIPOS
    -- ========================================================

    insert into public.execution_work_types (

        execution_id,

        work_type_id

    )

    select

        p_execution_id,

        value

    from unnest(
        p_work_type_ids
    ) as value

    on conflict (
        execution_id,
        work_type_id
    )

    do nothing;



    -- ========================================================
    -- COMPLETAR TAREA GRUPAL
    -- ========================================================

    perform
    public.complete_task(

        p_execution_id,

        p_descripcion,

        p_transcripcion,

        p_audio_path

    );


end;

$$;



-- ============================================================
-- RLS
-- LOS TÉCNICOS DEL EQUIPO PUEDEN LEER LA EJECUCIÓN COMPARTIDA
-- ============================================================

drop policy if exists
"task_executions_team_read"
on public.task_executions;


create policy
"task_executions_team_read"

on public.task_executions

for select

to authenticated

using (

    public.is_assigned_to_task(
        task_id
    )

);



-- ============================================================
-- RLS
-- TIPOS DE TRABAJO DE LA EJECUCIÓN COMPARTIDA
-- ============================================================

drop policy if exists
"execution_work_types_team_read"
on public.execution_work_types;


create policy
"execution_work_types_team_read"

on public.execution_work_types

for select

to authenticated

using (

    public.can_access_task_execution(
        execution_id
    )

);



-- ============================================================
-- STORAGE
-- AUDIO COMPARTIDO ENTRE LOS TÉCNICOS ASIGNADOS
-- ============================================================

drop policy if exists
"audios_team_read"
on storage.objects;


create policy
"audios_team_read"

on storage.objects

for select

to authenticated

using (

    bucket_id =
        'audios'

    and

    public.can_access_task_execution(

        case

            when split_part(
                name,
                '/',
                3
            ) ~ '^[0-9]+$'

            then split_part(
                name,
                '/',
                3
            )::bigint

            else null

        end

    )

);



-- ============================================================
-- STORAGE
-- PERMITIR QUE CUALQUIER INTEGRANTE DEL EQUIPO CARGUE AUDIO
-- EN LA EJECUCIÓN COMPARTIDA.
-- ============================================================

drop policy if exists
"audios_team_insert"
on storage.objects;


create policy
"audios_team_insert"

on storage.objects

for insert

to authenticated

with check (

    bucket_id =
        'audios'

    and

    public.can_access_task_execution(

        case

            when split_part(
                name,
                '/',
                3
            ) ~ '^[0-9]+$'

            then split_part(
                name,
                '/',
                3
            )::bigint

            else null

        end

    )

);



drop policy if exists
"audios_team_update"
on storage.objects;


create policy
"audios_team_update"

on storage.objects

for update

to authenticated

using (

    bucket_id =
        'audios'

    and

    public.can_access_task_execution(

        case

            when split_part(
                name,
                '/',
                3
            ) ~ '^[0-9]+$'

            then split_part(
                name,
                '/',
                3
            )::bigint

            else null

        end

    )

)

with check (

    bucket_id =
        'audios'

    and

    public.can_access_task_execution(

        case

            when split_part(
                name,
                '/',
                3
            ) ~ '^[0-9]+$'

            then split_part(
                name,
                '/',
                3
            )::bigint

            else null

        end

    )

);



-- ============================================================
-- PERMISOS RPC
-- ============================================================

revoke execute
on function
public.accept_task(bigint)
from public, anon;


grant execute
on function
public.accept_task(bigint)
to authenticated;



revoke execute
on function
public.start_task(bigint)
from public, anon;


grant execute
on function
public.start_task(bigint)
to authenticated;



revoke execute
on function
public.complete_task(
    bigint,
    text,
    text,
    text
)
from public, anon;


grant execute
on function
public.complete_task(
    bigint,
    text,
    text,
    text
)
to authenticated;



revoke execute
on function
public.complete_task_with_work_types(
    bigint,
    bigint[],
    text,
    text,
    text
)
from public, anon;


grant execute
on function
public.complete_task_with_work_types(
    bigint,
    bigint[],
    text,
    text,
    text
)
to authenticated;



commit;