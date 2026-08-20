-- ============================================================
-- TASKVOICE
-- 11_admin_execution_view.sql
--
-- Permite a administradores/supervisores de la misma empresa:
-- - ver ejecuciones
-- - ver tipos de trabajo realizados
-- - reproducir audios privados mediante URL firmada
-- ============================================================

begin;


-- ============================================================
-- 1. EJECUCIONES
-- ============================================================

drop policy if exists
"taskvoice_task_executions_admin_select"
on public.task_executions;


create policy
"taskvoice_task_executions_admin_select"

on public.task_executions

for select

to authenticated

using (

    (
        public.is_admin()
        or
        public.is_supervisor()
    )

    and

    exists (

        select 1

        from public.tasks t

        where t.id =
            task_executions.task_id

        and t.organization_id =
            public.get_my_organization_id()

    )

);


grant select
on public.task_executions
to authenticated;



-- ============================================================
-- 2. TIPOS DE TRABAJO DE LA EJECUCIÓN
-- ============================================================

drop policy if exists
"taskvoice_execution_work_types_admin_select"
on public.execution_work_types;


create policy
"taskvoice_execution_work_types_admin_select"

on public.execution_work_types

for select

to authenticated

using (

    (
        public.is_admin()
        or
        public.is_supervisor()
    )

    and

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

    )

);


grant select
on public.execution_work_types
to authenticated;



-- ============================================================
-- 3. AUDIO PRIVADO
--
-- Ruta existente:
-- audios/{organization}/{task}/{execution}/audio.ext
-- ============================================================

drop policy if exists
"taskvoice_audios_admin_select"
on storage.objects;


create policy
"taskvoice_audios_admin_select"

on storage.objects

for select

to authenticated

using (

    bucket_id =
        'audios'

    and

    (
        public.is_admin()
        or
        public.is_supervisor()
    )

    and

    (
        storage.foldername(name)
    )[1] =
        public.get_my_organization_id()::text

);


commit;