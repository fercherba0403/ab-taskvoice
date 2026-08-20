-- ============================================================
-- TASKVOICE
-- 16_reports_team.sql
--
-- Adaptación del reporte operativo al modelo de trabajo en equipo.
--
-- OBJETIVO
-- - Mantener UNA FILA POR TÉCNICO ASIGNADO.
-- - Compartir la MISMA ejecución de la tarea entre los técnicos
--   que realmente participaron.
-- - Asociar la ejecución solamente a técnicos que realmente
--   llegaron a participar: en_progreso o completada.
-- - Mantener la firma actual de get_operational_report(...)
--   para no romper el frontend existente.
--
-- IMPORTANTE
-- - Una intervención real = un execution_id distinto.
-- - Una participación = una fila de técnico con execution_id.
-- - Los KPI globales no deben contar filas como intervenciones:
--   deben contar DISTINCT execution_id.
-- ============================================================

begin;


create or replace function
public.get_operational_report(

    p_date_from date default null,

    p_date_to date default null,

    p_technician_id uuid default null,

    p_location_id bigint default null,

    p_shift_id bigint default null,

    p_maintenance_type_id bigint default null,

    p_work_type_id bigint default null,

    p_task_status text default null,

    p_technician_status text default null,

    p_ticket text default null

)
returns table (

    task_id bigint,

    task_title text,

    ticket_number text,

    location_id bigint,

    location_name text,

    shift_id bigint,

    shift_name text,

    maintenance_type_id bigint,

    maintenance_type_name text,

    priority text,

    task_status text,

    technician_id uuid,

    technician_name text,

    technician_email text,

    technician_status text,

    execution_id bigint,

    started_at timestamptz,

    finished_at timestamptz,

    duration_minutes integer,

    work_type_ids bigint[],

    work_type_names text[],

    description text,

    transcription text,

    has_audio boolean,

    report_date date

)

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_user_id uuid;

    v_organization_id uuid;

    v_role text;

begin


    -- ========================================================
    -- USUARIO
    -- ========================================================

    v_user_id :=
        auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;



    -- ========================================================
    -- PERFIL / ORGANIZACIÓN
    -- ========================================================

    select

        p.organization_id,

        p.rol

    into

        v_organization_id,

        v_role

    from public.profiles p

    where p.id =
        v_user_id

    and p.activo =
        true;



    if not found then

        raise exception
        'TASKVOICE: usuario inexistente o inactivo.';

    end if;



    -- ========================================================
    -- SOLO ADMIN / SUPERVISOR
    -- ========================================================

    if v_role not in (

        'admin',

        'supervisor'

    ) then

        raise exception
        'TASKVOICE: no tiene permisos para consultar reportes.';

    end if;



    -- ========================================================
    -- VALIDAR RANGO
    -- ========================================================

    if (

        p_date_from is not null

        and

        p_date_to is not null

        and

        p_date_from >
        p_date_to

    ) then

        raise exception
        'TASKVOICE: el rango de fechas es inválido.';

    end if;



    -- ========================================================
    -- RESULTADO
    --
    -- Sigue siendo una fila por técnico asignado.
    -- La diferencia es que la ejecución se busca POR TAREA,
    -- no por task + user.
    --
    -- Técnicos rechazados/cancelados conservan su fila
    -- administrativa, pero NO reciben datos de ejecución.
    -- ========================================================

    return query


    select


        -- ----------------------------------------------------
        -- TAREA
        -- ----------------------------------------------------

        t.id
            as task_id,


        t.titulo
            as task_title,


        t.ticket_number,


        t.location_id,


        coalesce(
            loc.nombre,
            'Sin lugar'
        )
            as location_name,


        t.shift_id,


        coalesce(
            sh.nombre,
            'Sin turno'
        )
            as shift_name,


        t.maintenance_type_id,


        coalesce(
            mt.nombre,
            'Sin tipo'
        )
            as maintenance_type_name,


        t.prioridad
            as priority,


        t.estado
            as task_status,



        -- ----------------------------------------------------
        -- TÉCNICO / PARTICIPACIÓN
        -- ----------------------------------------------------

        ta.user_id
            as technician_id,


        coalesce(

            nullif(

                btrim(

                    concat_ws(
                        ' ',
                        prof.nombre,
                        prof.apellido
                    )

                ),

                ''

            ),

            'Técnico'

        )
            as technician_name,


        prof.email
            as technician_email,


        ta.estado
            as technician_status,



        -- ----------------------------------------------------
        -- EJECUCIÓN COMPARTIDA
        -- ----------------------------------------------------

        exec.id
            as execution_id,


        exec.inicio
            as started_at,


        exec.fin
            as finished_at,


        case

            when
                exec.inicio is not null
                and
                exec.fin is not null

            then

                greatest(

                    0,

                    floor(

                        extract(
                            epoch
                            from (
                                exec.fin
                                -
                                exec.inicio
                            )
                        )
                        /
                        60

                    )::integer

                )

            else
                null

        end
            as duration_minutes,



        -- ----------------------------------------------------
        -- TIPOS DE TRABAJO DE LA EJECUCIÓN COMPARTIDA
        -- ----------------------------------------------------

        coalesce(
            wt_data.work_type_ids,
            '{}'::bigint[]
        )
            as work_type_ids,


        coalesce(
            wt_data.work_type_names,
            '{}'::text[]
        )
            as work_type_names,



        -- ----------------------------------------------------
        -- INFORME COMPARTIDO
        -- ----------------------------------------------------

        exec.descripcion
            as description,


        exec.transcripcion
            as transcription,


        (
            exec.audio_path is not null
        )
            as has_audio,



        -- ----------------------------------------------------
        -- FECHA OPERATIVA
        --
        -- Para participantes:
        -- 1. finalización
        -- 2. inicio
        --
        -- Para rechazados/cancelados o tareas sin ejecución:
        -- 3. asignación
        -- 4. creación
        -- ----------------------------------------------------

        coalesce(
            exec.fin,
            exec.inicio,
            t.fecha_asignacion,
            t.created_at
        )::date
            as report_date



    from public.tasks t



    -- ========================================================
    -- ASIGNACIONES
    -- ========================================================

    join public.task_assignees ta

        on ta.task_id =
           t.id



    -- ========================================================
    -- TÉCNICO
    -- ========================================================

    join public.profiles prof

        on prof.id =
           ta.user_id



    -- ========================================================
    -- CATÁLOGOS
    -- ========================================================

    left join public.locations loc

        on loc.id =
           t.location_id


    left join public.shifts sh

        on sh.id =
           t.shift_id


    left join public.maintenance_types mt

        on mt.id =
           t.maintenance_type_id



    -- ========================================================
    -- ÚLTIMA EJECUCIÓN COMPARTIDA DE LA TAREA
    --
    -- CAMBIO CLAVE:
    -- Antes:
    --     e.task_id = t.id
    --     AND e.user_id = ta.user_id
    --
    -- Ahora:
    --     e.task_id = t.id
    --
    -- De esta forma todos los técnicos que participaron
    -- visualizan la misma intervención.
    --
    -- Sólo en_progreso/completada reciben la ejecución.
    -- Esto también protege datos históricos anteriores al flujo
    -- de equipo, donde puede existir un asignado aún pendiente.
    -- ========================================================

    left join lateral (

        select

            e.id,

            e.inicio,

            e.fin,

            e.descripcion,

            e.transcripcion,

            e.audio_path,

            e.created_at

        from public.task_executions e

        where e.task_id =
            t.id

        and ta.estado in (
            'en_progreso',
            'completada'
        )

        order by

            coalesce(
                e.fin,
                e.inicio,
                e.created_at
            ) desc,

            e.id desc

        limit 1

    ) exec

        on true



    -- ========================================================
    -- TIPOS DE TRABAJO DE ESA EJECUCIÓN
    -- ========================================================

    left join lateral (

        select

            array_agg(

                wt.id

                order by
                    wt.orden,
                    wt.nombre

            )
                as work_type_ids,


            array_agg(

                wt.nombre

                order by
                    wt.orden,
                    wt.nombre

            )
                as work_type_names


        from public.execution_work_types ewt


        join public.work_types wt

            on wt.id =
               ewt.work_type_id


        where ewt.execution_id =
            exec.id

    ) wt_data

        on true



    -- ========================================================
    -- EMPRESA
    -- ========================================================

    where t.organization_id =
        v_organization_id



    -- ========================================================
    -- RANGO DE FECHAS
    -- ========================================================

    and (

        p_date_from is null

        or

        coalesce(
            exec.fin,
            exec.inicio,
            t.fecha_asignacion,
            t.created_at
        )::date >=
        p_date_from

    )


    and (

        p_date_to is null

        or

        coalesce(
            exec.fin,
            exec.inicio,
            t.fecha_asignacion,
            t.created_at
        )::date <=
        p_date_to

    )



    -- ========================================================
    -- TÉCNICO
    -- ========================================================

    and (

        p_technician_id is null

        or

        ta.user_id =
            p_technician_id

    )



    -- ========================================================
    -- LUGAR
    -- ========================================================

    and (

        p_location_id is null

        or

        t.location_id =
            p_location_id

    )



    -- ========================================================
    -- TURNO
    -- ========================================================

    and (

        p_shift_id is null

        or

        t.shift_id =
            p_shift_id

    )



    -- ========================================================
    -- TIPO DE MANTENIMIENTO
    -- ========================================================

    and (

        p_maintenance_type_id is null

        or

        t.maintenance_type_id =
            p_maintenance_type_id

    )



    -- ========================================================
    -- TIPO DE TRABAJO REALIZADO
    --
    -- Sólo devuelve participaciones vinculadas a una ejecución
    -- que contenga el tipo solicitado.
    -- ========================================================

    and (

        p_work_type_id is null

        or

        exists (

            select 1

            from public.execution_work_types filter_ewt

            where filter_ewt.execution_id =
                exec.id

            and filter_ewt.work_type_id =
                p_work_type_id

        )

    )



    -- ========================================================
    -- ESTADO GENERAL
    -- ========================================================

    and (

        p_task_status is null

        or

        t.estado =
            p_task_status

    )



    -- ========================================================
    -- ESTADO INDIVIDUAL
    -- ========================================================

    and (

        p_technician_status is null

        or

        ta.estado =
            p_technician_status

    )



    -- ========================================================
    -- TICKET
    -- ========================================================

    and (

        p_ticket is null

        or

        btrim(
            p_ticket
        ) = ''

        or

        coalesce(
            t.ticket_number,
            ''
        )
        ilike
        '%'
        ||
        btrim(
            p_ticket
        )
        ||
        '%'

    )



    -- ========================================================
    -- ORDEN
    -- ========================================================

    order by

        report_date desc,

        t.id desc,

        technician_name asc;



end;

$$;



-- ============================================================
-- PERMISOS
-- ============================================================

revoke execute

on function

public.get_operational_report(
    date,
    date,
    uuid,
    bigint,
    bigint,
    bigint,
    bigint,
    text,
    text,
    text
)

from public, anon;



grant execute

on function

public.get_operational_report(
    date,
    date,
    uuid,
    bigint,
    bigint,
    bigint,
    bigint,
    text,
    text,
    text
)

to authenticated;


commit;
