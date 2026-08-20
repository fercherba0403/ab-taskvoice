-- ============================================================
-- TASKVOICE
-- 18_multirol_operational.sql
--
-- ETAPA 2D
-- Habilitación operativa real de:
--   Jefatura + Técnico
--
-- Principios:
-- - NO duplica usuarios.
-- - profiles.rol sigue siendo el rol principal/legacy.
-- - user_roles define capacidades reales.
-- - Administrador NO puede ser técnico.
-- - Jefatura + Técnico sí puede ser asignado y operar como técnico.
-- - NO modifica el flujo grupal ya validado de 13_team_task_flow.sql.
-- - NO modifica reportes.
-- - NO utiliza GPS.
-- ============================================================

reset role;

begin;


-- ============================================================
-- 1. PRECONDICIONES
-- ============================================================

do $$
begin

    if to_regclass(
        'public.user_roles'
    ) is null then

        raise exception
        'TASKVOICE: falta public.user_roles. Ejecute primero 17_user_roles_v2.sql.';

    end if;


    if to_regprocedure(
        'public.has_role(text)'
    ) is null then

        raise exception
        'TASKVOICE: falta public.has_role(text).';

    end if;


    if to_regprocedure(
        'public.has_any_role(text[])'
    ) is null then

        raise exception
        'TASKVOICE: falta public.has_any_role(text[]).';

    end if;

end;
$$;


-- ============================================================
-- 2. RPC
-- TÉCNICOS ASIGNABLES DE MI EMPRESA
--
-- Importante:
-- user_roles tiene RLS de lectura propia.
-- Por eso el administrador NO debe consultar directamente
-- user_roles desde el navegador para descubrir técnicos.
--
-- Esta RPC:
-- - identifica la empresa por auth.uid()
-- - exige Administrador o Jefatura
-- - devuelve solo usuarios activos con capacidad trabajador
-- - excluye cualquier combinación que contenga admin
-- - incluye:
--      Técnico
--      Jefatura + Técnico
-- ============================================================

create or replace function
public.get_assignable_technicians()
returns table (

    id uuid,

    nombre text,

    apellido text,

    email text,

    rol text,

    profile_type text,

    profile_label text

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


    if not public.has_any_role(
        array[
            'admin',
            'supervisor'
        ]::text[]
    ) then

        raise exception
        'TASKVOICE: no tiene permisos para consultar técnicos.';

    end if;


    return query

    select

        p.id,

        p.nombre,

        p.apellido,

        p.email,

        p.rol,

        case

            when exists (

                select 1

                from public.user_roles ur_supervisor

                where ur_supervisor.user_id =
                    p.id

                  and ur_supervisor.role =
                    'supervisor'

            )
            then
                'jefatura_tecnico'

            else
                'tecnico'

        end
            as profile_type,

        case

            when exists (

                select 1

                from public.user_roles ur_supervisor

                where ur_supervisor.user_id =
                    p.id

                  and ur_supervisor.role =
                    'supervisor'

            )
            then
                'Jefatura + Técnico'

            else
                'Técnico'

        end
            as profile_label

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
public.get_assignable_technicians()
from public, anon;


grant execute
on function
public.get_assignable_technicians()
to authenticated;


-- ============================================================
-- 3. HARDENING DE task_assignees
--
-- Toda NUEVA asignación debe apuntar a una persona:
-- - activa
-- - de la misma empresa de la tarea
-- - con user_roles.role = trabajador
-- - sin rol admin
--
-- Esto permite:
--   Técnico
--   Jefatura + Técnico
--
-- Y bloquea:
--   Administrador
--   Jefatura sola
--
-- El trigger NO se ejecuta al cambiar solamente "estado",
-- por lo que no interfiere con el flujo grupal ya validado.
-- ============================================================

create or replace function
public.validate_task_assignee_technician()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$

declare

    v_organization_id uuid;

begin

    select
        t.organization_id

    into
        v_organization_id

    from public.tasks t

    where t.id =
        new.task_id;


    if not found then

        raise exception
        'TASKVOICE: tarea inexistente para la asignación.';

    end if;


    if not exists (

        select 1

        from public.profiles p

        join public.user_roles ur_worker

            on ur_worker.user_id =
                p.id

           and ur_worker.role =
                'trabajador'

        where p.id =
            new.user_id

          and p.organization_id =
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

    ) then

        raise exception
        'TASKVOICE: el usuario asignado no tiene perfil Técnico habilitado o no pertenece a la empresa.';

    end if;


    return new;

end;

$$;


revoke all
on function
public.validate_task_assignee_technician()
from public, anon, authenticated;


drop trigger if exists
task_assignee_validate_technician
on public.task_assignees;


create trigger
task_assignee_validate_technician

before insert

or update of
    task_id,
    user_id

on public.task_assignees

for each row

execute function
public.validate_task_assignee_technician();


-- ============================================================
-- 4. AUTOCREACIÓN DE TAREA
--
-- Reemplaza únicamente la validación legacy:
--     profiles.rol = 'trabajador'
--
-- por capacidad real:
--     has_role('trabajador')
--
-- Así Jefatura + Técnico puede autocrear su tarea.
-- ============================================================

create or replace function
public.create_my_task(

    p_titulo text,

    p_descripcion text default null,

    p_prioridad text default 'normal',

    p_fecha_limite date default null,

    p_hora_limite time without time zone default null,

    p_template_id bigint default null,

    p_location_id bigint default null,

    p_shift_id bigint default null,

    p_ticket_number text default null,

    p_maintenance_type_id bigint default null

)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$

declare

    v_user_id uuid;

    v_organization_id uuid;

    v_active boolean;

    v_task_id bigint;

begin

    -- --------------------------------------------------------
    -- USUARIO
    -- --------------------------------------------------------

    v_user_id :=
        auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


    -- --------------------------------------------------------
    -- PERFIL / EMPRESA
    -- --------------------------------------------------------

    select

        p.organization_id,

        p.activo

    into

        v_organization_id,

        v_active

    from public.profiles p

    where p.id =
        v_user_id;


    if not found
       or v_active is not true then

        raise exception
        'TASKVOICE: usuario inexistente o inactivo.';

    end if;


    -- --------------------------------------------------------
    -- CAPACIDAD TÉCNICO
    -- --------------------------------------------------------

    if not public.has_role(
        'trabajador'
    ) then

        raise exception
        'TASKVOICE: esta función está disponible solamente para técnicos.';

    end if;


    -- --------------------------------------------------------
    -- ADMIN NUNCA PUEDE OPERAR COMO TÉCNICO
    -- Protección adicional ante datos manuales inválidos.
    -- --------------------------------------------------------

    if public.has_role(
        'admin'
    ) then

        raise exception
        'TASKVOICE: un Administrador no puede operar como Técnico.';

    end if;


    if v_organization_id is null then

        raise exception
        'TASKVOICE: el técnico no tiene una empresa asignada.';

    end if;


    -- --------------------------------------------------------
    -- TÍTULO
    -- --------------------------------------------------------

    if p_titulo is null
       or btrim(
            p_titulo
       ) = '' then

        raise exception
        'TASKVOICE: debe ingresar un título.';

    end if;


    -- --------------------------------------------------------
    -- PRIORIDAD
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
    -- PLANTILLA
    -- --------------------------------------------------------

    if p_template_id is not null

       and not exists (

            select 1

            from public.task_templates tt

            where tt.id =
                p_template_id

              and tt.organization_id =
                v_organization_id

              and tt.activa =
                true

       ) then

        raise exception
        'TASKVOICE: plantilla inválida.';

    end if;


    -- --------------------------------------------------------
    -- CATÁLOGOS
    -- --------------------------------------------------------

    perform
    public.validate_task_catalogs(

        v_organization_id,

        p_location_id,

        p_shift_id,

        p_maintenance_type_id

    );


    -- --------------------------------------------------------
    -- CREAR TAREA
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

        hora_limite,

        location_id,

        shift_id,

        ticket_number,

        maintenance_type_id

    )

    values (

        v_organization_id,

        p_template_id,

        btrim(
            p_titulo
        ),

        nullif(
            btrim(
                p_descripcion
            ),
            ''
        ),

        v_user_id,

        v_user_id,

        p_prioridad,

        'pendiente',

        now(),

        p_fecha_limite,

        p_hora_limite,

        p_location_id,

        p_shift_id,

        nullif(
            btrim(
                p_ticket_number
            ),
            ''
        ),

        p_maintenance_type_id

    )

    returning id

    into v_task_id;


    -- --------------------------------------------------------
    -- AUTOASIGNACIÓN
    --
    -- El trigger task_assignee_validate_technician confirma
    -- nuevamente que el usuario posee rol trabajador.
    -- --------------------------------------------------------

    insert into public.task_assignees (

        task_id,

        user_id

    )

    values (

        v_task_id,

        v_user_id

    );


    -- --------------------------------------------------------
    -- AUTOACEPTAR
    -- Mantiene el flujo grupal ya validado.
    -- --------------------------------------------------------

    perform
    public.accept_task(
        v_task_id
    );


    return
        v_task_id;

end;

$$;


revoke all
on function
public.create_my_task(
    text,
    text,
    text,
    date,
    time without time zone,
    bigint,
    bigint,
    bigint,
    text,
    bigint
)
from public, anon;


grant execute
on function
public.create_my_task(
    text,
    text,
    text,
    date,
    time without time zone,
    bigint,
    bigint,
    bigint,
    text,
    bigint
)
to authenticated;


-- ============================================================
-- 5. VALIDACIÓN DE CONSISTENCIA
--
-- No cambia datos históricos.
-- Solo avisa si existen asignaciones antiguas que hoy no
-- correspondan a un perfil Técnico habilitado.
-- ============================================================

do $$

declare

    v_invalid_count integer;

begin

    select count(*)

    into v_invalid_count

    from public.task_assignees ta

    join public.tasks t
        on t.id =
            ta.task_id

    join public.profiles p
        on p.id =
            ta.user_id

    where (

        p.activo is not true

        or p.organization_id
           is distinct from
           t.organization_id

        or not exists (

            select 1

            from public.user_roles ur

            where ur.user_id =
                ta.user_id

              and ur.role =
                'trabajador'

        )

        or exists (

            select 1

            from public.user_roles ur_admin

            where ur_admin.user_id =
                ta.user_id

              and ur_admin.role =
                'admin'

        )

    );


    if v_invalid_count > 0 then

        raise notice
        'TASKVOICE 2D: existen % asignaciones históricas que no cumplen la nueva regla de Técnico. No fueron modificadas.',
        v_invalid_count;

    end if;

end;
$$;


commit;
