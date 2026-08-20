-- ============================================================
-- TASKVOICE
-- 06_test_worker.sql
--
-- SOLO PARA DESARROLLO / PRUEBAS
--
-- Vincula un usuario existente de Supabase Auth
-- como trabajador de la misma organización que
-- nuestro administrador inicial.
--
-- NO utilizar para altas normales en producción.
-- ============================================================


do $$

declare

    -- ========================================================
    -- CONFIGURACIÓN
    -- MODIFICAR ESTOS DATOS
    -- ========================================================

    v_admin_email text :=
        'fernando.cherbavaz@aubasa.com.ar';


    v_worker_email text :=
        'trabajador@test.com';


    v_worker_nombre text :=
        'Trabajador';


    v_worker_apellido text :=
        'Prueba';


    -- ========================================================
    -- VARIABLES INTERNAS
    -- ========================================================

    v_organization_id uuid;

    v_worker_id uuid;

begin


    -- ========================================================
    -- 1. NORMALIZAR EMAILS
    -- ========================================================

    v_admin_email :=
        lower(trim(v_admin_email));


    v_worker_email :=
        lower(trim(v_worker_email));


    -- ========================================================
    -- 2. OBTENER ORGANIZACIÓN DEL ADMINISTRADOR
    -- ========================================================

    select organization_id

    into v_organization_id

    from public.profiles

    where lower(email) = v_admin_email

      and rol = 'admin'

      and activo = true

    limit 1;


    if v_organization_id is null then

        raise exception
        'TASKVOICE: no se encontró administrador activo con email "%".',
        v_admin_email;

    end if;


    -- ========================================================
    -- 3. BUSCAR TRABAJADOR EN AUTH
    -- ========================================================

    select id

    into v_worker_id

    from auth.users

    where lower(email) = v_worker_email

    limit 1;


    if v_worker_id is null then

        raise exception
        'TASKVOICE: primero debe crear "%" en Authentication -> Users.',
        v_worker_email;

    end if;


    -- ========================================================
    -- 4. CREAR / ACTUALIZAR PROFILE
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

        v_worker_id,

        v_organization_id,

        trim(v_worker_nombre),

        coalesce(
            trim(v_worker_apellido),
            ''
        ),

        v_worker_email,

        'trabajador',

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
            'trabajador',

        activo =
            true,

        updated_at =
            now();


    -- ========================================================
    -- 5. APP_METADATA
    --
    -- Datos de autorización
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
            'trabajador'

        )

    where id = v_worker_id;


    -- ========================================================
    -- 6. USER_METADATA
    --
    -- Solo información descriptiva.
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
            trim(v_worker_nombre),

            'apellido',
            coalesce(
                trim(v_worker_apellido),
                ''
            )

        )

    where id = v_worker_id;


    -- ========================================================
    -- 7. RESULTADO
    -- ========================================================

    raise notice
    '==============================================';


    raise notice
    'TASKVOICE - TRABAJADOR DE PRUEBA CONFIGURADO';


    raise notice
    'Email: %',
    v_worker_email;


    raise notice
    'User ID: %',
    v_worker_id;


    raise notice
    'Organization ID: %',
    v_organization_id;


    raise notice
    'Rol: trabajador';


    raise notice
    '==============================================';


end $$;


-- ============================================================
-- FIN
-- ============================================================