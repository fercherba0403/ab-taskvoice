-- ============================================================
-- TASKVOICE
-- 25a_verify_execution_progress_reports.sql
--
-- Verificacion de solo lectura para la migracion 25.
-- No crea, modifica ni elimina datos u objetos.
-- ============================================================

select
    to_regclass(
        'public.task_execution_reports'
    ) is not null
        as table_exists,

    coalesce(
        (
            select c.relrowsecurity
            from pg_class c
            join pg_namespace n
              on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = 'task_execution_reports'
        ),
        false
    )
        as rls_enabled,

    (
        select count(*) = 13
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'task_execution_reports'
    )
        as columns_ok,

    (
        select count(*) >= 9
        from pg_constraint pc
        where pc.conrelid =
            'public.task_execution_reports'::regclass
    )
        as constraints_ok,

    (
        select count(*) >= 4
        from pg_indexes i
        where i.schemaname = 'public'
          and i.tablename = 'task_execution_reports'
    )
        as indexes_ok,

    exists (
        select 1
        from pg_trigger t
        where t.tgrelid =
            'public.task_execution_reports'::regclass
          and t.tgname =
            'task_execution_reports_updated_at'
          and not t.tgisinternal
    )
        as updated_at_trigger_ok,

    exists (
        select 1
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = 'task_execution_reports'
          and p.policyname =
            'task_execution_reports_team_read'
          and p.cmd = 'SELECT'
    )
        as read_policy_ok,

    to_regprocedure(
        'public.add_execution_report(bigint,text,text)'
    ) is not null
        as add_report_rpc_exists,

    to_regprocedure(
        'public.get_execution_reports(bigint)'
    ) is not null
        as get_reports_rpc_exists,

    has_function_privilege(
        'authenticated',
        'public.add_execution_report(bigint,text,text)',
        'EXECUTE'
    )
        as authenticated_can_add_via_rpc,

    has_function_privilege(
        'authenticated',
        'public.get_execution_reports(bigint)',
        'EXECUTE'
    )
        as authenticated_can_list_via_rpc,

    has_table_privilege(
        'authenticated',
        'public.task_execution_reports',
        'SELECT'
    )
        as authenticated_can_select,

    not has_table_privilege(
        'authenticated',
        'public.task_execution_reports',
        'INSERT'
    )
        as direct_insert_blocked,

    not has_table_privilege(
        'authenticated',
        'public.task_execution_reports',
        'UPDATE'
    )
        as direct_update_blocked,

    not has_table_privilege(
        'authenticated',
        'public.task_execution_reports',
        'DELETE'
    )
        as direct_delete_blocked,

    (
        not has_table_privilege(
            'anon',
            'public.task_execution_reports',
            'SELECT'
        )
        and not has_table_privilege(
            'anon',
            'public.task_execution_reports',
            'INSERT'
        )
        and not has_table_privilege(
            'anon',
            'public.task_execution_reports',
            'UPDATE'
        )
        and not has_table_privilege(
            'anon',
            'public.task_execution_reports',
            'DELETE'
        )
    )
        as anon_blocked,

    (
        has_table_privilege(
            'service_role',
            'public.task_execution_reports',
            'SELECT'
        )
        and has_table_privilege(
            'service_role',
            'public.task_execution_reports',
            'INSERT'
        )
        and has_table_privilege(
            'service_role',
            'public.task_execution_reports',
            'UPDATE'
        )
        and has_table_privilege(
            'service_role',
            'public.task_execution_reports',
            'DELETE'
        )
    )
        as service_role_access_ok,

    (
        select count(*)
        from public.task_execution_reports
    )
        as current_report_count;