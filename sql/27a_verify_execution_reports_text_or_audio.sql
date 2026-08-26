-- ============================================================
-- TASKVOICE
-- 27a_verify_execution_reports_text_or_audio.sql
--
-- VERIFICACION DE LA OPCION 2
-- Solo lectura. No modifica datos ni estructura.
-- ============================================================

select
    exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'task_execution_reports'
          and c.column_name = 'audio_path'
          and c.is_nullable = 'YES'
    ) as audio_path_nullable,

    exists (
        select 1
        from pg_constraint c
        join pg_class t
          on t.oid = c.conrelid
        join pg_namespace n
          on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'task_execution_reports'
          and c.conname = 'task_execution_reports_audio_path_check'
          and c.convalidated = true
          and pg_get_constraintdef(c.oid) ilike '%audio_path IS NULL%'
    ) as nullable_audio_constraint_ok,

    exists (
        select 1
        from pg_constraint c
        join pg_class t
          on t.oid = c.conrelid
        join pg_namespace n
          on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'task_execution_reports'
          and c.conname = 'task_execution_reports_content_check'
          and c.convalidated = true
    ) as content_constraint_ok,

    exists (
        select 1
        from pg_constraint c
        join pg_class t
          on t.oid = c.conrelid
        join pg_namespace n
          on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'task_execution_reports'
          and c.conname = 'task_execution_reports_status_check'
          and c.convalidated = true
          and pg_get_constraintdef(c.oid) ilike '%not_required%'
    ) as not_required_status_ok,

    exists (
        select 1
        from pg_constraint c
        join pg_class t
          on t.oid = c.conrelid
        join pg_namespace n
          on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'task_execution_reports'
          and c.conname = 'task_execution_reports_status_audio_check'
          and c.convalidated = true
    ) as status_audio_constraint_ok,

    to_regprocedure(
        'public.add_execution_report(bigint,text,text)'
    ) is not null as add_report_rpc_exists,

    coalesce(
        (
            select p.prosecdef
            from pg_proc p
            where p.oid = to_regprocedure(
                'public.add_execution_report(bigint,text,text)'
            )
        ),
        false
    ) as add_report_security_definer,

    has_function_privilege(
        'authenticated',
        'public.add_execution_report(bigint,text,text)',
        'EXECUTE'
    ) as authenticated_can_add_via_rpc,

    not has_function_privilege(
        'anon',
        'public.add_execution_report(bigint,text,text)',
        'EXECUTE'
    ) as anon_add_blocked,

    to_regprocedure(
        'public.claim_execution_report_transcription(bigint,uuid)'
    ) is not null as claim_rpc_preserved,

    to_regprocedure(
        'public.finish_execution_report_transcription(bigint,integer,text,text)'
    ) is not null as finish_rpc_preserved,

    not exists (
        select 1
        from public.task_execution_reports r
        where (
            r.descripcion is null
            and r.audio_path is null
        )
        or (
            r.audio_path is null
            and r.transcription_status <> 'not_required'
        )
        or (
            r.audio_path is not null
            and r.transcription_status = 'not_required'
        )
    ) as existing_rows_consistent,

    (
        select count(*)
        from public.task_execution_reports
    ) as current_report_count,

    (
        select count(*)
        from public.task_execution_reports
        where audio_path is null
    ) as current_written_only_count;
