-- ============================================================
-- TASKVOICE
-- 08_catalog_data.sql
--
-- Catálogos iniciales:
--
--   Lugares
--   Turnos
--   Tipos de mantenimiento
--
-- REQUIERE:
--   07_multi_assignment.sql
--
-- Este archivo es idempotente:
-- puede ejecutarse nuevamente sin duplicar registros.
-- ============================================================


begin;


do $$

declare

    -- ========================================================
    -- CONFIGURACIÓN
    -- ========================================================

    v_organization_name text :=
        'TASKVOICE AUBASA';


    -- ========================================================
    -- VARIABLES INTERNAS
    -- ========================================================

    v_organization_id uuid;

begin


    -- ========================================================
    -- 1. BUSCAR ORGANIZACIÓN
    -- ========================================================

    select id

    into v_organization_id

    from public.organizations

    where lower(
        btrim(nombre)
    ) = lower(
        btrim(v_organization_name)
    )

    and activo = true

    order by created_at

    limit 1;


    if v_organization_id is null then

        raise exception

        'TASKVOICE: no se encontró la organización activa "%".',

        v_organization_name;

    end if;



    -- ========================================================
    -- 2. LUGARES
    -- ========================================================

    insert into public.locations (

        organization_id,

        nombre,

        activo,

        orden

    )

    select

        v_organization_id,

        catalogo.nombre,

        true,

        catalogo.orden

    from (

        values

            ('Dock Sud',       1),
            ('Bernal',         2),
            ('Quilmes',        3),
            ('Berazategui',    4),
            ('Hudson',         5),
            ('CCM',            6),
            ('Polo Hudson',    7),
            ('Gutierrez',      8),
            ('CAE Hudson',     9),
            ('Obrador',       10),
            ('Villa Elisa',   11),
            ('Traza',         12),
            ('Ing Allan',     13)

    ) as catalogo(
        nombre,
        orden
    )

    where not exists (

        select 1

        from public.locations l

        where l.organization_id =
            v_organization_id

        and lower(
            btrim(l.nombre)
        ) = lower(
            btrim(catalogo.nombre)
        )

    );


    -- --------------------------------------------------------
    -- Si ya existían, aseguramos activo y orden correcto.
    -- --------------------------------------------------------

    update public.locations l

    set

        activo = true,

        orden = catalogo.orden

    from (

        values

            ('Dock Sud',       1),
            ('Bernal',         2),
            ('Quilmes',        3),
            ('Berazategui',    4),
            ('Hudson',         5),
            ('CCM',            6),
            ('Polo Hudson',    7),
            ('Gutierrez',      8),
            ('CAE Hudson',     9),
            ('Obrador',       10),
            ('Villa Elisa',   11),
            ('Traza',         12),
            ('Ing Allan',     13)

    ) as catalogo(
        nombre,
        orden
    )

    where l.organization_id =
        v_organization_id

    and lower(
        btrim(l.nombre)
    ) = lower(
        btrim(catalogo.nombre)
    );



    -- ========================================================
    -- 3. TURNOS
    -- ========================================================

    insert into public.shifts (

        organization_id,

        nombre,

        activo,

        orden

    )

    select

        v_organization_id,

        catalogo.nombre,

        true,

        catalogo.orden

    from (

        values

            ('Mañana', 1),
            ('Tarde',  2),
            ('Noche',  3)

    ) as catalogo(
        nombre,
        orden
    )

    where not exists (

        select 1

        from public.shifts s

        where s.organization_id =
            v_organization_id

        and lower(
            btrim(s.nombre)
        ) = lower(
            btrim(catalogo.nombre)
        )

    );


    update public.shifts s

    set

        activo = true,

        orden = catalogo.orden

    from (

        values

            ('Mañana', 1),
            ('Tarde',  2),
            ('Noche',  3)

    ) as catalogo(
        nombre,
        orden
    )

    where s.organization_id =
        v_organization_id

    and lower(
        btrim(s.nombre)
    ) = lower(
        btrim(catalogo.nombre)
    );



    -- ========================================================
    -- 4. TIPOS DE MANTENIMIENTO
    -- ========================================================

    insert into public.maintenance_types (

        organization_id,

        nombre,

        activo,

        orden

    )

    select

        v_organization_id,

        catalogo.nombre,

        true,

        catalogo.orden

    from (

        values

            ('Correctivo', 1),
            ('Preventivo', 2)

    ) as catalogo(
        nombre,
        orden
    )

    where not exists (

        select 1

        from public.maintenance_types mt

        where mt.organization_id =
            v_organization_id

        and lower(
            btrim(mt.nombre)
        ) = lower(
            btrim(catalogo.nombre)
        )

    );


    update public.maintenance_types mt

    set

        activo = true,

        orden = catalogo.orden

    from (

        values

            ('Correctivo', 1),
            ('Preventivo', 2)

    ) as catalogo(
        nombre,
        orden
    )

    where mt.organization_id =
        v_organization_id

    and lower(
        btrim(mt.nombre)
    ) = lower(
        btrim(catalogo.nombre)
    );



    -- ========================================================
    -- 5. CONFIRMACIÓN
    -- ========================================================

    raise notice
    '==============================================';


    raise notice
    'TASKVOICE - CATÁLOGOS CONFIGURADOS';


    raise notice
    'Organización: %',
    v_organization_name;


    raise notice
    'Lugares: 13';


    raise notice
    'Turnos: 3';


    raise notice
    'Tipos de mantenimiento: 2';


    raise notice
    '==============================================';


end $$;


commit;


-- ============================================================
-- FIN DE 08_catalog_data.sql
-- ============================================================