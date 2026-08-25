-- ============================================================
-- TASKVOICE
-- 26_execution_report_transcription_claim.sql
--
-- CONTROL ATOMICO DE TRANSCRIPCION PARA REPORTES PARCIALES
--
-- Responsabilidades:
-- - autorizar al solicitante verificado por la Edge Function
-- - impedir dos transcripciones simultaneas del mismo reporte
-- - permitir reintentos manuales
-- - guardar el resultado o el error de forma atomica
--
-- Estas RPC solo pueden ejecutarse con service_role.
-- No finalizan la tarea ni modifican task_executions.fin.
-- ============================================================

reset role;

begin;


-- ============================================================
-- 1. RECLAMAR REPORTE PARA TRANSCRIPCION
--
-- Resultados posibles:
-- - claimed: el proceso puede llamar a Groq
-- - existing: la transcripcion ya estaba guardada
-- - busy: otro proceso la esta transcribiendo
-- - attempts_exhausted: alcanzo el maximo de 5 intentos
-- ============================================================

create or replace function
public.claim_execution_report_transcription(
    p_report_id bigint,
    p_requester_id uuid
)
returns table (
    report_id bigint,
    execution_id bigint,
    audio_path text,
    task_title text,
    ticket_number text,
    transcription_status text,
    transcription_attempts integer,
    existing_transcription text,
    claim_result text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_report record;
    v_execution record;
    v_task record;
    v_profile record;
    v_is_privileged boolean;
    v_is_assigned boolean;
    v_attempt integer;
begin
    if p_report_id is null
       or p_report_id <= 0 then
        raise exception
        'TASKVOICE: report_id invalido.';
    end if;


    if p_requester_id is null then
        raise exception
        'TASKVOICE: requester_id invalido.';
    end if;


    select *
    into v_report
    from public.task_execution_reports r
    where r.id = p_report_id
    for update;


    if not found then
        raise exception
        'TASKVOICE: reporte inexistente.';
    end if;


    select *
    into v_execution
    from public.task_executions e
    where e.id = v_report.execution_id;


    if not found then
        raise exception
        'TASKVOICE: ejecucion inexistente.';
    end if;


    select *
    into v_task
    from public.tasks t
    where t.id = v_execution.task_id;


    if not found then
        raise exception
        'TASKVOICE: tarea inexistente.';
    end if;


    select *
    into v_profile
    from public.profiles p
    where p.id = p_requester_id;


    if not found
       or v_profile.activo is distinct from true then
        raise exception
        'TASKVOICE: usuario inexistente o inactivo.';
    end if;


    if v_profile.organization_id is distinct from
       v_task.organization_id then
        raise exception
        'TASKVOICE: acceso denegado.';
    end if;


    v_is_privileged :=
        coalesce(
            v_profile.rol in (
                'admin',
                'supervisor'
            ),
            false
        )
        or exists (
            select 1
            from public.user_roles ur
            where ur.user_id = p_requester_id
              and ur.role in (
                  'admin',
                  'supervisor'
              )
        );


    v_is_assigned :=
        exists (
            select 1
            from public.task_assignees ta
            where ta.task_id = v_task.id
              and ta.user_id = p_requester_id
              and ta.estado not in (
                  'rechazada',
                  'cancelada'
              )
        );


    if v_is_privileged is not true
       and not v_is_assigned then
        raise exception
        'TASKVOICE: el usuario no tiene acceso a este reporte.';
    end if;


    if nullif(
        btrim(v_report.transcripcion),
        ''
    ) is not null then

        update public.task_execution_reports
        set
            transcription_status = 'completed',
            transcription_completed_at = coalesce(
                transcription_completed_at,
                now()
            ),
            transcription_last_error = null
        where id = v_report.id;


        return query
        select
            v_report.id,
            v_report.execution_id,
            v_report.audio_path,
            v_task.titulo,
            v_task.ticket_number,
            'completed'::text,
            v_report.transcription_attempts,
            v_report.transcripcion,
            'existing'::text;

        return;
    end if;


    if v_report.transcription_status = 'processing'
       and v_report.transcription_last_attempt_at is not null
       and v_report.transcription_last_attempt_at >
           now() - interval '10 minutes' then

        return query
        select
            v_report.id,
            v_report.execution_id,
            v_report.audio_path,
            v_task.titulo,
            v_task.ticket_number,
            v_report.transcription_status,
            v_report.transcription_attempts,
            null::text,
            'busy'::text;

        return;
    end if;


    if v_report.transcription_attempts >= 5 then

        return query
        select
            v_report.id,
            v_report.execution_id,
            v_report.audio_path,
            v_task.titulo,
            v_task.ticket_number,
            v_report.transcription_status,
            v_report.transcription_attempts,
            null::text,
            'attempts_exhausted'::text;

        return;
    end if;


    v_attempt :=
        v_report.transcription_attempts + 1;


    update public.task_execution_reports
    set
        transcription_status = 'processing',
        transcription_attempts = v_attempt,
        transcription_last_attempt_at = now(),
        transcription_completed_at = null,
        transcription_last_error = null
    where id = v_report.id;


    return query
    select
        v_report.id,
        v_report.execution_id,
        v_report.audio_path,
        v_task.titulo,
        v_task.ticket_number,
        'processing'::text,
        v_attempt,
        null::text,
        'claimed'::text;
end;
$$;


comment on function
public.claim_execution_report_transcription(bigint, uuid) is
'Reclama atomicamente un reporte parcial para transcribirlo desde una Edge Function autorizada.';


-- ============================================================
-- 2. FINALIZAR UN INTENTO DE TRANSCRIPCION
--
-- Debe recibirse exactamente uno:
-- - p_transcription para exito
-- - p_error para fallo
--
-- p_attempt evita que una respuesta atrasada sobrescriba un
-- intento posterior del mismo reporte.
-- ============================================================

create or replace function
public.finish_execution_report_transcription(
    p_report_id bigint,
    p_attempt integer,
    p_transcription text,
    p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_transcription text;
    v_error text;
    v_updated_rows integer;
begin
    if p_report_id is null
       or p_report_id <= 0 then
        raise exception
        'TASKVOICE: report_id invalido.';
    end if;


    if p_attempt is null
       or p_attempt <= 0 then
        raise exception
        'TASKVOICE: intento de transcripcion invalido.';
    end if;


    v_transcription :=
        nullif(
            btrim(p_transcription),
            ''
        );


    v_error :=
        nullif(
            btrim(p_error),
            ''
        );


    if (
        v_transcription is null
        and v_error is null
    )
    or (
        v_transcription is not null
        and v_error is not null
    ) then
        raise exception
        'TASKVOICE: debe informar transcripcion o error, pero no ambos.';
    end if;


    if v_transcription is not null then

        if char_length(v_transcription) > 100000 then
            raise exception
            'TASKVOICE: la transcripcion supera el limite permitido.';
        end if;


        update public.task_execution_reports
        set
            transcripcion = v_transcription,
            transcription_status = 'completed',
            transcription_completed_at = now(),
            transcription_last_error = null
        where id = p_report_id
          and transcription_status = 'processing'
          and transcription_attempts = p_attempt;

    else

        update public.task_execution_reports
        set
            transcription_status = 'failed',
            transcription_completed_at = null,
            transcription_last_error = left(
                v_error,
                2000
            )
        where id = p_report_id
          and transcription_status = 'processing'
          and transcription_attempts = p_attempt;

    end if;


    get diagnostics
        v_updated_rows = row_count;


    return v_updated_rows = 1;
end;
$$;


comment on function
public.finish_execution_report_transcription(bigint, integer, text, text) is
'Guarda de forma atomica el resultado o error de un intento de transcripcion.';


-- ============================================================
-- 3. PERMISOS
-- ============================================================

revoke all
on function
public.claim_execution_report_transcription(bigint, uuid)
from public, anon, authenticated;


grant execute
on function
public.claim_execution_report_transcription(bigint, uuid)
to service_role;


revoke all
on function
public.finish_execution_report_transcription(
    bigint,
    integer,
    text,
    text
)
from public, anon, authenticated;


grant execute
on function
public.finish_execution_report_transcription(
    bigint,
    integer,
    text,
    text
)
to service_role;


commit;