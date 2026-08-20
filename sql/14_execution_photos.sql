-- ============================================================
-- TASKVOICE
-- 14_execution_photos.sql
--
-- FOTOS DE EJECUCIÓN COMPARTIDA
--
-- Reglas:
-- - máximo 3 fotos por ejecución
-- - pertenecen a la ejecución, no a cada técnico
-- - cualquier técnico activo asignado puede cargarlas
-- - todos los técnicos asignados pueden leerlas
-- - Admin/Supervisor conserva acceso por políticas existentes
-- ============================================================

begin;


-- ============================================================
-- OBTENER FOTOS DE UNA EJECUCIÓN
-- ============================================================

create or replace function
public.get_execution_photos(
    p_execution_id bigint
)
returns table (

    id bigint,

    execution_id bigint,

    storage_path text,

    descripcion text,

    created_at timestamptz

)

language plpgsql
stable
security definer
set search_path = ''

as $$

begin

    if auth.uid() is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;


    if not public.can_access_task_execution(
        p_execution_id
    ) then

        raise exception
        'TASKVOICE: el usuario no tiene acceso a esta ejecución.';

    end if;


    return query

    select

        tp.id,

        tp.execution_id,

        tp.storage_path,

        tp.descripcion,

        tp.created_at

    from public.task_photos tp

    where tp.execution_id =
        p_execution_id

    order by
        tp.created_at asc,
        tp.id asc;

end;

$$;



-- ============================================================
-- REGISTRAR FOTO
--
-- El archivo ya debe haber sido subido al bucket privado fotos.
-- Esta función registra la metadata y controla el máximo de 3.
-- ============================================================

create or replace function
public.add_execution_photo(

    p_execution_id bigint,

    p_storage_path text,

    p_descripcion text default null

)
returns bigint

language plpgsql
security definer
set search_path = ''

as $$

declare

    v_user_id uuid;

    v_execution record;

    v_task record;

    v_assignment record;

    v_storage_path text;

    v_description text;

    v_expected_prefix text;

    v_photo_count integer;

    v_photo_id bigint;

begin


    v_user_id :=
        auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;



    -- ========================================================
    -- USUARIO ACTIVO
    -- ========================================================

    if not exists (

        select 1

        from public.profiles p

        where p.id =
            v_user_id

        and p.activo =
            true

    ) then

        raise exception
        'TASKVOICE: usuario inactivo.';

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



    -- Solo se cargan fotos mientras la ejecución está abierta.

    if v_execution.fin is not null then

        raise exception
        'TASKVOICE: no se pueden agregar fotos a una ejecución completada.';

    end if;



    -- ========================================================
    -- TAREA
    -- ========================================================

    select *

    into v_task

    from public.tasks

    where id =
        v_execution.task_id;


    if not found then

        raise exception
        'TASKVOICE: tarea inexistente.';

    end if;



    -- ========================================================
    -- INTEGRANTE ACTIVO DEL EQUIPO
    -- ========================================================

    select *

    into v_assignment

    from public.task_assignees

    where task_id =
        v_task.id

    and user_id =
        v_user_id;


    if not found then

        raise exception
        'TASKVOICE: el usuario no está asignado a esta tarea.';

    end if;


    if v_assignment.estado in (
        'rechazada',
        'cancelada'
    ) then

        raise exception
        'TASKVOICE: asignación no habilitada para cargar fotos.';

    end if;



    -- ========================================================
    -- NORMALIZAR DATOS
    -- ========================================================

    v_storage_path :=
        nullif(
            btrim(
                p_storage_path
            ),
            ''
        );


    v_description :=
        nullif(
            btrim(
                p_descripcion
            ),
            ''
        );


    if v_storage_path is null then

        raise exception
        'TASKVOICE: falta la ruta de la fotografía.';

    end if;



    -- ========================================================
    -- VALIDAR RUTA
    --
    -- fotos/{org}/{task}/{execution}/archivo.ext
    --
    -- storage_path guarda solo:
    -- {org}/{task}/{execution}/archivo.ext
    -- ========================================================

    v_expected_prefix :=

        v_task.organization_id::text

        || '/'

        || v_task.id::text

        || '/'

        || p_execution_id::text

        || '/';


    if left(

        v_storage_path,

        length(
            v_expected_prefix
        )

    ) <> v_expected_prefix then

        raise exception
        'TASKVOICE: ruta de fotografía inválida.';

    end if;



    -- ========================================================
    -- BLOQUEO TRANSACCIONAL
    --
    -- Evita que dos celulares carguen simultáneamente una
    -- cuarta fotografía.
    -- ========================================================

    perform pg_advisory_xact_lock(
        p_execution_id
    );



    -- ========================================================
    -- MÁXIMO 3 FOTOS
    -- ========================================================

    select count(*)

    into v_photo_count

    from public.task_photos

    where execution_id =
        p_execution_id;


    if v_photo_count >= 3 then

        raise exception
        'TASKVOICE: la ejecución ya tiene el máximo de 3 fotografías.';

    end if;



    -- ========================================================
    -- EVITAR RUTA REPETIDA
    -- ========================================================

    if exists (

        select 1

        from public.task_photos

        where execution_id =
            p_execution_id

        and storage_path =
            v_storage_path

    ) then

        raise exception
        'TASKVOICE: esta fotografía ya fue registrada.';

    end if;



    -- ========================================================
    -- INSERTAR
    -- ========================================================

    insert into public.task_photos (

        execution_id,

        storage_path,

        descripcion

    )

    values (

        p_execution_id,

        v_storage_path,

        v_description

    )

    returning id

    into v_photo_id;



    return
        v_photo_id;


end;

$$;



-- ============================================================
-- ELIMINAR FOTO
--
-- Permitido solamente mientras la ejecución está abierta.
--
-- Importante:
-- esta RPC elimina el REGISTRO de BD.
-- El frontend eliminará primero el archivo de Storage.
-- ============================================================

create or replace function
public.remove_execution_photo(
    p_photo_id bigint
)
returns void

language plpgsql
security definer
set search_path = ''

as $$

declare

    v_user_id uuid;

    v_photo record;

    v_execution record;

    v_assignment record;

begin


    v_user_id :=
        auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;



    select *

    into v_photo

    from public.task_photos

    where id =
        p_photo_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: fotografía inexistente.';

    end if;



    select *

    into v_execution

    from public.task_executions

    where id =
        v_photo.execution_id

    for update;


    if not found then

        raise exception
        'TASKVOICE: ejecución inexistente.';

    end if;



    if v_execution.fin is not null then

        raise exception
        'TASKVOICE: no se pueden eliminar fotos de una ejecución completada.';

    end if;



    select *

    into v_assignment

    from public.task_assignees

    where task_id =
        v_execution.task_id

    and user_id =
        v_user_id;


    if not found then

        raise exception
        'TASKVOICE: el usuario no está asignado a esta tarea.';

    end if;


    if v_assignment.estado in (
        'rechazada',
        'cancelada'
    ) then

        raise exception
        'TASKVOICE: asignación no habilitada.';

    end if;



    delete from public.task_photos

    where id =
        p_photo_id;


end;

$$;



-- ============================================================
-- RLS - LECTURA DE METADATA DE FOTOS
-- ============================================================

drop policy if exists
"task_photos_team_read"
on public.task_photos;


create policy
"task_photos_team_read"

on public.task_photos

for select

to authenticated

using (

    public.can_access_task_execution(
        execution_id
    )

);



-- ============================================================
-- STORAGE - LEER FOTOS COMPARTIDAS
--
-- Ruta:
-- org/task/execution/archivo
--
-- execution_id = segmento 3
-- ============================================================

drop policy if exists
"fotos_team_read"
on storage.objects;


create policy
"fotos_team_read"

on storage.objects

for select

to authenticated

using (

    bucket_id =
        'fotos'

    and

    public.can_access_task_execution(

        case

            when split_part(
                name,
                '/',
                3
            ) ~ '^[0-9]+$'

            then split_part(
                name,
                '/',
                3
            )::bigint

            else null

        end

    )

);



-- ============================================================
-- STORAGE - SUBIR FOTO
-- ============================================================

drop policy if exists
"fotos_team_insert"
on storage.objects;


create policy
"fotos_team_insert"

on storage.objects

for insert

to authenticated

with check (

    bucket_id =
        'fotos'

    and

    public.can_access_task_execution(

        case

            when split_part(
                name,
                '/',
                3
            ) ~ '^[0-9]+$'

            then split_part(
                name,
                '/',
                3
            )::bigint

            else null

        end

    )

);



-- ============================================================
-- STORAGE - BORRAR FOTO
-- ============================================================

drop policy if exists
"fotos_team_delete"
on storage.objects;


create policy
"fotos_team_delete"

on storage.objects

for delete

to authenticated

using (

    bucket_id =
        'fotos'

    and

    public.can_access_task_execution(

        case

            when split_part(
                name,
                '/',
                3
            ) ~ '^[0-9]+$'

            then split_part(
                name,
                '/',
                3
            )::bigint

            else null

        end

    )

);



-- ============================================================
-- PERMISOS RPC
-- ============================================================

revoke execute
on function
public.get_execution_photos(bigint)
from public, anon;


grant execute
on function
public.get_execution_photos(bigint)
to authenticated;



revoke execute
on function
public.add_execution_photo(
    bigint,
    text,
    text
)
from public, anon;


grant execute
on function
public.add_execution_photo(
    bigint,
    text,
    text
)
to authenticated;



revoke execute
on function
public.remove_execution_photo(bigint)
from public, anon;


grant execute
on function
public.remove_execution_photo(bigint)
to authenticated;



commit;