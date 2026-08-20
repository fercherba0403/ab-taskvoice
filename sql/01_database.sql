-- ============================================================
-- TASKVOICE
-- 01_database.sql
--
-- Base de datos principal
-- PostgreSQL / Supabase
--
-- IMPORTANTE:
-- Este proyecto NO utiliza GPS ni geolocalización.
-- ============================================================


-- ============================================================
-- 1. EXTENSIONES
-- ============================================================

create extension if not exists "pgcrypto";


-- ============================================================
-- 2. ORGANIZATIONS
-- Empresas que utilizan el sistema
-- ============================================================

create table public.organizations (

    id uuid primary key default gen_random_uuid(),

    nombre text not null,

    razon_social text,

    email text,

    telefono text,

    activo boolean not null default true,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()

);


-- ============================================================
-- 3. PROFILES
-- Información adicional de los usuarios de Supabase Auth
-- ============================================================

create table public.profiles (

    id uuid primary key
        references auth.users(id)
        on delete cascade,

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    nombre text not null,

    apellido text not null,

    telefono text,

    rol text not null default 'trabajador',

    activo boolean not null default true,

    avatar_url text,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint profiles_rol_check
        check (
            rol in (
                'admin',
                'supervisor',
                'trabajador'
            )
        )

);


-- ============================================================
-- 4. TASK_TEMPLATES
-- Plantillas reutilizables de tareas
-- ============================================================

create table public.task_templates (

    id bigint generated always as identity primary key,

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    nombre text not null,

    descripcion text,

    activa boolean not null default true,

    created_by uuid
        references public.profiles(id)
        on delete set null,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()

);


-- ============================================================
-- 5. TASKS
-- Tareas concretas asignadas a los usuarios
-- ============================================================

create table public.tasks (

    id bigint generated always as identity primary key,

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    template_id bigint
        references public.task_templates(id)
        on delete set null,

    titulo text not null,

    descripcion text,

    creado_por uuid
        references public.profiles(id)
        on delete set null,

    asignado_a uuid
        references public.profiles(id)
        on delete set null,

    prioridad text not null default 'normal',

    estado text not null default 'pendiente',

    fecha_asignacion timestamptz default now(),

    fecha_limite date,

    hora_limite time,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint tasks_prioridad_check
        check (
            prioridad in (
                'baja',
                'normal',
                'alta',
                'urgente'
            )
        ),

    constraint tasks_estado_check
        check (
            estado in (
                'pendiente',
                'aceptada',
                'en_progreso',
                'completada',
                'cancelada',
                'vencida'
            )
        )

);


-- ============================================================
-- 6. TASK_EXECUTIONS
-- Registro de lo que efectivamente hizo el trabajador
-- ============================================================

create table public.task_executions (

    id bigint generated always as identity primary key,

    task_id bigint not null
        references public.tasks(id)
        on delete cascade,

    user_id uuid not null
        references public.profiles(id)
        on delete restrict,

    inicio timestamptz,

    fin timestamptz,

    descripcion text,

    transcripcion text,

    audio_url text,

    created_at timestamptz not null default now()

);


-- ============================================================
-- 7. TASK_PHOTOS
-- Fotografías asociadas a una ejecución
-- ============================================================

create table public.task_photos (

    id bigint generated always as identity primary key,

    execution_id bigint not null
        references public.task_executions(id)
        on delete cascade,

    storage_path text not null,

    descripcion text,

    created_at timestamptz not null default now()

);


-- ============================================================
-- 8. TASK_HISTORY
-- Historial y auditoría de las tareas
-- ============================================================

create table public.task_history (

    id bigint generated always as identity primary key,

    task_id bigint not null
        references public.tasks(id)
        on delete cascade,

    user_id uuid
        references public.profiles(id)
        on delete set null,

    accion text not null,

    estado_anterior text,

    estado_nuevo text,

    comentario text,

    created_at timestamptz not null default now()

);


-- ============================================================
-- 9. NOTIFICATIONS
-- Notificaciones internas del sistema
-- ============================================================

create table public.notifications (

    id bigint generated always as identity primary key,

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    user_id uuid not null
        references public.profiles(id)
        on delete cascade,

    task_id bigint
        references public.tasks(id)
        on delete cascade,

    titulo text not null,

    mensaje text not null,

    tipo text not null default 'general',

    leida boolean not null default false,

    created_at timestamptz not null default now()

);


-- ============================================================
-- 10. ÍNDICES
-- ============================================================

create index idx_profiles_organization
on public.profiles(organization_id);


create index idx_profiles_rol
on public.profiles(rol);


create index idx_tasks_organization
on public.tasks(organization_id);


create index idx_tasks_asignado
on public.tasks(asignado_a);


create index idx_tasks_estado
on public.tasks(estado);


create index idx_tasks_fecha_limite
on public.tasks(fecha_limite);


create index idx_tasks_created_at
on public.tasks(created_at);


create index idx_task_templates_organization
on public.task_templates(organization_id);


create index idx_executions_task
on public.task_executions(task_id);


create index idx_executions_user
on public.task_executions(user_id);


create index idx_executions_created_at
on public.task_executions(created_at);


create index idx_photos_execution
on public.task_photos(execution_id);


create index idx_history_task
on public.task_history(task_id);


create index idx_history_user
on public.task_history(user_id);


create index idx_notifications_user
on public.notifications(user_id);


create index idx_notifications_task
on public.notifications(task_id);


-- ============================================================
-- 11. FUNCIÓN PARA ACTUALIZAR updated_at
-- ============================================================

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin

    new.updated_at = now();

    return new;

end;
$$;


-- ============================================================
-- 12. TRIGGERS updated_at
-- ============================================================

create trigger organizations_updated_at
before update on public.organizations
for each row
execute function public.update_updated_at();


create trigger profiles_updated_at
before update on public.profiles
for each row
execute function public.update_updated_at();


create trigger task_templates_updated_at
before update on public.task_templates
for each row
execute function public.update_updated_at();


create trigger tasks_updated_at
before update on public.tasks
for each row
execute function public.update_updated_at();


-- ============================================================
-- 13. FUNCIÓN: ORGANIZACIÓN DEL USUARIO ACTUAL
-- ============================================================

create or replace function public.get_my_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$

    select organization_id

    from public.profiles

    where id = auth.uid()

    limit 1;

$$;


-- ============================================================
-- 14. FUNCIÓN: SABER SI EL USUARIO ES ADMIN
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$

    select exists (

        select 1

        from public.profiles

        where id = auth.uid()

        and rol = 'admin'

        and activo = true

    );

$$;


-- ============================================================
-- 15. FUNCIÓN: SABER SI ES ADMIN O SUPERVISOR
-- ============================================================

create or replace function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$

    select exists (

        select 1

        from public.profiles

        where id = auth.uid()

        and rol in ('admin', 'supervisor')

        and activo = true

    );

$$;


-- ============================================================
-- 16. ROW LEVEL SECURITY
-- ============================================================

alter table public.organizations
enable row level security;


alter table public.profiles
enable row level security;


alter table public.task_templates
enable row level security;


alter table public.tasks
enable row level security;


alter table public.task_executions
enable row level security;


alter table public.task_photos
enable row level security;


alter table public.task_history
enable row level security;


alter table public.notifications
enable row level security;


-- ============================================================
-- 17. POLICIES - ORGANIZATIONS
-- ============================================================

create policy "usuarios pueden ver su empresa"

on public.organizations

for select

using (
    id = public.get_my_organization_id()
);


create policy "administrador puede modificar empresa"

on public.organizations

for update

using (
    id = public.get_my_organization_id()
    and public.is_admin()
)

with check (
    id = public.get_my_organization_id()
    and public.is_admin()
);


-- ============================================================
-- 18. POLICIES - PROFILES
-- ============================================================

create policy "usuarios pueden ver perfiles de su empresa"

on public.profiles

for select

using (
    organization_id = public.get_my_organization_id()
);


create policy "administrador puede crear perfiles"

on public.profiles

for insert

with check (
    organization_id = public.get_my_organization_id()
    and public.is_admin()
);


create policy "administrador puede modificar perfiles"

on public.profiles

for update

using (
    organization_id = public.get_my_organization_id()
    and public.is_admin()
)

with check (
    organization_id = public.get_my_organization_id()
    and public.is_admin()
);


-- ============================================================
-- 19. POLICIES - TASK TEMPLATES
-- ============================================================

create policy "usuarios pueden ver plantillas de su empresa"

on public.task_templates

for select

using (
    organization_id = public.get_my_organization_id()
);


create policy "supervisor puede crear plantillas"

on public.task_templates

for insert

with check (
    organization_id = public.get_my_organization_id()
    and public.is_supervisor()
);


create policy "supervisor puede modificar plantillas"

on public.task_templates

for update

using (
    organization_id = public.get_my_organization_id()
    and public.is_supervisor()
)

with check (
    organization_id = public.get_my_organization_id()
    and public.is_supervisor()
);


-- ============================================================
-- 20. POLICIES - TASKS
-- ============================================================

create policy "usuarios pueden ver tareas autorizadas"

on public.tasks

for select

using (

    organization_id = public.get_my_organization_id()

    and (

        asignado_a = auth.uid()

        or public.is_supervisor()

    )

);


create policy "supervisor puede crear tareas"

on public.tasks

for insert

with check (

    organization_id = public.get_my_organization_id()

    and public.is_supervisor()

);


create policy "supervisor puede modificar tareas"

on public.tasks

for update

using (

    organization_id = public.get_my_organization_id()

    and (

        public.is_supervisor()

        or asignado_a = auth.uid()

    )

)

with check (

    organization_id = public.get_my_organization_id()

);


-- ============================================================
-- 21. POLICIES - TASK EXECUTIONS
-- ============================================================

create policy "usuarios pueden ver ejecuciones autorizadas"

on public.task_executions

for select

using (

    exists (

        select 1

        from public.tasks t

        where t.id = task_executions.task_id

        and t.organization_id = public.get_my_organization_id()

        and (

            t.asignado_a = auth.uid()

            or public.is_supervisor()

        )

    )

);


create policy "trabajador puede crear ejecución"

on public.task_executions

for insert

with check (

    user_id = auth.uid()

    and exists (

        select 1

        from public.tasks t

        where t.id = task_executions.task_id

        and t.organization_id = public.get_my_organization_id()

        and t.asignado_a = auth.uid()

    )

);


create policy "usuario puede modificar su ejecución"

on public.task_executions

for update

using (
    user_id = auth.uid()
)

with check (
    user_id = auth.uid()
);


-- ============================================================
-- 22. POLICIES - TASK PHOTOS
-- ============================================================

create policy "usuarios pueden ver fotos autorizadas"

on public.task_photos

for select

using (

    exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id = e.task_id

        where e.id = task_photos.execution_id

        and t.organization_id = public.get_my_organization_id()

        and (

            e.user_id = auth.uid()

            or public.is_supervisor()

        )

    )

);


create policy "usuario puede agregar fotos"

on public.task_photos

for insert

with check (

    exists (

        select 1

        from public.task_executions e

        where e.id = task_photos.execution_id

        and e.user_id = auth.uid()

    )

);


-- ============================================================
-- 23. POLICIES - TASK HISTORY
-- ============================================================

create policy "usuarios pueden ver historial autorizado"

on public.task_history

for select

using (

    exists (

        select 1

        from public.tasks t

        where t.id = task_history.task_id

        and t.organization_id = public.get_my_organization_id()

        and (

            t.asignado_a = auth.uid()

            or public.is_supervisor()

        )

    )

);


create policy "usuarios pueden registrar historial"

on public.task_history

for insert

with check (

    user_id = auth.uid()

    and exists (

        select 1

        from public.tasks t

        where t.id = task_history.task_id

        and t.organization_id = public.get_my_organization_id()

    )

);


-- ============================================================
-- 24. POLICIES - NOTIFICATIONS
-- ============================================================

create policy "usuario puede ver sus notificaciones"

on public.notifications

for select

using (

    user_id = auth.uid()

    and organization_id = public.get_my_organization_id()

);


create policy "usuario puede marcar notificacion"

on public.notifications

for update

using (
    user_id = auth.uid()
)

with check (
    user_id = auth.uid()
);


-- ============================================================
-- FIN DEL ARCHIVO
-- ============================================================