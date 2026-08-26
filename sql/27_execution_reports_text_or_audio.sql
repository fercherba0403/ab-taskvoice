-- ============================================================
-- TASKVOICE
-- 27_execution_reports_text_or_audio.sql
--
-- REPORTES PARCIALES CON TEXTO, AUDIO O AMBOS
--
-- Permite guardar:
-- - un reporte escrito sin audio
-- - un reporte de voz sin texto
-- - un reporte con texto y audio
--
-- Debe existir al menos uno de los dos contenidos.
-- Los reportes sin audio no requieren transcripcion.
--
-- Esta migracion NO finaliza tareas ni modifica:
-- - public.task_executions.fin
-- - public.tasks.estado
-- - public.task_assignees.estado
-- ============================================================

reset role;

begin;


-- ============================================================
-- 1. AUDIO OPCIONAL
-- ============================================================

alter table public.task_execution_reports
alter column audio_path drop not null;


alter table public.task_execution_reports
drop constraint if exists
task_execution_reports_audio_path_check;


alter table public.task_execution_reports
add constraint task_execution_reports_audio_path_check
check (
    audio_path is null
    or (
        btrim(audio_path) <> ''
        and char_length(audio_path) <= 1024
    )
);


-- ============================================================
-- 2. CONTENIDO OBLIGATORIO
--
-- Un reporte nunca puede quedar sin texto y sin audio.
-- ============================================================

alter table public.task_execution_reports
drop constraint if exists
task_execution_reports_content_check;


alter table public.task_execution_reports
add constraint task_execution_reports_content_check
check (
    descripcion is not null
    or audio_path is not null
);


-- ============================================================
-- 3. ESTADO SIN TRANSCRIPCION REQUERIDA
-- ============================================================

alter table public.task_execution_reports
drop constraint if exists
task_execution_reports_status_audio_check;


alter table public.task_execution_reports
drop constraint if exists
task_execution_reports_status_check;


alter table public.task_execution_reports
add constraint task_execution_reports_status_check
check (
    transcription_status in (
        'not_required',
        'pending',
        'processing',
        'completed',
        'failed'
    )
);


alter table public.task_execution_reports
add constraint task_execution_reports_status_audio_check
check (
    (
        audio_path is null
        and transcription_status = 'not_required'
        and transcripcion is null
    )
    or
    (
        audio_path is not null
        and transcription_status <> 'not_required'
    )
);


comment on column
public.task_execution_reports.audio_path is
'Ruta privada opcional dentro del bucket audios. Es nula para reportes exclusivamente escritos.';


comment on column
public.task_execution_reports.transcription_status is
'Estado de transcripcion: not_required, pending, processing, completed o failed.';


-- ============================================================
-- 4. REGISTRAR REPORTE PARCIAL
--
-- Reglas:
-- - texto, audio o ambos
-- - si hay audio, valida la ruta privada obligatoria
-- - si no hay audio, usa transcription_status=not_required
-- - no modifica ningun estado de tarea o ejecucion
-- ============================================================

create or replace function
public.add_execution_report(
    p_execution_id bigint,
    p_audio_path text,
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
    v_audio_path text;
    v_description text;
    v_expected_prefix text;
    v_file_name text;
    v_report_id bigint;
begin
    v_user_id := auth.uid();


    if v_user_id is null then
        raise exception
        'TASKVOICE: usuario no autenticado.';
    end if;


    if not exists (
        select 1
        from public.profiles p
        where p.id = v_user_id
          and p.activo = true
    ) then
        raise exception
        'TASKVOICE: usuario inactivo.';
    end if;


    select *
    into v_execution
    from public.task_executions
    where id = p_execution_id
    for update;


    if not found then
        raise exception
        'TASKVOICE: ejecucion inexistente.';
    end if;


    if v_execution.fin is not null then
        raise exception
        'TASKVOICE: no se pueden agregar reportes a una ejecucion completada.';
    end if;


    select *
    into v_task
    from public.tasks
    where id = v_execution.task_id
    for update;


    if not found then
        raise exception
        'TASKVOICE: tarea inexistente.';
    end if;


    if v_task.estado in (
        'completada',
        'cancelada'
    ) then
        raise exception
        'TASKVOICE: la tarea ya esta finalizada.';
    end if;


    select *
    into v_assignment
    from public.task_assignees
    where task_id = v_task.id
      and user_id = v_user_id
    for update;


    if not found then
        raise exception
        'TASKVOICE: el usuario no esta asignado a esta tarea.';
    end if;


    if v_assignment.estado <> 'en_progreso' then
        raise exception
        'TASKVOICE: la tarea debe estar en progreso para guardar un reporte.';
    end if;


    v_audio_path :=
        nullif(
            btrim(p_audio_path),
            ''
        );


    v_description :=
        nullif(
            btrim(p_descripcion),
            ''
        );


    if v_audio_path is null
       and v_description is null then
        raise exception
        'TASKVOICE: el reporte debe contener texto, audio o ambos.';
    end if;


    if v_description is not null
       and char_length(v_description) > 5000 then
        raise exception
        'TASKVOICE: la descripcion supera el maximo de 5000 caracteres.';
    end if;


    if v_audio_path is not null then

        if char_length(v_audio_path) > 1024 then
            raise exception
            'TASKVOICE: la ruta del audio es demasiado extensa.';
        end if;


        v_expected_prefix :=
            v_task.organization_id::text
            || '/'
            || v_task.id::text
            || '/'
            || p_execution_id::text
            || '/reports/';


        if left(
            v_audio_path,
            length(v_expected_prefix)
        ) <> v_expected_prefix then
            raise exception
            'TASKVOICE: ruta de audio invalida.';
        end if;


        v_file_name :=
            substring(
                v_audio_path
                from length(v_expected_prefix) + 1
            );


        if v_file_name !~
           '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}[.](webm|ogg|mp3|mp4|wav)$' then
            raise exception
            'TASKVOICE: nombre o formato de audio invalido.';
        end if;

    end if;


    insert into public.task_execution_reports (
        execution_id,
        user_id,
        descripcion,
        audio_path,
        transcription_status
    )
    values (
        p_execution_id,
        v_user_id,
        v_description,
        v_audio_path,
        case
            when v_audio_path is null then
                'not_required'
            else
                'pending'
        end
    )
    returning id
    into v_report_id;


    return v_report_id;
end;
$$;


comment on function
public.add_execution_report(bigint, text, text) is
'Agrega un reporte parcial escrito, de audio o mixto sin finalizar la tarea.';


-- ============================================================
-- 5. PERMISOS EXPLICITOS
-- ============================================================

revoke all
on function public.add_execution_report(bigint, text, text)
from public, anon;


grant execute
on function public.add_execution_report(bigint, text, text)
to authenticated;


commit;
