-- ============================================================
-- TASKVOICE
-- 26a_verify_execution_report_transcription_claim.sql
--
-- Verificacion de solo lectura para la migracion 26.
-- No crea, modifica ni elimina datos u objetos.
-- ============================================================

select
    to_regprocedure(
        'public.claim_execution_report_transcription(bigint,uuid)'
    ) is not null
        as claim_rpc_exists,

    to_regprocedure(
        'public.finish_execution_report_transcription(bigint,integer,text,text)'
    ) is not null
        as finish_rpc_exists,

    exists (
        select 1
        from pg_proc p
        join pg_namespace n
          on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname =
            'claim_execution_report_transcription'
          and p.prosecdef = true
          and exists (
              select 1
              from unnest(
                  coalesce(
                      p.proconfig,
                      array[]::text[]
                  )
              ) as setting
              where setting like 'search_path=%'
          )
    )
        as claim_security_ok,

    exists (
        select 1
        from pg_proc p
        join pg_namespace n
          on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname =
            'finish_execution_report_transcription'
          and p.prosecdef = true
          and exists (
              select 1
              from unnest(
                  coalesce(
                      p.proconfig,
                      array[]::text[]
                  )
              ) as setting
              where setting like 'search_path=%'
          )
    )
        as finish_security_ok,

    has_function_privilege(
        'service_role',
        'public.claim_execution_report_transcription(bigint,uuid)',
        'EXECUTE'
    )
        as service_role_can_claim,

    has_function_privilege(
        'service_role',
        'public.finish_execution_report_transcription(bigint,integer,text,text)',
        'EXECUTE'
    )
        as service_role_can_finish,

    not has_function_privilege(
        'authenticated',
        'public.claim_execution_report_transcription(bigint,uuid)',
        'EXECUTE'
    )
        as authenticated_claim_blocked,

    not has_function_privilege(
        'authenticated',
        'public.finish_execution_report_transcription(bigint,integer,text,text)',
        'EXECUTE'
    )
        as authenticated_finish_blocked,

    not has_function_privilege(
        'anon',
        'public.claim_execution_report_transcription(bigint,uuid)',
        'EXECUTE'
    )
        as anon_claim_blocked,

    not has_function_privilege(
        'anon',
        'public.finish_execution_report_transcription(bigint,integer,text,text)',
        'EXECUTE'
    )
        as anon_finish_blocked,

    to_regprocedure(
        'public.add_execution_report(bigint,text,text)'
    ) is not null
        as add_report_rpc_preserved,

    to_regprocedure(
        'public.get_execution_reports(bigint)'
    ) is not null
        as get_reports_rpc_preserved,

    (
        select count(*)
        from public.task_execution_reports
    )
        as current_report_count;