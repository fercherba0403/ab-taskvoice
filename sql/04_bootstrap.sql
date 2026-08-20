-- ============================================================
-- TASKVOICE
-- 04_bootstrap.sql
--
-- Inicialización del sistema
--
-- Este archivo se utiliza para crear:
--
--   1. Primera organización
--   2. Primer administrador
--   3. Profile del administrador
--   4. app_metadata de autorización
--
-- REQUIERE:
--
--   01_database.sql
--   02_storage.sql
--   03_auth.sql
--
-- IMPORTANTE:
--
-- Antes de ejecutarlo debe existir el usuario administrador
-- en Supabase Authentication.
--
-- Este proyecto NO utiliza GPS ni geolocalización.
-- ============================================================


do $$

declare

    -- ========================================================
    -- CONFIGURACIÓN
    --
    -- MODIFICAR SOLAMENTE ESTOS VALORES
    -- ========================================================

    v_admin_email text :=
        'fernando.cherbavaz@aubasa.com.ar';


    v_admin_nombre text :=
        'Fernando';


    v_admin_apellido text :=
        'Cherbavaz';


    v_organization_nombre text :=
        'TASKVOICE AUBASA';


    v_organization_razon_social text :=
        null;


    v_organization_email text :=
        null;


    v_organization_telefono text :=
        null;


    -- ========================================================
    -- VARIABLES INTERNAS
    --
    -- NO MODIFICAR
    -- ========================================================

    v_user_id uuid;

    v_organization_id uuid;

    v_existing_profile_organization uuid;

begin


    -- ========================================================
    -- 1. NORMALIZAR EMAIL
    -- ========================================================

    v_admin_email :=
        lower(trim(v_admin_email));


    -- ========================================================
    -- 2. VALIDACIONES DE CONFIGURACIÓN
    -- ========================================================

    if v_admin_email is null
       or v_admin_email = '' then

        raise exception
        'TASKVOICE: Debe indicar el email del administrador.';

    end if;


    if v_admin_nombre is null
       or trim(v_admin_nombre) = '' then

        raise exception
        'TASKVOICE: Debe indicar el nombre del administrador.';

    end if;


    if v_organization_nombre is null
       or trim(v_organization_nombre) = '' then

        raise exception
        'TASKVOICE: Debe indicar el nombre de la organización.';

    end if;



    -- ========================================================
    -- 3. BUSCAR USUARIO EN SUPABASE AUTH
    -- ========================================================

    select id

    into v_user_id

    from auth.users

    where lower(email) = v_admin_email

    limit 1;



    -- ========================================================
    -- 4. VERIFICAR QUE EL USUARIO EXISTA
    -- ========================================================

    if v_user_id is null then

        raise exception

        'TASKVOICE: No existe un usuario en Authentication con el email "%". Cree primero el usuario en Supabase Authentication.',

        v_admin_email;

    end if;



    -- ========================================================
    -- 5. VER SI ESTE USUARIO YA TIENE PROFILE
    --
    -- Esto permite ejecutar nuevamente el script sin crear
    -- otra empresa innecesariamente.
    -- ========================================================

    select organization_id

    into v_existing_profile_organization

    from public.profiles

    where id = v_user_id

    limit 1;



    -- ========================================================
    -- 6. SI YA TIENE EMPRESA, UTILIZAR ESA
    -- ========================================================

    if v_existing_profile_organization is not null then

        v_organization_id :=
            v_existing_profile_organization;


    else

        -- ====================================================
        -- 7. BUSCAR ORGANIZACIÓN EXISTENTE POR NOMBRE
        --
        -- Útil si una ejecución anterior creó la empresa
        -- pero no terminó el proceso completo.
        -- ====================================================

        select id

        into v_organization_id

        from public.organizations

        where lower(nombre) =
              lower(trim(v_organization_nombre))

        order by created_at asc

        limit 1;



        -- ====================================================
        -- 8. SI NO EXISTE, CREAR ORGANIZACIÓN
        -- ====================================================

        if v_organization_id is null then

            insert into public.organizations (

                nombre,

                razon_social,

                email,

                telefono,

                activo

            )

            values (

                trim(v_organization_nombre),

                nullif(
                    trim(v_organization_razon_social),
                    ''
                ),

                case

                    when v_organization_email is null
                    then null

                    else lower(
                        nullif(
                            trim(v_organization_email),
                            ''
                        )
                    )

                end,

                nullif(
                    trim(v_organization_telefono),
                    ''
                ),

                true

            )

            returning id
            into v_organization_id;

        end if;

    end if;



    -- ========================================================
    -- 9. CREAR O ACTUALIZAR PROFILE DEL ADMINISTRADOR
    -- ========================================================

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

        v_user_id,

        v_organization_id,

        trim(v_admin_nombre),

        coalesce(
            trim(v_admin_apellido),
            ''
        ),

        v_admin_email,

        'admin',

        true,

        now(),

        now()

    )

    on conflict (id)

    do update set

        organization_id =
            excluded.organization_id,

        nombre =
            excluded.nombre,

        apellido =
            excluded.apellido,

        email =
            excluded.email,

        rol =
            'admin',

        activo =
            true,

        updated_at =
            now();



    -- ========================================================
    -- 10. ACTUALIZAR APP_METADATA
    --
    -- Guardamos:
    --
    -- organization_id
    -- role
    --
    -- Esto NO se guarda en user_metadata porque esos
    -- metadatos pueden ser modificados por el usuario.
    -- ========================================================

    update auth.users

    set raw_app_meta_data =

        coalesce(
            raw_app_meta_data,
            '{}'::jsonb
        )

        ||

        jsonb_build_object(

            'organization_id',
            v_organization_id::text,

            'role',
            'admin'

        )

    where id = v_user_id;



    -- ========================================================
    -- 11. ACTUALIZAR USER_METADATA BÁSICO
    --
    -- Estos datos NO se utilizan para autorización.
    --
    -- Solamente:
    --
    -- nombre
    -- apellido
    -- ========================================================

    update auth.users

    set raw_user_meta_data =

        coalesce(
            raw_user_meta_data,
            '{}'::jsonb
        )

        ||

        jsonb_build_object(

            'nombre',
            trim(v_admin_nombre),

            'apellido',
            coalesce(
                trim(v_admin_apellido),
                ''
            )

        )

    where id = v_user_id;



    -- ========================================================
    -- 12. CONFIRMACIÓN
    -- ========================================================

    raise notice
    '==============================================';


    raise notice
    'TASKVOICE - BOOTSTRAP COMPLETADO';


    raise notice
    'Organización: %',
    v_organization_nombre;


    raise notice
    'Organization ID: %',
    v_organization_id;


    raise notice
    'Administrador: % %',
    v_admin_nombre,
    v_admin_apellido;


    raise notice
    'Email: %',
    v_admin_email;


    raise notice
    'User ID: %',
    v_user_id;


    raise notice
    'Rol: admin';


    raise notice
    '==============================================';


end $$;


-- ============================================================
-- FIN DE 04_bootstrap.sql
-- ============================================================