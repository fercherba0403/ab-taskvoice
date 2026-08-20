-- ============================================================
-- TASKVOICE
-- ============================================================
-- TASKVOICE
-- 17_user_roles.sql
--
-- ETAPA 2A - BASE MULTIROL COMPATIBLE
--
-- OBJETIVO:
-- - Preparar soporte para más de un perfil/rol por usuario.
-- - NO modificar todavía profiles.rol.
-- - NO modificar Auth app_metadata.
-- - NO modificar RLS/RPC existentes.
-- - NO cambiar el comportamiento visible de TaskVoice.
--
-- IMPORTANTE SOBRE NOMBRES:
-- Los códigos internos se conservan por compatibilidad:
--
--   admin       -> Administrador
--   supervisor  -> Jefatura
--   trabajador  -> Técnico
--
-- Es decir: desde ahora podemos mostrar "Jefatura" y "Técnico"
-- en la interfaz, pero internamente seguimos usando los códigos
-- supervisor/trabajador hasta completar la migración multirol.
-- ============================================================


reset role;

begin;


-- ============================================================
-- 1. VALIDAR LOS ROLES LEGACY EXISTENTES
--
-- Si apareciera un valor inesperado en profiles.rol,
-- detenemos la migración en vez de copiar datos incorrectos.
-- ============================================================

do $$
begin

    if exists (

        select 1
        from public.profiles p
        where p.rol is null
           or p.rol not in (
                'admin',
                'supervisor',
                'trabajador'
           )

    ) then

        raise exception
            'TASKVOICE 17_user_roles: existe un valor de profiles.rol no reconocido.';

    end if;

end
$$;


-- ============================================================
-- 2. TABLA DE ROLES POR USUARIO
-- ============================================================

create table if not exists public.user_roles (

    user_id uuid not null,

    role text not null,

    is_primary boolean not null
        default false,

    created_at timestamptz not null
        default now(),

    constraint user_roles_pkey
        primary key (
            user_id,
            role
        ),

    constraint user_roles_user_id_fkey
        foreign key (
            user_id
        )
        references public.profiles (
            id
        )
        on delete cascade,

    constraint user_roles_role_check
        check (
            role in (
                'admin',
                'supervisor',
                'trabajador'
            )
        )

);


comment on table public.user_roles is
'Roles habilitados por usuario. Códigos internos legacy: admin, supervisor, trabajador. Etiquetas visibles: Administrador, Jefatura, Técnico.';


comment on column public.user_roles.is_primary is
'Rol principal/legacy del usuario durante la migración multirol. profiles.rol se conserva temporalmente como fuente compatible.';


-- ============================================================
-- 3. BACKFILL
--
-- Copia el rol actual de cada usuario.
--
-- Ejemplo:
--
-- profiles:
--   Pedro | trabajador
--
-- user_roles:
--   Pedro | trabajador | true
--
-- No modifica ninguna fila de profiles.
-- ============================================================

insert into public.user_roles (
    user_id,
    role,
    is_primary
)

select

    p.id,

    p.rol,

    not exists (

        select 1
        from public.user_roles ur_primary
        where ur_primary.user_id = p.id
          and ur_primary.is_primary = true

    )

from public.profiles p

where p.rol in (
    'admin',
    'supervisor',
    'trabajador'
)

on conflict (
    user_id,
    role
)
do nothing;


-- ============================================================
-- 4. UN SOLO ROL PRINCIPAL POR USUARIO
-- ============================================================

create unique index if not exists
    user_roles_one_primary_per_user_idx

on public.user_roles (
    user_id
)

where is_primary = true;


create index if not exists
    user_roles_role_idx

on public.user_roles (
    role
);


-- ============================================================
-- 5. ETIQUETA VISIBLE DEL ROL
--
-- Mantiene separados:
-- - código interno
-- - nombre que ve la persona
-- ============================================================

create or replace function
public.role_display_name(
    p_role text
)
returns text
language sql
immutable
set search_path = ''
as $$

    select case p_role

        when 'admin'
            then 'Administrador'

        when 'supervisor'
            then 'Jefatura'

        when 'trabajador'
            then 'Técnico'

        else p_role

    end;

$$;


-- ============================================================
-- 6. ¿EL USUARIO AUTENTICADO TIENE ESTE ROL?
--
-- ESTA FUNCIÓN TODAVÍA NO REEMPLAZA NINGUNA RLS/RPC.
-- Solo queda preparada para las etapas posteriores.
-- ============================================================

create or replace function
public.has_role(
    p_role text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$

    select
        auth.uid() is not null
        and exists (

            select 1

            from public.user_roles ur

            join public.profiles p
                on p.id = ur.user_id

            where ur.user_id = auth.uid()

              and ur.role = p_role

              and p.activo = true

        );

$$;


-- ============================================================
-- 7. ¿TIENE ALGUNO DE ESTOS ROLES?
-- ============================================================

create or replace function
public.has_any_role(
    p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$

    select
        auth.uid() is not null
        and exists (

            select 1

            from public.user_roles ur

            join public.profiles p
                on p.id = ur.user_id

            where ur.user_id = auth.uid()

              and ur.role = any (
                    p_roles
              )

              and p.activo = true

        );

$$;


-- ============================================================
-- 8. OBTENER MIS ROLES
--
-- Será útil más adelante para:
-- - detectar usuario con uno o varios perfiles
-- - pantalla "Elegir perfil"
-- - selector/cambio de perfil
--
-- Por ahora no lo usa ningún frontend.
-- ============================================================

create or replace function
public.get_my_roles()
returns table (

    role text,

    label text,

    is_primary boolean

)
language sql
stable
security definer
set search_path = ''
as $$

    select

        ur.role,

        public.role_display_name(
            ur.role
        )
            as label,

        ur.is_primary

    from public.user_roles ur

    join public.profiles p
        on p.id = ur.user_id

    where ur.user_id =
        auth.uid()

      and p.activo =
        true

    order by

        ur.is_primary desc,

        case ur.role
            when 'admin' then 1
            when 'supervisor' then 2
            when 'trabajador' then 3
            else 99
        end;

$$;


-- ============================================================
-- 9. PERMISOS DE LAS FUNCIONES
-- ============================================================

revoke all
on function public.role_display_name(text)
from public, anon;


grant execute
on function public.role_display_name(text)
to authenticated;


revoke all
on function public.has_role(text)
from public, anon;


grant execute
on function public.has_role(text)
to authenticated;


revoke all
on function public.has_any_role(text[])
from public, anon;


grant execute
on function public.has_any_role(text[])
to authenticated;


revoke all
on function public.get_my_roles()
from public, anon;


grant execute
on function public.get_my_roles()
to authenticated;


-- ============================================================
-- 10. RLS EN user_roles
--
-- En esta etapa:
-- - cada usuario puede LEER solamente sus propios roles
-- - no puede insertarlos, editarlos ni borrarlos desde frontend
-- - service_role seguirá pudiendo administrarlos desde Edge
--   Functions en la próxima etapa.
-- ============================================================

alter table public.user_roles
enable row level security;


drop policy if exists
"user_roles_read_own"
on public.user_roles;


create policy
"user_roles_read_own"

on public.user_roles

for select

to authenticated

using (
    user_id = auth.uid()
);


revoke all
on table public.user_roles
from anon;


revoke insert, update, delete
on table public.user_roles
from authenticated;


grant select
on table public.user_roles
to authenticated;


-- ============================================================
-- 11. VALIDACIÓN DEL BACKFILL
--
-- Cada profiles.rol actual debe existir también en user_roles.
-- Si no ocurre, se revierte toda la transacción.
-- ============================================================

do $$
begin

    if exists (

        select 1

        from public.profiles p

        where not exists (

            select 1

            from public.user_roles ur

            where ur.user_id =
                p.id

              and ur.role =
                p.rol

        )

    ) then

        raise exception
            'TASKVOICE 17_user_roles: el backfill de roles quedó incompleto.';

    end if;

end
$$;


commit;


-- ============================================================
-- FIN
--
-- DESPUÉS DE EJECUTAR:
--
-- profiles.rol SIGUE EXACTAMENTE IGUAL.
--
-- Todavía NO se cambia:
-- - create-user
-- - manage-user
-- - login
-- - requireRole
-- - RLS de tareas
-- - RPC de tareas
-- - reportes
-- - panel Admin
-- - panel Técnico
--
-- Esta migración solamente crea la base compatible multirol.
-- ============================================================