-- ============================================================
-- AB TASKVOICE
-- 20_technician_team_operational_report.sql
--
-- AJUSTE DE ETAPA 3B
-- VISIBILIDAD OPERATIVA ENTRE TÉCNICOS
--
-- OBJETIVO
-- - Un Técnico puede consultar las tareas / participaciones de
--   TODOS los técnicos de SU MISMA EMPRESA.
-- - Compatible con Técnico y Jefatura + Técnico.
-- - Nunca permite cruzar organization_id.
-- - No concede permisos de edición sobre tareas ajenas.
-- - No modifica el reporte administrativo.
-- - No modifica RLS existentes.
-- - No utiliza GPS.
--
-- IMPORTANTE
-- La RPC personal creada en 19_technician_operational_report.sql
-- puede permanecer instalada. El frontend Técnico v2 utilizará
-- exclusivamente las RPC nuevas de este archivo.
-- ============================================================

reset role;

begin;


-- ============================================================
-- PRECONDICIONES
-- ============================================================

do $$
begin

    if to_regclass(
        'public.user_roles'
    ) is null then

        raise exception
        'TASKVOICE: falta public.user_roles.';

    end if;


    if to_regprocedure(
        'public.has_role(text)'
    ) is null then

        raise exception
        'TASKVOICE: falta public.has_role(text).';

    end if;

end;
$$;


-- ============================================================
-- TÉCNICOS VISIBLES EN EL REPORTE
--
-- Devuelve solamente Técnicos activos de la misma empresa.
-- Incluye:
-- - Técnico
-- - Jefatura + Técnico
--
-- Excluye cualquier combinación inválida que contenga admin.
-- ============================================================

create or replace function
public.get_technician_report_teammates()
returns table (

    id uuid,

    name text

)
language plpgsql
stable
security definer
set search_path = ''
as $$

declare

    v_user_id uuid;

    v_organization_id uuid;

begin

    v_user_id :=
        auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


    select
        p.organization_id

    into
        v_organization_id

    from public.profiles p

    where p.id =
        v_user_id

      and p.activo =
        true;


    if not found then

        raise exception
        'TASKVOICE: usuario inexistente o inactivo.';

    end if;


    if not public.has_role(
        'trabajador'
    ) then

        raise exception
        'TASKVOICE: esta función está disponible solamente para técnicos.';

    end if;


    if public.has_role(
        'admin'
    ) then

        raise exception
        'TASKVOICE: un Administrador no puede utilizar el reporte Técnico.';

    end if;


    return query

    select

        p.id,

        coalesce(

            nullif(

                btrim(

                    concat_ws(
                        ' ',
                        p.nombre,
                        p.apellido
                    )

                ),

                ''

            ),

            'Técnico'

        )
            as name

    from public.profiles p

    join public.user_roles ur_worker

        on ur_worker.user_id =
            p.id

       and ur_worker.role =
            'trabajador'

    where p.organization_id =
        v_organization_id

      and p.activo =
        true

      and not exists (

            select 1

            from public.user_roles ur_admin

            where ur_admin.user_id =
                p.id

              and ur_admin.role =
                'admin'

      )

    order by

        lower(
            coalesce(
                p.nombre,
                ''
            )
        ),

        lower(
            coalesce(
                p.apellido,
                ''
            )
        ),

        lower(
            coalesce(
                p.email,
                ''
            )
        );

end;
$$;


revoke all
on function
public.get_technician_report_teammates()
from public, anon;


grant execute
on function
public.get_technician_report_teammates()
to authenticated;



-- ============================================================
-- BÚSQUEDA OPERATIVA DE EQUIPO PARA TÉCNICOS
--
-- Una fila = participación de un técnico en una tarea.
--
-- SEGURIDAD:
-- - el usuario autenticado debe tener capacidad trabajador;
-- - todas las tareas quedan limitadas a SU organization_id;
-- - p_technician_id, si se utiliza, también se valida contra
--   la misma empresa y capacidad Técnico.
--
-- Esta función es SOLO DE LECTURA.
-- ============================================================

create or replace function
public.get_technician_team_operational_report(

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
stable
security definer
set search_path = ''
as $$

declare

    v_user_id uuid;

    v_organization_id uuid;

begin

    -- ========================================================
    -- USUARIO AUTENTICADO
    -- ========================================================

    v_user_id :=
        auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


    -- ========================================================
    -- EMPRESA DEL USUARIO
    -- ========================================================

    select
        p.organization_id

    into
        v_organization_id

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
    -- CAPACIDAD TÉCNICO
    -- ========================================================

    if not public.has_role(
        'trabajador'
    ) then

        raise exception
        'TASKVOICE: esta función está disponible solamente para técnicos.';

    end if;


    if public.has_role(
        'admin'
    ) then

        raise exception
        'TASKVOICE: un Administrador no puede utilizar el reporte Técnico.';

    end if;


    -- ========================================================
    -- RANGO
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
    -- FILTRO TÉCNICO
    --
    -- Aunque alguien manipule p_technician_id desde F12,
    -- solamente puede seleccionar un Técnico de la misma empresa.
    -- ========================================================

    if p_technician_id is not null

       and not exists (

            select 1

            from public.profiles target_profile

            join public.user_roles target_worker

                on target_worker.user_id =
                    target_profile.id

               and target_worker.role =
                    'trabajador'

            where target_profile.id =
                p_technician_id

              and target_profile.organization_id =
                v_organization_id

              and target_profile.activo =
                true

              and not exists (

                    select 1

                    from public.user_roles target_admin

                    where target_admin.user_id =
                        target_profile.id

                      and target_admin.role =
                        'admin'

              )

       ) then

        raise exception
        'TASKVOICE: técnico inválido para esta empresa.';

    end if;


    -- ========================================================
    -- RESULTADO
    -- ========================================================

    return query

    select

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

        ta.estado
            as technician_status,

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

        exec.descripcion
            as description,

        exec.transcripcion
            as transcription,

        (
            exec.audio_path is not null
        )
            as has_audio,

        coalesce(
            exec.fin,
            exec.inicio,
            t.fecha_asignacion,
            t.created_at
        )::date
            as report_date


    from public.tasks t


    join public.task_assignees ta

        on ta.task_id =
            t.id


    join public.profiles prof

        on prof.id =
            ta.user_id

       and prof.organization_id =
            v_organization_id

       and prof.activo =
            true


    -- Solamente participantes que realmente tienen capacidad Técnico.
    join public.user_roles ur_worker

        on ur_worker.user_id =
            ta.user_id

       and ur_worker.role =
            'trabajador'


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
    -- EJECUCIÓN COMPARTIDA
    --
    -- Igual que el reporte de equipo administrativo:
    -- la ejecución se asocia a la participación solo cuando el
    -- técnico llegó a en_progreso o completada.
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


    where t.organization_id =
        v_organization_id


    -- Defensa adicional: nunca mostrar una participación de Admin.
    and not exists (

        select 1

        from public.user_roles ur_admin

        where ur_admin.user_id =
            ta.user_id

          and ur_admin.role =
            'admin'

    )


    and (
        p_technician_id is null
        or
        ta.user_id =
            p_technician_id
    )


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


    and (
        p_location_id is null
        or
        t.location_id =
            p_location_id
    )


    and (
        p_shift_id is null
        or
        t.shift_id =
            p_shift_id
    )


    and (
        p_maintenance_type_id is null
        or
        t.maintenance_type_id =
            p_maintenance_type_id
    )


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


    and (
        p_task_status is null
        or
        t.estado =
            p_task_status
    )


    and (
        p_technician_status is null
        or
        ta.estado =
            p_technician_status
    )


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


    order by

        coalesce(
            exec.fin,
            exec.inicio,
            t.fecha_asignacion,
            t.created_at
        )::date desc,

        t.id desc,

        lower(
            coalesce(
                prof.nombre,
                ''
            )
        ),

        lower(
            coalesce(
                prof.apellido,
                ''
            )
        );

end;
$$;


-- ============================================================
-- PERMISOS
-- ============================================================

revoke all
on function
public.get_technician_team_operational_report(
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
public.get_technician_team_operational_report(
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


comment on function
public.get_technician_team_operational_report(
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
is
'TaskVoice: búsqueda operativa de equipo para Técnicos. Permite consultar participaciones de Técnicos de la misma organización, sin permisos de edición sobre tareas ajenas.';


commit;
