-- ============================================================
-- TASKVOICE
-- 14a_execution_photos_hardening.sql
--
-- Refuerzo de seguridad para fotografías.
--
-- Una ejecución completada:
-- - puede seguir viendo fotos
-- - NO puede subir nuevas
-- - NO puede borrar existentes
-- ============================================================

begin;


-- ============================================================
-- ¿EL USUARIO PUEDE MODIFICAR LA EJECUCIÓN?
-- ============================================================

create or replace function
public.can_modify_task_execution(
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

        join public.task_assignees ta
            on ta.task_id =
               e.task_id

        join public.profiles p
            on p.id =
               ta.user_id

        where e.id =
            p_execution_id

        -- La ejecución debe seguir abierta.
        and e.fin is null

        -- El usuario debe pertenecer al equipo.
        and ta.user_id =
            auth.uid()

        -- No debe estar rechazado ni cancelado.
        and ta.estado not in (
            'rechazada',
            'cancelada'
        )

        -- El usuario debe seguir activo.
        and p.activo =
            true

    );

$$;


revoke all
on function
public.can_modify_task_execution(bigint)
from public, anon;


grant execute
on function
public.can_modify_task_execution(bigint)
to authenticated;



-- ============================================================
-- STORAGE - SUBIR FOTO
-- SOLO DURANTE EJECUCIÓN ABIERTA
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

    public.can_modify_task_execution(

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
-- SOLO DURANTE EJECUCIÓN ABIERTA
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

    public.can_modify_task_execution(

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