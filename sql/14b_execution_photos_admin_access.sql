-- ============================================================
-- TASKVOICE
-- 14b_execution_photos_admin_access.sql
--
-- Permite consultar fotos privadas de una ejecución a:
-- - técnicos asignados a la tarea
-- - administradores/supervisores activos de la misma empresa
--
-- No amplía permisos de escritura sobre fotos.
-- ============================================================

begin;


-- ============================================================
-- ¿EL USUARIO ACTUAL PUEDE VER ESTA EJECUCIÓN?
-- ============================================================

create or replace function
public.can_view_task_execution(
    p_execution_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$

    select exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id = e.task_id

        join public.profiles p
            on p.id = auth.uid()

        where e.id = p_execution_id

        and p.activo = true

        and (

            exists (

                select 1

                from public.task_assignees ta

                where ta.task_id = t.id

                and ta.user_id = auth.uid()

            )

            or

            (
                p.organization_id = t.organization_id

                and p.rol in (
                    'admin',
                    'supervisor'
                )
            )

        )

    );

$$;


revoke all
on function
public.can_view_task_execution(bigint)
from public, anon;


grant execute
on function
public.can_view_task_execution(bigint)
to authenticated;


-- ============================================================
-- LISTAR FOTOS
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


    if not public.can_view_task_execution(
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


revoke all
on function
public.get_execution_photos(bigint)
from public, anon;


grant execute
on function
public.get_execution_photos(bigint)
to authenticated;


-- ============================================================
-- RLS - METADATA DE FOTOS
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
    public.can_view_task_execution(
        execution_id
    )
);


-- ============================================================
-- STORAGE - LECTURA DE FOTO PRIVADA
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

    bucket_id = 'fotos'

    and

    public.can_view_task_execution(

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


commit;
