-- ============================================================
-- TASKVOICE
-- 07_multi_assignment.sql
--
-- Migración:
--   - Lugares
--   - Turnos
--   - Tipos de mantenimiento
--   - Número de ticket
--   - Asignación múltiple de técnicos
--   - Ejecución individual por técnico
--
-- COMPATIBLE CON:
--   01_database.sql
--   02_storage.sql
--   03_auth.sql
--   04_bootstrap.sql
--   05_business_logic.sql
--
-- NO UTILIZA GPS.
-- ============================================================

begin;


-- ============================================================
-- 1. CATÁLOGO DE LUGARES
-- ============================================================

create table if not exists public.locations (

    id bigint
        generated always as identity
        primary key,

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    nombre text not null,

    activo boolean not null
        default true,

    orden integer not null
        default 0,

    created_at timestamptz not null
        default now(),

    updated_at timestamptz not null
        default now(),

    constraint locations_nombre_not_blank
        check (btrim(nombre) <> '')

);


create unique index if not exists
idx_locations_org_nombre_unique
on public.locations (
    organization_id,
    lower(nombre)
);


create index if not exists
idx_locations_organization
on public.locations(organization_id);


create index if not exists
idx_locations_active
on public.locations(
    organization_id,
    activo
);


-- ============================================================
-- 2. CATÁLOGO DE TURNOS
-- ============================================================

create table if not exists public.shifts (

    id bigint
        generated always as identity
        primary key,

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    nombre text not null,

    activo boolean not null
        default true,

    orden integer not null
        default 0,

    created_at timestamptz not null
        default now(),

    updated_at timestamptz not null
        default now(),

    constraint shifts_nombre_not_blank
        check (btrim(nombre) <> '')

);


create unique index if not exists
idx_shifts_org_nombre_unique
on public.shifts (
    organization_id,
    lower(nombre)
);


create index if not exists
idx_shifts_organization
on public.shifts(organization_id);


create index if not exists
idx_shifts_active
on public.shifts(
    organization_id,
    activo
);


-- ============================================================
-- 3. TIPOS DE MANTENIMIENTO
-- ============================================================

create table if not exists
public.maintenance_types (

    id bigint
        generated always as identity
        primary key,

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    nombre text not null,

    activo boolean not null
        default true,

    orden integer not null
        default 0,

    created_at timestamptz not null
        default now(),

    updated_at timestamptz not null
        default now(),

    constraint maintenance_types_nombre_not_blank
        check (btrim(nombre) <> '')

);


create unique index if not exists
idx_maintenance_types_org_nombre_unique
on public.maintenance_types (
    organization_id,
    lower(nombre)
);


create index if not exists
idx_maintenance_types_organization
on public.maintenance_types(
    organization_id
);


create index if not exists
idx_maintenance_types_active
on public.maintenance_types(
    organization_id,
    activo
);


-- ============================================================
-- 4. TRIGGERS updated_at PARA CATÁLOGOS
-- ============================================================

drop trigger if exists
locations_updated_at
on public.locations;


create trigger locations_updated_at

before update

on public.locations

for each row

execute function
public.update_updated_at();


drop trigger if exists
shifts_updated_at
on public.shifts;


create trigger shifts_updated_at

before update

on public.shifts

for each row

execute function
public.update_updated_at();


drop trigger if exists
maintenance_types_updated_at
on public.maintenance_types;


create trigger maintenance_types_updated_at

before update

on public.maintenance_types

for each row

execute function
public.update_updated_at();


-- ============================================================
-- 5. NUEVOS CAMPOS DE TASKS
--
-- Son NULLABLES para mantener compatibilidad con tareas
-- existentes.
-- ============================================================

alter table public.tasks
add column if not exists location_id bigint
references public.locations(id)
on delete restrict;


alter table public.tasks
add column if not exists shift_id bigint
references public.shifts(id)
on delete restrict;


alter table public.tasks
add column if not exists ticket_number text;


alter table public.tasks
add column if not exists maintenance_type_id bigint
references public.maintenance_types(id)
on delete restrict;


-- ============================================================
-- 6. VALIDAR TICKET VACÍO
-- ============================================================

do $$

begin

    if not exists (

        select 1

        from pg_constraint

        where conname =
            'tasks_ticket_number_not_blank'

    ) then

        alter table public.tasks

        add constraint
        tasks_ticket_number_not_blank

        check (

            ticket_number is null

            or btrim(ticket_number) <> ''

        );

    end if;

end $$;


-- ============================================================
-- 7. ÍNDICES NUEVOS DE TASKS
-- ============================================================

create index if not exists
idx_tasks_location
on public.tasks(location_id);


create index if not exists
idx_tasks_shift
on public.tasks(shift_id);


create index if not exists
idx_tasks_maintenance_type
on public.tasks(maintenance_type_id);


create index if not exists
idx_tasks_ticket
on public.tasks(
    organization_id,
    ticket_number
);


-- ============================================================
-- 8. TASK_ASSIGNEES
--
-- Relación:
--
-- TASK N <-> N PROFILES
--
-- También mantiene estado individual de cada técnico.
-- ============================================================

create table if not exists
public.task_assignees (

    task_id bigint not null
        references public.tasks(id)
        on delete cascade,

    user_id uuid not null
        references public.profiles(id)
        on delete restrict,

    estado text not null
        default 'pendiente',

    assigned_at timestamptz not null
        default now(),

    accepted_at timestamptz,

    started_at timestamptz,

    completed_at timestamptz,

    created_at timestamptz not null
        default now(),

    updated_at timestamptz not null
        default now(),

    primary key (
        task_id,
        user_id
    ),

    constraint task_assignees_estado_check
        check (
            estado in (
                'pendiente',
                'aceptada',
                'en_progreso',
                'completada',
                'cancelada'
            )
        )

);


create index if not exists
idx_task_assignees_user
on public.task_assignees(user_id);


create index if not exists
idx_task_assignees_task_estado
on public.task_assignees(
    task_id,
    estado
);


create index if not exists
idx_task_assignees_user_estado
on public.task_assignees(
    user_id,
    estado
);


-- ============================================================
-- 9. updated_at TASK_ASSIGNEES
-- ============================================================

drop trigger if exists
task_assignees_updated_at
on public.task_assignees;


create trigger task_assignees_updated_at

before update

on public.task_assignees

for each row

execute function
public.update_updated_at();


-- ============================================================
-- 10. MIGRAR ASIGNACIONES EXISTENTES
--
-- tasks.asignado_a
--          ↓
-- task_assignees
--
-- NO BORRAMOS asignado_a.
-- ============================================================

insert into public.task_assignees (

    task_id,

    user_id,

    estado,

    assigned_at,

    accepted_at,

    started_at,

    completed_at

)

select

    t.id,

    t.asignado_a,

    case

        when t.estado = 'aceptada'
            then 'aceptada'

        when t.estado = 'en_progreso'
            then 'en_progreso'

        when t.estado = 'completada'
            then 'completada'

        when t.estado = 'cancelada'
            then 'cancelada'

        else
            'pendiente'

    end,

    coalesce(
        t.fecha_asignacion,
        t.created_at
    ),

    case

        when t.estado in (
            'aceptada',
            'en_progreso',
            'completada'
        )

        then coalesce(
            (
                select min(e.inicio)

                from public.task_executions e

                where e.task_id = t.id

                and e.user_id =
                    t.asignado_a
            ),
            t.fecha_asignacion,
            t.created_at
        )

        else null

    end,

    case

        when t.estado in (
            'en_progreso',
            'completada'
        )

        then (

            select min(e.inicio)

            from public.task_executions e

            where e.task_id = t.id

            and e.user_id =
                t.asignado_a

        )

        else null

    end,

    case

        when t.estado = 'completada'

        then coalesce(
            (
                select max(e.fin)

                from public.task_executions e

                where e.task_id = t.id

                and e.user_id =
                    t.asignado_a
            ),
            t.updated_at
        )

        else null

    end

from public.tasks t

where t.asignado_a is not null

on conflict (
    task_id,
    user_id
)

do nothing;


-- ============================================================
-- 11. UNA EJECUCIÓN ABIERTA POR TÉCNICO / TAREA
--
-- Antes:
--    una ejecución abierta por tarea
--
-- Ahora:
--    Juan  → una abierta
--    Pedro → una abierta
-- ============================================================

drop index if exists
public.idx_task_executions_one_open;


create unique index if not exists
idx_task_executions_one_open_per_user

on public.task_executions(
    task_id,
    user_id
)

where fin is null;


-- ============================================================
-- 12. HELPER:
-- ¿ESTOY ASIGNADO A ESTA TAREA?
-- ============================================================

create or replace function
public.is_task_assignee(
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


-- ============================================================
-- 13. HELPER:
-- ¿LA TAREA ES DE MI EMPRESA?
-- ============================================================

create or replace function
public.task_belongs_to_my_org(
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

        from public.tasks t

        join public.profiles p
            on p.id = auth.uid()

        where t.id =
            p_task_id

        and t.organization_id =
            p.organization_id

        and p.activo = true

    );

$$;


revoke execute
on function public.is_task_assignee(bigint)
from public, anon;


revoke execute
on function public.task_belongs_to_my_org(bigint)
from public, anon;


grant execute
on function public.is_task_assignee(bigint)
to authenticated;


grant execute
on function public.task_belongs_to_my_org(bigint)
to authenticated;


-- ============================================================
-- 14. RLS CATÁLOGOS
-- ============================================================

alter table public.locations
enable row level security;


alter table public.shifts
enable row level security;


alter table public.maintenance_types
enable row level security;


alter table public.task_assignees
enable row level security;


-- ============================================================
-- 15. POLICIES DE CATÁLOGOS
--
-- De momento SOLO lectura desde frontend.
-- La administración se hará posteriormente en Configuración.
-- ============================================================

drop policy if exists
"taskvoice_locations_select"
on public.locations;


create policy
"taskvoice_locations_select"

on public.locations

for select

to authenticated

using (

    organization_id =
        public.get_my_organization_id()

);


drop policy if exists
"taskvoice_shifts_select"
on public.shifts;


create policy
"taskvoice_shifts_select"

on public.shifts

for select

to authenticated

using (

    organization_id =
        public.get_my_organization_id()

);


drop policy if exists
"taskvoice_maintenance_types_select"
on public.maintenance_types;


create policy
"taskvoice_maintenance_types_select"

on public.maintenance_types

for select

to authenticated

using (

    organization_id =
        public.get_my_organization_id()

);


grant select
on public.locations
to authenticated;


grant select
on public.shifts
to authenticated;


grant select
on public.maintenance_types
to authenticated;


-- ============================================================
-- 16. TASK_ASSIGNEES - SELECT
-- ============================================================

drop policy if exists
"taskvoice_task_assignees_select"
on public.task_assignees;


create policy
"taskvoice_task_assignees_select"

on public.task_assignees

for select

to authenticated

using (

    user_id = auth.uid()

    or (

        public.is_supervisor()

        and public.task_belongs_to_my_org(
            task_id
        )

    )

);


grant select
on public.task_assignees
to authenticated;


revoke insert, update, delete
on public.task_assignees
from authenticated;


-- ============================================================
-- 17. REEMPLAZAR POLICY SELECT TASKS
-- ============================================================

drop policy if exists
"usuarios pueden ver tareas autorizadas"
on public.tasks;


drop policy if exists
"taskvoice_tasks_select"
on public.tasks;


create policy
"taskvoice_tasks_select"

on public.tasks

for select

to authenticated

using (

    organization_id =
        public.get_my_organization_id()

    and (

        public.is_supervisor()

        or public.is_task_assignee(id)

    )

);


-- ============================================================
-- 18. REEMPLAZAR POLICY EXECUTIONS
-- ============================================================

drop policy if exists
"usuarios pueden ver ejecuciones autorizadas"
on public.task_executions;


drop policy if exists
"taskvoice_executions_select"
on public.task_executions;


create policy
"taskvoice_executions_select"

on public.task_executions

for select

to authenticated

using (

    public.task_belongs_to_my_org(
        task_id
    )

    and (

        user_id = auth.uid()

        or public.is_supervisor()

    )

);


-- ============================================================
-- 19. REEMPLAZAR POLICY HISTORY
-- ============================================================

drop policy if exists
"usuarios pueden ver historial autorizado"
on public.task_history;


drop policy if exists
"taskvoice_history_select"
on public.task_history;


create policy
"taskvoice_history_select"

on public.task_history

for select

to authenticated

using (

    public.task_belongs_to_my_org(
        task_id
    )

    and (

        public.is_supervisor()

        or public.is_task_assignee(
            task_id
        )

    )

);


-- ============================================================
-- 20. SINCRONIZAR ESTADO GENERAL DE TAREA
--
-- Ejemplo:
--
-- Juan   completada
-- Pedro  completada
-- Carlos en_progreso
--
-- Tarea = en_progreso
--
-- Cuando los 3 completan:
-- Tarea = completada
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

    v_total integer;

    v_pending integer;

    v_accepted integer;

    v_progress integer;

    v_completed integer;

    v_new_state text;

begin

    select estado

    into v_current_state

    from public.tasks

    where id = p_task_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: tarea inexistente.';

    end if;


    -- Estado final manual.

    if v_current_state =
        'cancelada' then

        return;

    end if;


    select

        count(*),

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

        v_total,

        v_pending,

        v_accepted,

        v_progress,

        v_completed

    from public.task_assignees

    where task_id =
        p_task_id;


    if v_total = 0 then

        return;

    end if;


    if v_completed = v_total then

        v_new_state :=
            'completada';


    elsif (
        v_progress > 0
        or v_completed > 0
    ) then

        v_new_state :=
            'en_progreso';


    elsif v_current_state = 'vencida' then

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


revoke execute
on function public.sync_task_state(bigint)
from public, anon, authenticated;


-- ============================================================
-- 21. AJUSTAR TRANSICIONES DE ESTADO
--
-- aceptada → pendiente puede ocurrir si se cambia el equipo
-- antes de iniciar la tarea.
-- ============================================================

create or replace function
public.validate_task_state_transition()

returns trigger

language plpgsql

set search_path = ''

as $$

begin

    if new.estado =
       old.estado then

        return new;

    end if;


    if old.estado = 'pendiente'

       and new.estado in (

            'aceptada',
            'en_progreso',
            'cancelada',
            'vencida'

       ) then

        return new;

    end if;


    if old.estado = 'aceptada'

       and new.estado in (

            'pendiente',
            'en_progreso',
            'cancelada',
            'vencida'

       ) then

        return new;

    end if;


    if old.estado = 'en_progreso'

       and new.estado in (

            'completada',
            'cancelada'

       ) then

        return new;

    end if;


    if old.estado = 'vencida'

       and new.estado in (

            'en_progreso',
            'cancelada'

       ) then

        return new;

    end if;


    raise exception

        'TASKVOICE: transición de estado no permitida: % -> %',

        old.estado,

        new.estado;

end;

$$;


-- ============================================================
-- 22. AUDITORÍA GENERAL DE TASKS
--
-- Quitamos dependencia de asignado_a.
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

    v_actor :=
        auth.uid();


    if v_actor is not null

       and not exists (

            select 1

            from public.profiles

            where id =
                v_actor

       ) then

        v_actor :=
            null;

    end if;


    v_comment :=
        nullif(
            current_setting(
                'taskvoice.history_comment',
                true
            ),
            ''
        );


    -- ========================================================
    -- TAREA CREADA
    -- ========================================================

    if tg_op = 'INSERT' then

        insert into public.task_history (

            task_id,

            user_id,

            accion,

            estado_anterior,

            estado_nuevo

        )

        values (

            new.id,

            v_actor,

            'creada',

            null,

            new.estado

        );


        return new;

    end if;


    -- ========================================================
    -- EDICIÓN
    -- ========================================================

    if (

        new.titulo,

        new.descripcion,

        new.prioridad,

        new.fecha_limite,

        new.hora_limite,

        new.template_id,

        new.location_id,

        new.shift_id,

        new.ticket_number,

        new.maintenance_type_id

    )

    is distinct from

    (

        old.titulo,

        old.descripcion,

        old.prioridad,

        old.fecha_limite,

        old.hora_limite,

        old.template_id,

        old.location_id,

        old.shift_id,

        old.ticket_number,

        old.maintenance_type_id

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
    -- CAMBIO DE ESTADO GENERAL
    -- ========================================================

    if new.estado
       is distinct from
       old.estado then

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


        -- ----------------------------------------------------
        -- Todos los técnicos terminaron.
        -- Avisar al creador.
        -- ----------------------------------------------------

        if new.estado =
            'completada'

           and new.creado_por
               is not null

           and new.creado_por
               is distinct from
               v_actor then

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

                'Todos los técnicos completaron la tarea: '
                    || new.titulo,

                'tarea_completada'

            );

        end if;


        -- ----------------------------------------------------
        -- Cancelación.
        -- Avisar a todos los técnicos.
        -- ----------------------------------------------------

        if new.estado =
            'cancelada' then

            insert into public.notifications (

                organization_id,

                user_id,

                task_id,

                titulo,

                mensaje,

                tipo

            )

            select

                new.organization_id,

                ta.user_id,

                new.id,

                'Tarea cancelada',

                'Se canceló la tarea: '
                    || new.titulo,

                'tarea_cancelada'

            from public.task_assignees ta

            where ta.task_id =
                new.id

            and ta.user_id
                is distinct from
                v_actor;

        end if;

    end if;


    return new;

end;

$$;


-- ============================================================
-- 23. AUDITORÍA DE TÉCNICOS
-- ============================================================

create or replace function
public.handle_task_assignee_audit()

returns trigger

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_actor uuid;

    v_task_id bigint;

    v_user_id uuid;

    v_org_id uuid;

    v_task_title text;

    v_user_name text;

begin

    v_actor :=
        auth.uid();


    if tg_op = 'DELETE' then

        v_task_id :=
            old.task_id;

        v_user_id :=
            old.user_id;

    else

        v_task_id :=
            new.task_id;

        v_user_id :=
            new.user_id;

    end if;


    select

        t.organization_id,

        t.titulo

    into

        v_org_id,

        v_task_title

    from public.tasks t

    where t.id =
        v_task_id;


    select

        concat_ws(
            ' ',
            p.nombre,
            p.apellido
        )

    into v_user_name

    from public.profiles p

    where p.id =
        v_user_id;


    -- ========================================================
    -- ASIGNACIÓN
    -- ========================================================

    if tg_op = 'INSERT' then

        insert into public.task_history (

            task_id,

            user_id,

            accion,

            comentario

        )

        values (

            v_task_id,

            v_actor,

            'tecnico_asignado',

            'Técnico asignado: '
                || coalesce(
                    v_user_name,
                    v_user_id::text
                )

        );


        if v_user_id
           is distinct from
           v_actor then

            insert into public.notifications (

                organization_id,

                user_id,

                task_id,

                titulo,

                mensaje,

                tipo

            )

            values (

                v_org_id,

                v_user_id,

                v_task_id,

                'Nueva tarea asignada',

                'Se te asignó la tarea: '
                    || v_task_title,

                'tarea_asignada'

            );

        end if;


        return new;

    end if;


    -- ========================================================
    -- DESASIGNACIÓN
    -- ========================================================

    if tg_op = 'DELETE' then

        insert into public.task_history (

            task_id,

            user_id,

            accion,

            comentario

        )

        values (

            v_task_id,

            v_actor,

            'tecnico_desasignado',

            'Técnico desasignado: '
                || coalesce(
                    v_user_name,
                    v_user_id::text
                )

        );


        if v_user_id
           is distinct from
           v_actor then

            insert into public.notifications (

                organization_id,

                user_id,

                task_id,

                titulo,

                mensaje,

                tipo

            )

            values (

                v_org_id,

                v_user_id,

                v_task_id,

                'Tarea desasignada',

                'Ya no estás asignado a la tarea: '
                    || v_task_title,

                'tarea_desasignada'

            );

        end if;


        return old;

    end if;


    -- ========================================================
    -- ESTADO INDIVIDUAL
    -- ========================================================

    if new.estado
       is distinct from
       old.estado then

        insert into public.task_history (

            task_id,

            user_id,

            accion,

            estado_anterior,

            estado_nuevo,

            comentario

        )

        values (

            new.task_id,

            v_actor,

            'estado_tecnico',

            old.estado,

            new.estado,

            coalesce(
                v_user_name,
                v_user_id::text
            )

        );

    end if;


    return new;

end;

$$;


drop trigger if exists
task_assignee_audit_trigger
on public.task_assignees;


create trigger
task_assignee_audit_trigger

after insert
or delete
or update of estado

on public.task_assignees

for each row

execute function
public.handle_task_assignee_audit();


revoke execute
on function public.handle_task_assignee_audit()
from public, anon, authenticated;


-- ============================================================
-- 24. VALIDAR CATÁLOGO
-- Helper interno.
-- ============================================================

create or replace function
public.validate_task_catalogs(

    p_organization_id uuid,

    p_location_id bigint,

    p_shift_id bigint,

    p_maintenance_type_id bigint

)

returns void

language plpgsql

security definer

set search_path = ''

as $$

begin

    if p_location_id is not null

       and not exists (

            select 1

            from public.locations

            where id =
                p_location_id

            and organization_id =
                p_organization_id

            and activo = true

       ) then

        raise exception
        'TASKVOICE: lugar inválido.';

    end if;


    if p_shift_id is not null

       and not exists (

            select 1

            from public.shifts

            where id =
                p_shift_id

            and organization_id =
                p_organization_id

            and activo = true

       ) then

        raise exception
        'TASKVOICE: turno inválido.';

    end if;


    if p_maintenance_type_id
       is not null

       and not exists (

            select 1

            from public.maintenance_types

            where id =
                p_maintenance_type_id

            and organization_id =
                p_organization_id

            and activo = true

       ) then

        raise exception
        'TASKVOICE: tipo de mantenimiento inválido.';

    end if;

end;

$$;


revoke execute
on function public.validate_task_catalogs(
    uuid,
    bigint,
    bigint,
    bigint
)
from public, anon, authenticated;


-- ============================================================
-- 25. CREATE_TASK_MULTI
-- ============================================================

create or replace function
public.create_task_multi(

    p_titulo text,

    p_asignados uuid[],

    p_descripcion text default null,

    p_prioridad text default 'normal',

    p_fecha_limite date default null,

    p_hora_limite time default null,

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

    v_role text;

    v_active boolean;

    v_task_id bigint;

    v_valid_users integer;

begin

    v_user_id :=
        auth.uid();


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

    where id =
        v_user_id;


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
        'TASKVOICE: no tiene permisos para crear tareas.';

    end if;


    if p_titulo is null
       or btrim(p_titulo) = '' then

        raise exception
        'TASKVOICE: debe ingresar un título.';

    end if;


    if p_asignados is null
       or cardinality(p_asignados) = 0 then

        raise exception
        'TASKVOICE: debe seleccionar al menos un técnico.';

    end if;


    if array_position(
        p_asignados,
        null
    ) is not null then

        raise exception
        'TASKVOICE: lista de técnicos inválida.';

    end if;


    if (

        select count(
            distinct value
        )

        from unnest(
            p_asignados
        ) as value

    ) <> cardinality(
        p_asignados
    ) then

        raise exception
        'TASKVOICE: hay técnicos repetidos.';

    end if;


    select count(*)

    into v_valid_users

    from public.profiles

    where id =
        any(p_asignados)

    and organization_id =
        v_organization_id

    and activo = true;


    if v_valid_users
       <> cardinality(
            p_asignados
       ) then

        raise exception
        'TASKVOICE: uno o más técnicos son inválidos o pertenecen a otra empresa.';

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

            where id =
                p_template_id

            and organization_id =
                v_organization_id

            and activa = true

       ) then

        raise exception
        'TASKVOICE: plantilla inválida.';

    end if;


    perform
    public.validate_task_catalogs(

        v_organization_id,

        p_location_id,

        p_shift_id,

        p_maintenance_type_id

    );


    insert into public.tasks (

        organization_id,

        template_id,

        titulo,

        descripcion,

        creado_por,

        -- Compatibilidad temporal.
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

        btrim(p_titulo),

        nullif(
            btrim(p_descripcion),
            ''
        ),

        v_user_id,

        p_asignados[1],

        p_prioridad,

        'pendiente',

        now(),

        p_fecha_limite,

        p_hora_limite,

        p_location_id,

        p_shift_id,

        nullif(
            btrim(p_ticket_number),
            ''
        ),

        p_maintenance_type_id

    )

    returning id
    into v_task_id;


    insert into public.task_assignees (

        task_id,

        user_id

    )

    select

        v_task_id,

        value

    from unnest(
        p_asignados
    ) as value;


    return v_task_id;

end;

$$;


-- ============================================================
-- 26. UPDATE_TASK_MULTI
-- ============================================================

create or replace function
public.update_task_multi(

    p_task_id bigint,

    p_titulo text,

    p_asignados uuid[],

    p_descripcion text default null,

    p_prioridad text default 'normal',

    p_fecha_limite date default null,

    p_hora_limite time default null,

    p_template_id bigint default null,

    p_location_id bigint default null,

    p_shift_id bigint default null,

    p_ticket_number text default null,

    p_maintenance_type_id bigint default null

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

    v_valid_users integer;

    v_current_users uuid[];

    v_new_users uuid[];

    v_assignments_changed boolean;

begin

    v_user_id :=
        auth.uid();


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

    where id =
        v_user_id;


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


    if v_task.organization_id
       <> v_organization_id then

        raise exception
        'TASKVOICE: tarea perteneciente a otra empresa.';

    end if;


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


    if p_asignados is null
       or cardinality(p_asignados) = 0 then

        raise exception
        'TASKVOICE: debe seleccionar al menos un técnico.';

    end if;


    if (

        select count(
            distinct value
        )

        from unnest(
            p_asignados
        ) as value

    ) <> cardinality(
        p_asignados
    ) then

        raise exception
        'TASKVOICE: técnicos duplicados.';

    end if;


    select count(*)

    into v_valid_users

    from public.profiles

    where id =
        any(p_asignados)

    and organization_id =
        v_organization_id

    and activo = true;


    if v_valid_users
       <> cardinality(
            p_asignados
       ) then

        raise exception
        'TASKVOICE: técnico inválido.';

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


    perform
    public.validate_task_catalogs(

        v_organization_id,

        p_location_id,

        p_shift_id,

        p_maintenance_type_id

    );


    select
        coalesce(
            array_agg(
                user_id
                order by user_id
            ),
            '{}'::uuid[]
        )

    into v_current_users

    from public.task_assignees

    where task_id =
        p_task_id;


    select
        coalesce(
            array_agg(
                value
                order by value
            ),
            '{}'::uuid[]
        )

    into v_new_users

    from (

        select distinct
            unnest(
                p_asignados
            ) as value

    ) s;


    v_assignments_changed :=
        v_current_users
        is distinct from
        v_new_users;


    if v_task.estado =
        'en_progreso'

       and v_assignments_changed then

        raise exception
        'TASKVOICE: no puede cambiar técnicos mientras la tarea está en progreso.';

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

        -- Compatibilidad temporal.
        asignado_a =
            p_asignados[1],

        prioridad =
            p_prioridad,

        fecha_limite =
            p_fecha_limite,

        hora_limite =
            p_hora_limite,

        template_id =
            p_template_id,

        location_id =
            p_location_id,

        shift_id =
            p_shift_id,

        ticket_number =
            nullif(
                btrim(p_ticket_number),
                ''
            ),

        maintenance_type_id =
            p_maintenance_type_id

    where id =
        p_task_id;


    if v_assignments_changed then

        delete from public.task_assignees

        where task_id =
            p_task_id

        and not (
            user_id =
            any(p_asignados)
        );


        insert into public.task_assignees (

            task_id,

            user_id

        )

        select

            p_task_id,

            value

        from unnest(
            p_asignados
        ) as value

        on conflict (
            task_id,
            user_id
        )

        do nothing;


        perform
        public.sync_task_state(
            p_task_id
        );

    end if;

end;

$$;


-- ============================================================
-- 27. MANTENER CREATE_TASK LEGACY
--
-- El frontend actual sigue funcionando mientras lo migramos.
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

    v_task_id bigint;

begin

    v_task_id :=
        public.create_task_multi(

            p_titulo =>
                p_titulo,

            p_asignados =>
                array[p_asignado_a],

            p_descripcion =>
                p_descripcion,

            p_prioridad =>
                p_prioridad,

            p_fecha_limite =>
                p_fecha_limite,

            p_hora_limite =>
                p_hora_limite,

            p_template_id =>
                p_template_id

        );


    return v_task_id;

end;

$$;


-- ============================================================
-- 28. MANTENER UPDATE_TASK LEGACY
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

begin

    perform
    public.update_task_multi(

        p_task_id =>
            p_task_id,

        p_titulo =>
            p_titulo,

        p_asignados =>
            array[p_asignado_a],

        p_descripcion =>
            p_descripcion,

        p_prioridad =>
            p_prioridad,

        p_fecha_limite =>
            p_fecha_limite,

        p_hora_limite =>
            p_hora_limite,

        p_template_id =>
            p_template_id

    );

end;

$$;


-- ============================================================
-- 29. ACCEPT_TASK
--
-- Aceptación individual.
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

        and activo = true

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
-- 30. START_TASK
--
-- Inicio individual por técnico.
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

        and activo = true

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
        'completada' then

        raise exception
        'TASKVOICE: este técnico ya completó la tarea.';

    end if;


    if v_assignment.estado =
        'cancelada' then

        raise exception
        'TASKVOICE: asignación cancelada.';

    end if;


    select id

    into v_execution_id

    from public.task_executions

    where task_id =
        p_task_id

    and user_id =
        v_user_id

    and fin is null

    order by id desc

    limit 1;


    if v_execution_id
       is not null then

        return
            v_execution_id;

    end if;


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


    update public.task_assignees

    set

        estado =
            'en_progreso',

        accepted_at =
            coalesce(
                accepted_at,
                now()
            ),

        started_at =
            coalesce(
                started_at,
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


    return
        v_execution_id;

end;

$$;


-- ============================================================
-- 31. COMPLETE_TASK
--
-- Cada técnico completa SU ejecución.
--
-- La tarea global pasa a completada cuando TODOS terminaron.
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

begin

    v_user_id :=
        auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


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


    if v_execution.user_id
       is distinct from
       v_user_id then

        raise exception
        'TASKVOICE: ejecución perteneciente a otro usuario.';

    end if;


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
        'TASKVOICE: el usuario ya no está asignado a esta tarea.';

    end if;


    if v_execution.fin
       is not null

       and v_assignment.estado =
           'completada' then

        return;

    end if;


    if v_assignment.estado
       <> 'en_progreso' then

        raise exception
        'TASKVOICE: primero debe iniciar la tarea.';

    end if;


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


    if v_description is null

       and v_transcription is null

       and v_audio_path is null then

        raise exception
        'TASKVOICE: debe registrar una descripción, transcripción o audio.';

    end if;


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

    where id =
        p_execution_id;


    update public.task_assignees

    set

        estado =
            'completada',

        completed_at =
            now()

    where task_id =
        v_task.id

    and user_id =
        v_user_id;


    perform
    public.sync_task_state(
        v_task.id
    );

end;

$$;


-- ============================================================
-- 32. CANCEL_TASK
--
-- Cancela la tarea completa.
-- Técnicos ya completados conservan "completada".
-- El resto pasa a "cancelada".
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

    v_user_id :=
        auth.uid();


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

    where id =
        v_user_id;


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
        'TASKVOICE: sin permisos para cancelar tareas.';

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


    if v_task.organization_id
       <> v_organization_id then

        raise exception
        'TASKVOICE: tarea perteneciente a otra empresa.';

    end if;


    if v_task.estado =
        'cancelada' then

        return;

    end if;


    if v_task.estado =
        'completada' then

        raise exception
        'TASKVOICE: una tarea completada no puede cancelarse.';

    end if;


    v_comment :=
        coalesce(

            nullif(
                btrim(p_comentario),
                ''
            ),

            'Tarea cancelada.'

        );


    -- Cerrar ejecuciones abiertas.

    update public.task_executions

    set

        fin =
            now(),

        descripcion =
            coalesce(
                descripcion,
                v_comment
            )

    where task_id =
        p_task_id

    and fin is null;


    -- Técnicos que todavía no completaron.

    update public.task_assignees

    set estado =
        'cancelada'

    where task_id =
        p_task_id

    and estado <>
        'completada';


    perform set_config(

        'taskvoice.history_comment',

        v_comment,

        true

    );


    update public.tasks

    set estado =
        'cancelada'

    where id =
        p_task_id;

end;

$$;


-- ============================================================
-- 33. PERMISOS NUEVAS RPC
-- ============================================================

revoke execute
on function public.create_task_multi(
    text,
    uuid[],
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
on function public.create_task_multi(
    text,
    uuid[],
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


revoke execute
on function public.update_task_multi(
    bigint,
    text,
    uuid[],
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
on function public.update_task_multi(
    bigint,
    text,
    uuid[],
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
-- FIN
-- ============================================================

commit;