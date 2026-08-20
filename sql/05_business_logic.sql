-- ============================================================
-- TASKVOICE
-- 05_business_logic.sql
--
-- Lógica de negocio principal
--
-- Funciones:
--
--   create_task()
--   update_task()
--   accept_task()
--   start_task()
--   complete_task()
--   cancel_task()
--
-- Automatizaciones:
--
--   Historial automático
--   Notificaciones automáticas
--   Validación de estados
--   Protección contra ejecuciones simultáneas
--
-- REQUIERE:
--
--   01_database.sql
--   02_storage.sql
--   03_auth.sql
--   04_bootstrap.sql
--
-- IMPORTANTE:
-- El proyecto NO utiliza GPS ni geolocalización.
-- ============================================================



-- ============================================================
-- 1. VALIDAR FECHAS DE EJECUCIÓN
-- ============================================================

do $$

begin

    if not exists (

        select 1
        from pg_constraint
        where conname = 'task_executions_fin_after_inicio'

    ) then

        alter table public.task_executions

        add constraint task_executions_fin_after_inicio

        check (

            fin is null

            or inicio is null

            or fin >= inicio

        );

    end if;

end $$;



-- ============================================================
-- 2. UNA SOLA EJECUCIÓN ABIERTA POR TAREA
--
-- Permitimos múltiples ejecuciones históricas,
-- pero nunca dos abiertas simultáneamente.
-- ============================================================

create unique index if not exists
idx_task_executions_one_open

on public.task_executions(task_id)

where fin is null;



-- ============================================================
-- 3. ELIMINAR POLICIES DE ESCRITURA ANTIGUAS
--
-- A partir de ahora las operaciones sensibles serán
-- realizadas mediante funciones RPC.
-- ============================================================

drop policy if exists
"supervisor puede crear tareas"
on public.tasks;


drop policy if exists
"supervisor puede modificar tareas"
on public.tasks;


drop policy if exists
"trabajador puede crear ejecución"
on public.task_executions;


drop policy if exists
"usuario puede modificar su ejecución"
on public.task_executions;


drop policy if exists
"usuarios pueden registrar historial"
on public.task_history;



-- ============================================================
-- 4. BLOQUEAR ESCRITURA DIRECTA DESDE EL NAVEGADOR
-- ============================================================

revoke insert, update, delete
on public.tasks
from authenticated;


revoke insert, update, delete
on public.task_executions
from authenticated;


revoke insert, update, delete
on public.task_history
from authenticated;


revoke insert, delete
on public.notifications
from authenticated;



-- ============================================================
-- 5. NOTIFICACIONES
--
-- El usuario puede modificar solamente "leida".
-- No puede cambiar título, usuario, mensaje, tarea, etc.
-- ============================================================

revoke update
on public.notifications
from authenticated;


grant update (leida)
on public.notifications
to authenticated;



-- ============================================================
-- 6. GARANTIZAR PERMISOS DE LECTURA
--
-- RLS sigue determinando QUÉ filas puede leer cada usuario.
-- ============================================================

grant select
on public.tasks
to authenticated;


grant select
on public.task_executions
to authenticated;


grant select
on public.task_history
to authenticated;


grant select
on public.notifications
to authenticated;



-- ============================================================
-- 7. ENDURECER FUNCIONES AUXILIARES EXISTENTES
-- ============================================================

revoke execute
on function public.get_my_organization_id()
from public, anon;


revoke execute
on function public.is_admin()
from public, anon;


revoke execute
on function public.is_supervisor()
from public, anon;


grant execute
on function public.get_my_organization_id()
to authenticated;


grant execute
on function public.is_admin()
to authenticated;


grant execute
on function public.is_supervisor()
to authenticated;



-- ============================================================
-- 8. VALIDACIÓN DE TRANSICIONES DE ESTADO
--
-- Flujo permitido:
--
-- pendiente
--    ↓
-- aceptada
--    ↓
-- en_progreso
--    ↓
-- completada
--
-- También:
--
-- pendiente / aceptada / en_progreso / vencida
--                         ↓
--                     cancelada
--
-- Una tarea vencida todavía puede realizarse.
-- ============================================================

create or replace function
public.validate_task_state_transition()

returns trigger

language plpgsql

set search_path = ''

as $$

begin

    -- Si el estado no cambió, no hacemos nada.

    if new.estado = old.estado then

        return new;

    end if;


    -- --------------------------------------------------------
    -- PENDIENTE
    -- --------------------------------------------------------

    if old.estado = 'pendiente'

       and new.estado in (

            'aceptada',
            'en_progreso',
            'cancelada',
            'vencida'

       ) then

        return new;

    end if;


    -- --------------------------------------------------------
    -- ACEPTADA
    -- --------------------------------------------------------

    if old.estado = 'aceptada'

       and new.estado in (

            'en_progreso',
            'cancelada',
            'vencida'

       ) then

        return new;

    end if;


    -- --------------------------------------------------------
    -- EN PROGRESO
    -- --------------------------------------------------------

    if old.estado = 'en_progreso'

       and new.estado in (

            'completada',
            'cancelada'

       ) then

        return new;

    end if;


    -- --------------------------------------------------------
    -- VENCIDA
    --
    -- Permitimos realizar una tarea aunque esté vencida.
    -- --------------------------------------------------------

    if old.estado = 'vencida'

       and new.estado in (

            'en_progreso',
            'cancelada'

       ) then

        return new;

    end if;


    -- --------------------------------------------------------
    -- CUALQUIER OTRA TRANSICIÓN ES INVÁLIDA
    -- --------------------------------------------------------

    raise exception

        'TASKVOICE: transición de estado no permitida: % -> %',

        old.estado,

        new.estado;

end;

$$;



-- ============================================================
-- 9. TRIGGER DE VALIDACIÓN DE ESTADO
-- ============================================================

drop trigger if exists
task_validate_state_transition
on public.tasks;


create trigger task_validate_state_transition

before update of estado

on public.tasks

for each row

execute function
public.validate_task_state_transition();



-- ============================================================
-- 10. FUNCIÓN DE AUDITORÍA Y NOTIFICACIONES
-- ============================================================

create or replace function
public.handle_task_audit()

returns trigger

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_actor uuid;

    v_comment text;

begin

    v_actor := auth.uid();


    -- --------------------------------------------------------
    -- Evitar FK inválida si por alguna razón auth.uid()
    -- no tiene profile.
    -- --------------------------------------------------------

    if v_actor is not null

       and not exists (

            select 1

            from public.profiles

            where id = v_actor

       ) then

        v_actor := null;

    end if;


    -- --------------------------------------------------------
    -- Comentario opcional enviado por funciones internas.
    -- --------------------------------------------------------

    v_comment := nullif(

        current_setting(
            'taskvoice.history_comment',
            true
        ),

        ''

    );


    -- ========================================================
    -- NUEVA TAREA
    -- ========================================================

    if tg_op = 'INSERT' then


        insert into public.task_history (

            task_id,

            user_id,

            accion,

            estado_anterior,

            estado_nuevo,

            comentario

        )

        values (

            new.id,

            v_actor,

            'creada',

            null,

            new.estado,

            null

        );


        -- ----------------------------------------------------
        -- Notificar al usuario asignado
        -- ----------------------------------------------------

        if new.asignado_a is not null

           and new.asignado_a
               is distinct from v_actor then


            insert into public.notifications (

                organization_id,

                user_id,

                task_id,

                titulo,

                mensaje,

                tipo

            )

            values (

                new.organization_id,

                new.asignado_a,

                new.id,

                'Nueva tarea asignada',

                'Se te asignó la tarea: '
                    || new.titulo,

                'tarea_asignada'

            );

        end if;


        return new;

    end if;



    -- ========================================================
    -- CAMBIO DE USUARIO ASIGNADO
    -- ========================================================

    if new.asignado_a
       is distinct from old.asignado_a then


        insert into public.task_history (

            task_id,

            user_id,

            accion,

            comentario

        )

        values (

            new.id,

            v_actor,

            case

                when new.asignado_a is null
                then 'desasignada'

                when old.asignado_a is null
                then 'asignada'

                else 'reasignada'

            end,

            case

                when new.asignado_a is null
                then 'La tarea quedó sin usuario asignado.'

                else
                    'Nuevo usuario asignado: '
                    || new.asignado_a::text

            end

        );


        -- ----------------------------------------------------
        -- Notificar al nuevo usuario
        -- ----------------------------------------------------

        if new.asignado_a is not null

           and new.asignado_a
               is distinct from v_actor then


            insert into public.notifications (

                organization_id,

                user_id,

                task_id,

                titulo,

                mensaje,

                tipo

            )

            values (

                new.organization_id,

                new.asignado_a,

                new.id,

                'Tarea asignada',

                'Se te asignó la tarea: '
                    || new.titulo,

                'tarea_asignada'

            );

        end if;

    end if;



    -- ========================================================
    -- EDICIÓN DE DATOS DE LA TAREA
    -- ========================================================

    if (

        new.titulo,

        new.descripcion,

        new.prioridad,

        new.fecha_limite,

        new.hora_limite,

        new.template_id

    )

    is distinct from

    (

        old.titulo,

        old.descripcion,

        old.prioridad,

        old.fecha_limite,

        old.hora_limite,

        old.template_id

    ) then


        insert into public.task_history (

            task_id,

            user_id,

            accion,

            comentario

        )

        values (

            new.id,

            v_actor,

            'editada',

            'Se modificaron datos de la tarea.'

        );

    end if;



    -- ========================================================
    -- CAMBIO DE ESTADO
    -- ========================================================

    if new.estado
       is distinct from old.estado then


        insert into public.task_history (

            task_id,

            user_id,

            accion,

            estado_anterior,

            estado_nuevo,

            comentario

        )

        values (

            new.id,

            v_actor,

            'estado_cambiado',

            old.estado,

            new.estado,

            v_comment

        );


        -- ====================================================
        -- TAREA COMPLETADA
        --
        -- Avisamos al usuario que la creó.
        -- ====================================================

        if new.estado = 'completada'

           and new.creado_por is not null

           and new.creado_por
               is distinct from new.asignado_a then


            insert into public.notifications (

                organization_id,

                user_id,

                task_id,

                titulo,

                mensaje,

                tipo

            )

            values (

                new.organization_id,

                new.creado_por,

                new.id,

                'Tarea completada',

                'Se completó la tarea: '
                    || new.titulo,

                'tarea_completada'

            );

        end if;



        -- ====================================================
        -- TAREA CANCELADA
        -- ====================================================

        if new.estado = 'cancelada'

           and new.asignado_a is not null

           and new.asignado_a
               is distinct from v_actor then


            insert into public.notifications (

                organization_id,

                user_id,

                task_id,

                titulo,

                mensaje,

                tipo

            )

            values (

                new.organization_id,

                new.asignado_a,

                new.id,

                'Tarea cancelada',

                'Se canceló la tarea: '
                    || new.titulo,

                'tarea_cancelada'

            );

        end if;

    end if;


    return new;

end;

$$;



-- ============================================================
-- 11. TRIGGER DE AUDITORÍA
-- ============================================================

drop trigger if exists
task_audit_trigger
on public.tasks;


create trigger task_audit_trigger

after insert or update

on public.tasks

for each row

execute function public.handle_task_audit();



-- ============================================================
-- 12. FUNCIÓN: CREAR TAREA
--
-- Solo:
--
-- admin
-- supervisor
-- ============================================================

create or replace function public.create_task(

    p_titulo text,

    p_asignado_a uuid,

    p_descripcion text default null,

    p_prioridad text default 'normal',

    p_fecha_limite date default null,

    p_hora_limite time default null,

    p_template_id bigint default null

)

returns bigint

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_user_id uuid;

    v_organization_id uuid;

    v_role text;

    v_active boolean;

    v_task_id bigint;

begin

    v_user_id := auth.uid();


    -- --------------------------------------------------------
    -- Usuario autenticado
    -- --------------------------------------------------------

    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


    -- --------------------------------------------------------
    -- Perfil del creador
    -- --------------------------------------------------------

    select

        organization_id,

        rol,

        activo

    into

        v_organization_id,

        v_role,

        v_active

    from public.profiles

    where id = v_user_id;


    if not found
       or v_active is not true then

        raise exception
        'TASKVOICE: usuario inexistente o inactivo.';

    end if;


    -- --------------------------------------------------------
    -- Permiso
    -- --------------------------------------------------------

    if v_role not in (
        'admin',
        'supervisor'
    ) then

        raise exception
        'TASKVOICE: no tiene permisos para crear tareas.';

    end if;


    -- --------------------------------------------------------
    -- Título
    -- --------------------------------------------------------

    if p_titulo is null
       or btrim(p_titulo) = '' then

        raise exception
        'TASKVOICE: debe ingresar un título.';

    end if;


    -- --------------------------------------------------------
    -- Usuario asignado obligatorio
    -- --------------------------------------------------------

    if p_asignado_a is null then

        raise exception
        'TASKVOICE: debe asignar un usuario.';

    end if;


    -- --------------------------------------------------------
    -- Verificar usuario asignado
    -- --------------------------------------------------------

    if not exists (

        select 1

        from public.profiles

        where id = p_asignado_a

        and organization_id = v_organization_id

        and activo = true

    ) then

        raise exception
        'TASKVOICE: el usuario asignado no pertenece a la empresa o está inactivo.';

    end if;


    -- --------------------------------------------------------
    -- Prioridad
    -- --------------------------------------------------------

    if p_prioridad not in (

        'baja',
        'normal',
        'alta',
        'urgente'

    ) then

        raise exception
        'TASKVOICE: prioridad inválida.';

    end if;


    -- --------------------------------------------------------
    -- Verificar plantilla
    -- --------------------------------------------------------

    if p_template_id is not null

       and not exists (

            select 1

            from public.task_templates

            where id = p_template_id

            and organization_id = v_organization_id

            and activa = true

       ) then

        raise exception
        'TASKVOICE: plantilla inválida o perteneciente a otra empresa.';

    end if;


    -- --------------------------------------------------------
    -- Crear tarea
    -- --------------------------------------------------------

    insert into public.tasks (

        organization_id,

        template_id,

        titulo,

        descripcion,

        creado_por,

        asignado_a,

        prioridad,

        estado,

        fecha_asignacion,

        fecha_limite,

        hora_limite

    )

    values (

        v_organization_id,

        p_template_id,

        btrim(p_titulo),

        nullif(
            btrim(p_descripcion),
            ''
        ),

        v_user_id,

        p_asignado_a,

        p_prioridad,

        'pendiente',

        now(),

        p_fecha_limite,

        p_hora_limite

    )

    returning id
    into v_task_id;


    return v_task_id;

end;

$$;



-- ============================================================
-- 13. FUNCIÓN: EDITAR TAREA
--
-- Solo admin / supervisor.
--
-- No permite editar tareas completadas/canceladas.
-- No permite reasignar una tarea en progreso.
-- ============================================================

create or replace function public.update_task(

    p_task_id bigint,

    p_titulo text,

    p_asignado_a uuid,

    p_descripcion text default null,

    p_prioridad text default 'normal',

    p_fecha_limite date default null,

    p_hora_limite time default null,

    p_template_id bigint default null

)

returns void

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_user_id uuid;

    v_organization_id uuid;

    v_role text;

    v_active boolean;

    v_task record;

begin

    v_user_id := auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


    select

        organization_id,

        rol,

        activo

    into

        v_organization_id,

        v_role,

        v_active

    from public.profiles

    where id = v_user_id;


    if not found
       or v_active is not true then

        raise exception
        'TASKVOICE: usuario inexistente o inactivo.';

    end if;


    if v_role not in (
        'admin',
        'supervisor'
    ) then

        raise exception
        'TASKVOICE: no tiene permisos para editar tareas.';

    end if;


    -- --------------------------------------------------------
    -- Bloquear fila para evitar modificaciones simultáneas
    -- --------------------------------------------------------

    select *

    into v_task

    from public.tasks

    where id = p_task_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: la tarea no existe.';

    end if;


    -- --------------------------------------------------------
    -- Multiempresa
    -- --------------------------------------------------------

    if v_task.organization_id
       <> v_organization_id then

        raise exception
        'TASKVOICE: la tarea pertenece a otra empresa.';

    end if;


    -- --------------------------------------------------------
    -- Estados finales
    -- --------------------------------------------------------

    if v_task.estado in (

        'completada',
        'cancelada'

    ) then

        raise exception
        'TASKVOICE: una tarea finalizada no puede editarse.';

    end if;


    if p_titulo is null
       or btrim(p_titulo) = '' then

        raise exception
        'TASKVOICE: debe ingresar un título.';

    end if;


    if p_asignado_a is null then

        raise exception
        'TASKVOICE: debe indicar un usuario.';

    end if;


    if not exists (

        select 1

        from public.profiles

        where id = p_asignado_a

        and organization_id = v_organization_id

        and activo = true

    ) then

        raise exception
        'TASKVOICE: usuario asignado inválido.';

    end if;


    -- --------------------------------------------------------
    -- No reasignar mientras está trabajando
    -- --------------------------------------------------------

    if v_task.estado = 'en_progreso'

       and p_asignado_a
           is distinct from v_task.asignado_a then

        raise exception
        'TASKVOICE: no puede reasignar una tarea en progreso.';

    end if;


    if p_prioridad not in (

        'baja',
        'normal',
        'alta',
        'urgente'

    ) then

        raise exception
        'TASKVOICE: prioridad inválida.';

    end if;


    if p_template_id is not null

       and not exists (

            select 1

            from public.task_templates

            where id = p_template_id

            and organization_id = v_organization_id

            and activa = true

       ) then

        raise exception
        'TASKVOICE: plantilla inválida.';

    end if;


    update public.tasks

    set

        titulo =
            btrim(p_titulo),

        descripcion =
            nullif(
                btrim(p_descripcion),
                ''
            ),

        asignado_a =
            p_asignado_a,

        prioridad =
            p_prioridad,

        fecha_limite =
            p_fecha_limite,

        hora_limite =
            p_hora_limite,

        template_id =
            p_template_id

    where id = p_task_id;

end;

$$;



-- ============================================================
-- 14. FUNCIÓN: ACEPTAR TAREA
--
-- Solo el usuario asignado.
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

begin

    v_user_id := auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


    if not exists (

        select 1

        from public.profiles

        where id = v_user_id

        and activo = true

    ) then

        raise exception
        'TASKVOICE: usuario inactivo.';

    end if;


    select *

    into v_task

    from public.tasks

    where id = p_task_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: tarea inexistente.';

    end if;


    if v_task.asignado_a
       is distinct from v_user_id then

        raise exception
        'TASKVOICE: esta tarea no está asignada al usuario actual.';

    end if;


    -- Idempotencia:
    -- si ya fue aceptada, no generamos error.

    if v_task.estado = 'aceptada' then

        return;

    end if;


    if v_task.estado <> 'pendiente' then

        raise exception
        'TASKVOICE: esta tarea no puede aceptarse porque su estado actual es "%".',
        v_task.estado;

    end if;


    update public.tasks

    set estado = 'aceptada'

    where id = p_task_id;

end;

$$;



-- ============================================================
-- 15. FUNCIÓN: INICIAR TAREA
--
-- Crea task_execution.
--
-- Devuelve:
-- execution_id
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

    v_execution_id bigint;

begin

    v_user_id := auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


    if not exists (

        select 1

        from public.profiles

        where id = v_user_id

        and activo = true

    ) then

        raise exception
        'TASKVOICE: usuario inactivo.';

    end if;


    -- --------------------------------------------------------
    -- Bloquear tarea
    -- --------------------------------------------------------

    select *

    into v_task

    from public.tasks

    where id = p_task_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: tarea inexistente.';

    end if;


    if v_task.asignado_a
       is distinct from v_user_id then

        raise exception
        'TASKVOICE: esta tarea no está asignada al usuario actual.';

    end if;


    -- --------------------------------------------------------
    -- Si ya existe ejecución abierta, devolverla.
    --
    -- Esto evita problemas por doble toque del botón.
    -- --------------------------------------------------------

    select id

    into v_execution_id

    from public.task_executions

    where task_id = p_task_id

    and fin is null

    order by id desc

    limit 1;


    if v_execution_id is not null then

        if v_task.estado = 'en_progreso' then

            return v_execution_id;

        else

            raise exception
            'TASKVOICE: existe una ejecución abierta pero la tarea no está en progreso.';

        end if;

    end if;


    -- --------------------------------------------------------
    -- Estados desde los cuales se puede iniciar
    -- --------------------------------------------------------

    if v_task.estado not in (

        'pendiente',
        'aceptada',
        'vencida'

    ) then

        raise exception
        'TASKVOICE: no puede iniciar una tarea con estado "%".',
        v_task.estado;

    end if;


    -- --------------------------------------------------------
    -- Crear ejecución
    -- --------------------------------------------------------

    insert into public.task_executions (

        task_id,

        user_id,

        inicio

    )

    values (

        p_task_id,

        v_user_id,

        now()

    )

    returning id
    into v_execution_id;


    -- --------------------------------------------------------
    -- Cambiar estado
    -- --------------------------------------------------------

    update public.tasks

    set estado = 'en_progreso'

    where id = p_task_id;


    return v_execution_id;

end;

$$;



-- ============================================================
-- 16. FUNCIÓN: COMPLETAR TAREA
--
-- Guarda:
--
-- descripción
-- transcripción
-- audio_path
-- fecha/hora final
--
-- NO GPS.
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

    v_description text;

    v_transcription text;

    v_audio_path text;

    v_expected_prefix text;

begin

    v_user_id := auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


    if not exists (

        select 1

        from public.profiles

        where id = v_user_id

        and activo = true

    ) then

        raise exception
        'TASKVOICE: usuario inactivo.';

    end if;


    -- --------------------------------------------------------
    -- Bloquear ejecución
    -- --------------------------------------------------------

    select *

    into v_execution

    from public.task_executions

    where id = p_execution_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: ejecución inexistente.';

    end if;


    if v_execution.user_id
       is distinct from v_user_id then

        raise exception
        'TASKVOICE: esta ejecución pertenece a otro usuario.';

    end if;


    -- --------------------------------------------------------
    -- Bloquear tarea
    -- --------------------------------------------------------

    select *

    into v_task

    from public.tasks

    where id = v_execution.task_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: tarea inexistente.';

    end if;


    if v_task.asignado_a
       is distinct from v_user_id then

        raise exception
        'TASKVOICE: la tarea ya no está asignada al usuario actual.';

    end if;


    -- --------------------------------------------------------
    -- Idempotencia
    --
    -- Si ya está terminada correctamente, no repetir.
    -- --------------------------------------------------------

    if v_execution.fin is not null then

        if v_task.estado = 'completada' then

            return;

        end if;


        raise exception
        'TASKVOICE: la ejecución ya tiene fecha de finalización.';

    end if;


    if v_task.estado <> 'en_progreso' then

        raise exception
        'TASKVOICE: la tarea no está en progreso.';

    end if;


    -- --------------------------------------------------------
    -- Normalizar datos
    -- --------------------------------------------------------

    v_description :=
        nullif(
            btrim(p_descripcion),
            ''
        );


    v_transcription :=
        nullif(
            btrim(p_transcripcion),
            ''
        );


    v_audio_path :=
        nullif(
            btrim(p_audio_path),
            ''
        );


    -- --------------------------------------------------------
    -- Requerir algún registro del trabajo realizado
    -- --------------------------------------------------------

    if v_description is null

       and v_transcription is null

       and v_audio_path is null then

        raise exception
        'TASKVOICE: debe registrar una descripción, transcripción o audio antes de completar la tarea.';

    end if;


    -- --------------------------------------------------------
    -- Validar estructura del audio
    --
    -- Debe ser:
    --
    -- organization_id/task_id/execution_id/archivo
    -- --------------------------------------------------------

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

            length(v_expected_prefix)

        ) <> v_expected_prefix then


            raise exception
            'TASKVOICE: ruta de audio inválida.';

        end if;

    end if;


    -- --------------------------------------------------------
    -- Finalizar ejecución
    -- --------------------------------------------------------

    update public.task_executions

    set

        fin =
            now(),

        descripcion =
            v_description,

        transcripcion =
            v_transcription,

        audio_path =
            v_audio_path

    where id = p_execution_id;


    -- --------------------------------------------------------
    -- Completar tarea
    -- --------------------------------------------------------

    update public.tasks

    set estado = 'completada'

    where id = v_task.id;

end;

$$;



-- ============================================================
-- 17. FUNCIÓN: CANCELAR TAREA
--
-- Solo:
--
-- admin
-- supervisor
-- ============================================================

create or replace function
public.cancel_task(

    p_task_id bigint,

    p_comentario text default null

)

returns void

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_user_id uuid;

    v_organization_id uuid;

    v_role text;

    v_active boolean;

    v_task record;

    v_comment text;

begin

    v_user_id := auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


    select

        organization_id,

        rol,

        activo

    into

        v_organization_id,

        v_role,

        v_active

    from public.profiles

    where id = v_user_id;


    if not found
       or v_active is not true then

        raise exception
        'TASKVOICE: usuario inexistente o inactivo.';

    end if;


    if v_role not in (

        'admin',
        'supervisor'

    ) then

        raise exception
        'TASKVOICE: no tiene permisos para cancelar tareas.';

    end if;


    select *

    into v_task

    from public.tasks

    where id = p_task_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: tarea inexistente.';

    end if;


    if v_task.organization_id
       <> v_organization_id then

        raise exception
        'TASKVOICE: la tarea pertenece a otra empresa.';

    end if;


    if v_task.estado = 'cancelada' then

        return;

    end if;


    if v_task.estado = 'completada' then

        raise exception
        'TASKVOICE: una tarea completada no puede cancelarse.';

    end if;


    -- --------------------------------------------------------
    -- Cerrar ejecución abierta si existiera
    -- --------------------------------------------------------

    update public.task_executions

    set

        fin = now(),

        descripcion = coalesce(

            descripcion,

            nullif(
                btrim(p_comentario),
                ''
            )

        )

    where task_id = p_task_id

    and fin is null;


    -- --------------------------------------------------------
    -- Comentario para el trigger de historial
    -- --------------------------------------------------------

    v_comment := coalesce(

        nullif(
            btrim(p_comentario),
            ''
        ),

        'Tarea cancelada por supervisor.'

    );


    perform set_config(

        'taskvoice.history_comment',

        v_comment,

        true

    );


    -- --------------------------------------------------------
    -- Cambiar estado
    -- --------------------------------------------------------

    update public.tasks

    set estado = 'cancelada'

    where id = p_task_id;

end;

$$;



-- ============================================================
-- 18. PROTEGER FUNCIONES INTERNAS DE TRIGGER
-- ============================================================

revoke execute
on function public.validate_task_state_transition()
from public, anon, authenticated;


revoke execute
on function public.handle_task_audit()
from public, anon, authenticated;



-- ============================================================
-- 19. PERMISOS - CREATE_TASK
-- ============================================================

revoke execute
on function public.create_task(
    text,
    uuid,
    text,
    text,
    date,
    time without time zone,
    bigint
)
from public, anon;


grant execute
on function public.create_task(
    text,
    uuid,
    text,
    text,
    date,
    time without time zone,
    bigint
)
to authenticated;



-- ============================================================
-- 20. PERMISOS - UPDATE_TASK
-- ============================================================

revoke execute
on function public.update_task(
    bigint,
    text,
    uuid,
    text,
    text,
    date,
    time without time zone,
    bigint
)
from public, anon;


grant execute
on function public.update_task(
    bigint,
    text,
    uuid,
    text,
    text,
    date,
    time without time zone,
    bigint
)
to authenticated;



-- ============================================================
-- 21. PERMISOS - ACCEPT_TASK
-- ============================================================

revoke execute
on function public.accept_task(bigint)
from public, anon;


grant execute
on function public.accept_task(bigint)
to authenticated;



-- ============================================================
-- 22. PERMISOS - START_TASK
-- ============================================================

revoke execute
on function public.start_task(bigint)
from public, anon;


grant execute
on function public.start_task(bigint)
to authenticated;



-- ============================================================
-- 23. PERMISOS - COMPLETE_TASK
-- ============================================================

revoke execute
on function public.complete_task(
    bigint,
    text,
    text,
    text
)
from public, anon;


grant execute
on function public.complete_task(
    bigint,
    text,
    text,
    text
)
to authenticated;



-- ============================================================
-- 24. PERMISOS - CANCEL_TASK
-- ============================================================

revoke execute
on function public.cancel_task(
    bigint,
    text
)
from public, anon;


grant execute
on function public.cancel_task(
    bigint,
    text
)
to authenticated;



-- ============================================================
-- FIN DE 05_business_logic.sql
-- ============================================================