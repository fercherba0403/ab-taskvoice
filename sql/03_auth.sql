-- ============================================================
-- TASKVOICE
-- 03_auth.sql
--
-- Integración entre:
--
--   Supabase Auth
--        ↓
--   auth.users
--        ↓
--   public.profiles
--
-- Requiere:
--   01_database.sql
--   02_storage.sql
--
-- IMPORTANTE:
--   El proyecto NO utiliza GPS ni geolocalización.
-- ============================================================


-- ============================================================
-- 1. AGREGAR EMAIL A PROFILES
--
-- Guardamos una copia del email para poder mostrarlo y
-- buscarlo fácilmente desde la aplicación sin consultar
-- directamente el esquema auth.
-- ============================================================

alter table public.profiles
add column if not exists email text;


-- ============================================================
-- 2. ÍNDICE PARA EMAIL
-- ============================================================

create index if not exists idx_profiles_email
on public.profiles(email);


-- ============================================================
-- 3. ÍNDICE COMPUESTO EMPRESA + EMAIL
--
-- Facilitará búsquedas de usuarios dentro de una empresa.
-- ============================================================

create index if not exists idx_profiles_organization_email
on public.profiles(organization_id, email);



-- ============================================================
-- 4. FUNCIÓN AUXILIAR
-- NORMALIZAR ROLES
--
-- Solamente permitimos:
--
--   admin
--   supervisor
--   trabajador
--
-- Ante cualquier otro valor se utilizará trabajador.
-- ============================================================

create or replace function public.normalize_user_role(
    p_role text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$

begin

    if p_role in (
        'admin',
        'supervisor',
        'trabajador'
    ) then

        return p_role;

    end if;

    return 'trabajador';

end;

$$;



-- ============================================================
-- 5. FUNCIÓN PRINCIPAL
-- CREAR PROFILE AL CREAR UN USUARIO AUTH
--
-- IMPORTANTE:
--
-- organization_id y role se leen de:
--
--      raw_app_meta_data
--
-- NO de raw_user_meta_data.
--
-- raw_app_meta_data será establecido posteriormente por
-- nuestro backend / Edge Function administrativa.
-- ============================================================

create or replace function public.handle_new_auth_user()

returns trigger

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_organization_text text;

    v_organization_id uuid;

    v_role text;

    v_nombre text;

    v_apellido text;

begin

    -- --------------------------------------------------------
    -- Obtener organización desde app_metadata
    -- --------------------------------------------------------

    v_organization_text :=
        new.raw_app_meta_data ->> 'organization_id';


    -- --------------------------------------------------------
    -- Si no tiene organización todavía, no intentamos crear
    -- profile.
    --
    -- Esto evita romper altas manuales realizadas desde
    -- Supabase durante configuración y mantenimiento.
    -- --------------------------------------------------------

    if v_organization_text is null
       or trim(v_organization_text) = '' then

        return new;

    end if;


    -- --------------------------------------------------------
    -- Intentar convertir organization_id a UUID
    -- --------------------------------------------------------

    begin

        v_organization_id :=
            v_organization_text::uuid;

    exception

        when invalid_text_representation then

            return new;

    end;


    -- --------------------------------------------------------
    -- Verificar que la organización existe y está activa
    -- --------------------------------------------------------

    if not exists (

        select 1

        from public.organizations

        where id = v_organization_id

        and activo = true

    ) then

        return new;

    end if;


    -- --------------------------------------------------------
    -- Obtener rol desde app_metadata
    -- --------------------------------------------------------

    v_role :=
        public.normalize_user_role(
            new.raw_app_meta_data ->> 'role'
        );


    -- --------------------------------------------------------
    -- Obtener nombre
    --
    -- Admitimos:
    --
    -- nombre
    -- first_name
    --
    -- Si no existe ninguno usamos la parte anterior al @
    -- del email.
    -- --------------------------------------------------------

    v_nombre := coalesce(

        nullif(
            trim(
                new.raw_user_meta_data ->> 'nombre'
            ),
            ''
        ),

        nullif(
            trim(
                new.raw_user_meta_data ->> 'first_name'
            ),
            ''
        ),

        nullif(
            split_part(
                coalesce(new.email, ''),
                '@',
                1
            ),
            ''
        ),

        'Usuario'

    );


    -- --------------------------------------------------------
    -- Obtener apellido
    -- --------------------------------------------------------

    v_apellido := coalesce(

        nullif(
            trim(
                new.raw_user_meta_data ->> 'apellido'
            ),
            ''
        ),

        nullif(
            trim(
                new.raw_user_meta_data ->> 'last_name'
            ),
            ''
        ),

        ''

    );


    -- --------------------------------------------------------
    -- Crear profile
    -- --------------------------------------------------------

    insert into public.profiles (

        id,

        organization_id,

        nombre,

        apellido,

        email,

        rol,

        activo,

        created_at,

        updated_at

    )

    values (

        new.id,

        v_organization_id,

        v_nombre,

        v_apellido,

        lower(new.email),

        v_role,

        true,

        now(),

        now()

    )

    on conflict (id)
    do nothing;


    return new;


exception

    -- --------------------------------------------------------
    -- El trigger de Auth NO debe inutilizar el sistema por
    -- datos incompletos de metadata.
    -- --------------------------------------------------------

    when others then

        raise warning
        'TaskVoice: no se pudo crear profile para usuario %: %',
        new.id,
        sqlerrm;

        return new;

end;

$$;



-- ============================================================
-- 6. CREAR TRIGGER DE NUEVO USUARIO
-- ============================================================

drop trigger if exists
on_auth_user_created
on auth.users;


create trigger on_auth_user_created

after insert

on auth.users

for each row

execute function public.handle_new_auth_user();



-- ============================================================
-- 7. FUNCIÓN PARA SINCRONIZAR DATOS BÁSICOS
--
-- Si cambia:
--
--   email
--   nombre
--   apellido
--
-- actualizamos public.profiles.
--
-- NO modificamos:
--
--   organization_id
--   rol
--
-- porque son datos de autorización.
-- ============================================================

create or replace function public.handle_auth_user_updated()

returns trigger

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_nombre text;

    v_apellido text;

begin

    -- --------------------------------------------------------
    -- Solo actuar si existe un profile
    -- --------------------------------------------------------

    if not exists (

        select 1

        from public.profiles

        where id = new.id

    ) then

        return new;

    end if;


    -- --------------------------------------------------------
    -- Nombre
    --
    -- Si metadata no trae nombre, mantenemos el existente.
    -- --------------------------------------------------------

    v_nombre := coalesce(

        nullif(
            trim(
                new.raw_user_meta_data ->> 'nombre'
            ),
            ''
        ),

        nullif(
            trim(
                new.raw_user_meta_data ->> 'first_name'
            ),
            ''
        ),

        (
            select nombre

            from public.profiles

            where id = new.id
        )

    );


    -- --------------------------------------------------------
    -- Apellido
    -- --------------------------------------------------------

    v_apellido := coalesce(

        nullif(
            trim(
                new.raw_user_meta_data ->> 'apellido'
            ),
            ''
        ),

        nullif(
            trim(
                new.raw_user_meta_data ->> 'last_name'
            ),
            ''
        ),

        (
            select apellido

            from public.profiles

            where id = new.id
        )

    );


    -- --------------------------------------------------------
    -- Actualizar profile
    -- --------------------------------------------------------

    update public.profiles

    set

        email = lower(new.email),

        nombre = v_nombre,

        apellido = v_apellido,

        updated_at = now()

    where id = new.id;


    return new;


exception

    when others then

        raise warning
        'TaskVoice: no se pudo sincronizar profile %: %',
        new.id,
        sqlerrm;

        return new;

end;

$$;



-- ============================================================
-- 8. TRIGGER DE ACTUALIZACIÓN AUTH
-- ============================================================

drop trigger if exists
on_auth_user_updated
on auth.users;


create trigger on_auth_user_updated

after update of
    email,
    raw_user_meta_data

on auth.users

for each row

execute function public.handle_auth_user_updated();



-- ============================================================
-- 9. FUNCIÓN: USUARIO ACTIVO
--
-- Nos servirá en JavaScript y en futuras policies.
-- ============================================================

create or replace function public.is_active_user()

returns boolean

language sql

stable

security definer

set search_path = ''

as $$

    select exists (

        select 1

        from public.profiles

        where id = auth.uid()

        and activo = true

    );

$$;



-- ============================================================
-- 10. FUNCIÓN: OBTENER ROL ACTUAL
-- ============================================================

create or replace function public.get_my_role()

returns text

language sql

stable

security definer

set search_path = ''

as $$

    select rol

    from public.profiles

    where id = auth.uid()

    and activo = true

    limit 1;

$$;



-- ============================================================
-- 11. FUNCIÓN: ¿TIENE PROFILE?
--
-- Nos servirá al iniciar sesión.
-- ============================================================

create or replace function public.has_profile()

returns boolean

language sql

stable

security definer

set search_path = ''

as $$

    select exists (

        select 1

        from public.profiles

        where id = auth.uid()

    );

$$;



-- ============================================================
-- 12. FUNCIÓN: ¿ES TRABAJADOR?
-- ============================================================

create or replace function public.is_worker()

returns boolean

language sql

stable

security definer

set search_path = ''

as $$

    select exists (

        select 1

        from public.profiles

        where id = auth.uid()

        and rol = 'trabajador'

        and activo = true

    );

$$;



-- ============================================================
-- 13. PERMISOS PARA FUNCIONES AUXILIARES
-- ============================================================

revoke all
on function public.get_my_role()
from public;


revoke all
on function public.has_profile()
from public;


revoke all
on function public.is_active_user()
from public;


revoke all
on function public.is_worker()
from public;


grant execute
on function public.get_my_role()
to authenticated;


grant execute
on function public.has_profile()
to authenticated;


grant execute
on function public.is_active_user()
to authenticated;


grant execute
on function public.is_worker()
to authenticated;



-- ============================================================
-- 14. PERMISOS DE PROFILES
--
-- La seguridad real continúa controlada por RLS.
-- ============================================================

grant select
on public.profiles
to authenticated;


grant update
on public.profiles
to authenticated;



-- ============================================================
-- FIN DE 03_auth.sql
-- ============================================================