-- ============================================================
-- TASKVOICE
-- 25_execution_progress_reports.sql
--
-- REPORTES PARCIALES DE UNA EJECUCION COMPARTIDA
--
-- Permite que los tecnicos guarden varios audios y sus
-- transcripciones sin cerrar la tarea ni completar la ejecucion.
--
-- Esta migracion NO modifica:
-- - public.complete_task(bigint, text, text, text)
-- - public.complete_task_with_work_types(bigint, bigint[], text, text, text)
-- - public.task_executions.fin
-- - estados de public.tasks o public.task_assignees
-- ============================================================

reset role;

begin;


-- ============================================================
-- 1. TABLA HIJA DE REPORTES PARCIALES
-- ============================================================

create table if not exists
public.task_execution_reports (

    id bigint
        generated always as identity
        primary key,

    execution_id bigint not null
        references public.task_executions(id)
        on delete cascade,

    user_id uuid not null
        references public.profiles(id)
        on delete restrict,

    descripcion text,

    audio_path text not null,

    transcripcion text,

    transcription_status text not null
        default 'pending',

    transcription_attempts integer not null
        default 0,

    transcription_last_attempt_at timestamptz,

    transcription_completed_at timestamptz,

    transcription_last_error text,

    created_at timestamptz not null
        default now(),

    updated_at timestamptz not null
        default now(),

    constraint task_execution_reports_descripcion_check
        check (
            descripcion is null
            or (
                btrim(descripcion) <> ''
                and char_length(descripcion) <= 5000
            )
        ),

    constraint task_execution_reports_audio_path_check
        check (
            btrim(audio_path) <> ''
            and char_length(audio_path) <= 1024
        ),

    constraint task_execution_reports_transcripcion_check
        check (
            transcripcion is null
            or (
                btrim(transcripcion) <> ''
                and char_length(transcripcion) <= 100000
            )
        ),

    constraint task_execution_reports_status_check
        check (
            transcription_status in (
                'pending',
                'processing',
                'completed',
                'failed'
            )
        ),

    constraint task_execution_reports_attempts_check
        check (
            transcription_attempts >= 0
        ),

    constraint task_execution_reports_error_check
        check (
            transcription_last_error is null
            or char_length(transcription_last_error) <= 2000
        )
);


comment on table public.task_execution_reports is
'Reportes parciales de audio pertenecientes a una ejecucion compartida. No finalizan la tarea.';

comment on column public.task_execution_reports.user_id is
'Tecnico autenticado que registro fisicamente este reporte parcial.';

comment on column public.task_execution_reports.audio_path is
'Ruta privada dentro del bucket audios, sin incluir el nombre del bucket.';

comment on column public.task_execution_reports.transcription_status is
'Estado tecnico de Groq: pending, processing, completed o failed.';


-- ============================================================
-- 2. INDICES E IDEMPOTENCIA DE LA RUTA
-- ============================================================

create unique index if not exists
idx_task_execution_reports_audio_path_unique
on public.task_execution_reports(audio_path);


create index if not exists
idx_task_execution_reports_execution_created
on public.task_execution_reports (
    execution_id,
    created_at,
    id
);


create index if not exists
idx_task_execution_reports_transcription_pending
on public.task_execution_reports (
    transcription_status,
    created_at
)
where transcription_status in (
    'pending',
    'failed'
);


-- ============================================================
-- 3. UPDATED_AT
-- ============================================================

drop trigger if exists
task_execution_reports_updated_at
on public.task_execution_reports;


create trigger
task_execution_reports_updated_at
before update
on public.task_execution_reports
for each row
execute function public.update_updated_at();


-- ============================================================
-- 4. RLS
--
-- Lectura:
-- - tecnicos asignados a la tarea
-- - Admin/Supervisor activo de la misma empresa
--
-- Escritura:
-- - nunca se hace directamente desde el navegador
-- - el alta se realiza por add_execution_report(bigint, text, text)
-- - la transcripcion se actualizara desde Edge Function
-- ============================================================

alter table public.task_execution_reports
enable row level security;


drop policy if exists
"task_execution_reports_team_read"
on public.task_execution_reports;


create policy
"task_execution_reports_team_read"

on public.task_execution_reports

for select

to authenticated

using (
    public.can_view_task_execution(
        execution_id
    )
);


-- ============================================================
-- 5. REGISTRAR UN REPORTE PARCIAL
--
-- El archivo ya debe existir en Storage privado.
-- Ruta obligatoria:
-- {organization_id}/{task_id}/{execution_id}/reports/{archivo}
--
-- Registrar el reporte NO modifica la ejecucion ni la tarea.
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


    if v_audio_path is null then
        raise exception
        'TASKVOICE: falta la ruta del audio.';
    end if;


    if char_length(v_audio_path) > 1024 then
        raise exception
        'TASKVOICE: la ruta del audio es demasiado extensa.';
    end if;


    if v_description is not null
       and char_length(v_description) > 5000 then
        raise exception
        'TASKVOICE: la descripcion supera el maximo de 5000 caracteres.';
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
        'pending'
    )
    returning id
    into v_report_id;


    return v_report_id;
end;
$$;


-- ============================================================
-- 6. LISTAR REPORTES DE UNA EJECUCION
-- ============================================================

create or replace function
public.get_execution_reports(
    p_execution_id bigint
)
returns table (
    id bigint,
    execution_id bigint,
    user_id uuid,
    technician_name text,
    descripcion text,
    audio_path text,
    transcripcion text,
    transcription_status text,
    transcription_attempts integer,
    transcription_last_attempt_at timestamptz,
    transcription_completed_at timestamptz,
    transcription_last_error text,
    created_at timestamptz,
    updated_at timestamptz
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
        'TASKVOICE: el usuario no tiene acceso a esta ejecucion.';
    end if;


    return query
    select
        r.id,
        r.execution_id,
        r.user_id,
        coalesce(
            nullif(
                btrim(
                    concat_ws(
                        ' ',
                        p.nombre,
                        p.apellido
                    )
                ),
                ''
            ),
            'Tecnico'
        ) as technician_name,
        r.descripcion,
        r.audio_path,
        r.transcripcion,
        r.transcription_status,
        r.transcription_attempts,
        r.transcription_last_attempt_at,
        r.transcription_completed_at,
        r.transcription_last_error,
        r.created_at,
        r.updated_at
    from public.task_execution_reports r
    join public.profiles p
      on p.id = r.user_id
    where r.execution_id = p_execution_id
    order by
        r.created_at asc,
        r.id asc;
end;
$$;


-- ============================================================
-- 7. PERMISOS
-- ============================================================

revoke all
on table public.task_execution_reports
from public, anon, authenticated;


grant select
on table public.task_execution_reports
to authenticated;


grant select, insert, update, delete
on table public.task_execution_reports
to service_role;


grant usage, select, update
on sequence public.task_execution_reports_id_seq
to service_role;


revoke all
on function public.add_execution_report(bigint, text, text)
from public, anon;


grant execute
on function public.add_execution_report(bigint, text, text)
to authenticated;


revoke all
on function public.get_execution_reports(bigint)
from public, anon;


grant execute
on function public.get_execution_reports(bigint)
to authenticated;


commit;