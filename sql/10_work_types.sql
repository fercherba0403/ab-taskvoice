-- ============================================================
-- TASKVOICE
-- 10_work_types.sql
--
-- Catálogo de tipos de trabajo realizado.
--
-- Una ejecución puede tener UNO O VARIOS tipos de trabajo.
--
-- Ejemplo:
--
-- task_execution #25
--   ├── Diagnóstico
--   ├── Reparación
--   └── Prueba de funcionamiento
--
-- NO modifica ejecuciones anteriores.
-- ============================================================

begin;


-- ============================================================
-- 1. CATÁLOGO DE TIPOS DE TRABAJO
-- ============================================================

create table if not exists
public.work_types (

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

    constraint work_types_nombre_not_blank
        check (
            btrim(nombre) <> ''
        )

);


create unique index if not exists
idx_work_types_org_nombre_unique

on public.work_types (

    organization_id,

    lower(nombre)

);


create index if not exists
idx_work_types_org_active

on public.work_types (

    organization_id,

    activo

);



-- ============================================================
-- 2. UPDATED_AT
-- ============================================================

drop trigger if exists
work_types_updated_at
on public.work_types;


create trigger
work_types_updated_at

before update

on public.work_types

for each row

execute function
public.update_updated_at();



-- ============================================================
-- 3. RELACIÓN EJECUCIÓN <-> TIPOS DE TRABAJO
-- ============================================================

create table if not exists
public.execution_work_types (

    execution_id bigint not null
        references public.task_executions(id)
        on delete cascade,

    work_type_id bigint not null
        references public.work_types(id)
        on delete restrict,

    created_at timestamptz not null
        default now(),

    primary key (

        execution_id,

        work_type_id

    )

);


create index if not exists
idx_execution_work_types_work_type

on public.execution_work_types(
    work_type_id
);



-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.work_types
enable row level security;


alter table public.execution_work_types
enable row level security;



-- ============================================================
-- 5. WORK_TYPES - LECTURA
-- ============================================================

drop policy if exists
"taskvoice_work_types_select"
on public.work_types;


create policy
"taskvoice_work_types_select"

on public.work_types

for select

to authenticated

using (

    organization_id =
        public.get_my_organization_id()

);


grant select
on public.work_types
to authenticated;



-- ============================================================
-- 6. EXECUTION_WORK_TYPES - LECTURA
-- ============================================================

drop policy if exists
"taskvoice_execution_work_types_select"
on public.execution_work_types;


create policy
"taskvoice_execution_work_types_select"

on public.execution_work_types

for select

to authenticated

using (

    exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id =
               e.task_id

        where e.id =
            execution_work_types.execution_id

        and t.organization_id =
            public.get_my_organization_id()

        and (

            e.user_id =
                auth.uid()

            or

            public.is_supervisor()

        )

    )

);


grant select
on public.execution_work_types
to authenticated;


revoke insert, update, delete
on public.execution_work_types
from authenticated;



-- ============================================================
-- 7. CARGAR CATÁLOGO INICIAL
--
-- Se cargan las 10 opciones en todas las organizaciones
-- activas que existan actualmente.
-- ============================================================

insert into public.work_types (

    organization_id,

    nombre,

    activo,

    orden

)

select

    o.id,

    catalogo.nombre,

    true,

    catalogo.orden

from public.organizations o

cross join (

    values

        ('Diagnóstico',               1),

        ('Inspección',                2),

        ('Reparación',                3),

        ('Reemplazo de componente',   4),

        ('Ajuste',                    5),

        ('Limpieza',                  6),

        ('Configuración',             7),

        ('Instalación',               8),

        ('Prueba de funcionamiento',  9),

        ('Mantenimiento general',    10)

) as catalogo(
    nombre,
    orden
)

where o.activo =
    true

and not exists (

    select 1

    from public.work_types wt

    where wt.organization_id =
        o.id

    and lower(
        btrim(wt.nombre)
    ) =
        lower(
            btrim(catalogo.nombre)
        )

);



-- ============================================================
-- 8. RPC:
-- COMPLETE_TASK_WITH_WORK_TYPES
--
-- Esta será la nueva forma profesional de finalizar.
--
-- Todo ocurre en una sola transacción:
--
-- 1. valida técnico
-- 2. valida tipos seleccionados
-- 3. guarda los tipos de trabajo
-- 4. completa la ejecución
--
-- Si algo falla, NO queda información a medio guardar.
-- ============================================================

create or replace function
public.complete_task_with_work_types (

    p_execution_id bigint,

    p_work_type_ids bigint[],

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

    v_valid_types integer;

    v_selected_types integer;

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
    -- EJECUCIÓN
    -- ========================================================

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
        'TASKVOICE: ejecución perteneciente a otro técnico.';

    end if;


    if v_execution.fin
       is not null then

        raise exception
        'TASKVOICE: esta ejecución ya fue completada.';

    end if;



    -- ========================================================
    -- TAREA
    -- ========================================================

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



    -- ========================================================
    -- DEBE SELECCIONAR AL MENOS UN TIPO
    -- ========================================================

    if p_work_type_ids is null

       or cardinality(
            p_work_type_ids
       ) = 0 then

        raise exception
        'TASKVOICE: debe seleccionar al menos un tipo de trabajo realizado.';

    end if;



    -- ========================================================
    -- NO PERMITIR NULL
    -- ========================================================

    if array_position(
        p_work_type_ids,
        null
    ) is not null then

        raise exception
        'TASKVOICE: selección de trabajos inválida.';

    end if;



    -- ========================================================
    -- NO PERMITIR REPETIDOS
    -- ========================================================

    select count(
        distinct value
    )

    into v_selected_types

    from unnest(
        p_work_type_ids
    ) as value;


    if v_selected_types <>
       cardinality(
            p_work_type_ids
       ) then

        raise exception
        'TASKVOICE: hay tipos de trabajo repetidos.';

    end if;



    -- ========================================================
    -- VALIDAR:
    --
    -- - existen
    -- - están activos
    -- - pertenecen a la misma empresa de la tarea
    -- ========================================================

    select count(*)

    into v_valid_types

    from public.work_types wt

    where wt.id =
        any(
            p_work_type_ids
        )

    and wt.organization_id =
        v_task.organization_id

    and wt.activo =
        true;


    if v_valid_types <>
       cardinality(
            p_work_type_ids
       ) then

        raise exception
        'TASKVOICE: uno o más tipos de trabajo son inválidos.';

    end if;



    -- ========================================================
    -- GUARDAR TIPOS REALIZADOS
    -- ========================================================

    insert into public.execution_work_types (

        execution_id,

        work_type_id

    )

    select

        p_execution_id,

        value

    from unnest(
        p_work_type_ids
    ) as value

    on conflict (
        execution_id,
        work_type_id
    )

    do nothing;



    -- ========================================================
    -- COMPLETAR EJECUCIÓN
    --
    -- Reutilizamos toda la seguridad que ya tenemos en
    -- complete_task().
    -- ========================================================

    perform
    public.complete_task(

        p_execution_id,

        p_descripcion,

        p_transcripcion,

        p_audio_path

    );

end;

$$;



-- ============================================================
-- 9. PERMISOS RPC
-- ============================================================

revoke execute
on function
public.complete_task_with_work_types(
    bigint,
    bigint[],
    text,
    text,
    text
)
from public, anon;


grant execute
on function
public.complete_task_with_work_types(
    bigint,
    bigint[],
    text,
    text,
    text
)
to authenticated;



commit;