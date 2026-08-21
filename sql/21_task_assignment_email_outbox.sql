BEGIN;

-- ============================================================
-- AB TASKVOICE
-- MIGRACIÓN 21: OUTBOX PARA EMAIL DE ASIGNACIÓN
-- ============================================================
-- Prepara las notificaciones de tipo tarea_asignada para su
-- procesamiento posterior mediante Database Webhook y una
-- Supabase Edge Function.
--
-- Esta migración no realiza conexiones HTTP ni envía emails.
-- ============================================================

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS email_status text,
    ADD COLUMN IF NOT EXISTS email_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS email_recipient text,
    ADD COLUMN IF NOT EXISTS email_provider text,
    ADD COLUMN IF NOT EXISTS email_provider_message_id text,
    ADD COLUMN IF NOT EXISTS email_last_error text,
    ADD COLUMN IF NOT EXISTS email_last_attempt_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS email_next_retry_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS email_sent_at timestamp with time zone;

-- ------------------------------------------------------------
-- Estados admitidos
-- ------------------------------------------------------------

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notifications_email_status_check'
          AND conrelid = 'public.notifications'::regclass
    ) THEN
        ALTER TABLE public.notifications
            ADD CONSTRAINT notifications_email_status_check
            CHECK (
                email_status IS NULL
                OR email_status IN (
                    'pending',
                    'processing',
                    'sent',
                    'failed',
                    'skipped'
                )
            );
    END IF;
END;
$migration$;

-- ------------------------------------------------------------
-- Los intentos nunca pueden ser negativos
-- ------------------------------------------------------------

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notifications_email_attempts_check'
          AND conrelid = 'public.notifications'::regclass
    ) THEN
        ALTER TABLE public.notifications
            ADD CONSTRAINT notifications_email_attempts_check
            CHECK (email_attempts >= 0);
    END IF;
END;
$migration$;

-- ------------------------------------------------------------
-- No enviar avisos históricos al activar el proveedor
-- ------------------------------------------------------------

UPDATE public.notifications
SET email_status = 'skipped'
WHERE tipo = 'tarea_asignada'
  AND email_status IS NULL;

-- ------------------------------------------------------------
-- Preparar únicamente nuevas asignaciones para email
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prepare_task_assignment_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
    IF new.tipo = 'tarea_asignada'
       AND new.email_status IS NULL THEN

        new.email_status := 'pending';
        new.email_attempts := 0;

    END IF;

    RETURN new;
END;
$function$;

REVOKE ALL
ON FUNCTION public.prepare_task_assignment_email()
FROM public;

DROP TRIGGER IF EXISTS notification_email_outbox_prepare
ON public.notifications;

CREATE TRIGGER notification_email_outbox_prepare
BEFORE INSERT
ON public.notifications
FOR EACH ROW
WHEN (new.tipo = 'tarea_asignada')
EXECUTE FUNCTION public.prepare_task_assignment_email();

-- ------------------------------------------------------------
-- Índice para pendientes y reintentos
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_notifications_email_outbox
ON public.notifications (
    email_status,
    email_next_retry_at,
    created_at
)
WHERE tipo = 'tarea_asignada'
  AND email_status IN ('pending', 'failed');

COMMIT;