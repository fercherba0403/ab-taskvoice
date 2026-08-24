-- ============================================================
-- AB TASKVOICE
-- Seguimiento de entrega de emails transaccionales
--
-- Este script:
-- 1. Mantiene email_status como estado técnico del outbox.
-- 2. Agrega un resumen del seguimiento de Brevo.
-- 3. Crea un historial inmutable de eventos del proveedor.
-- 4. Impide el acceso directo de anon y authenticated al historial.
-- ============================================================

BEGIN;


-- ============================================================
-- RESUMEN DE ENTREGA EN NOTIFICATIONS
-- ============================================================

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS email_delivery_status text,
    ADD COLUMN IF NOT EXISTS email_delivery_last_event text,
    ADD COLUMN IF NOT EXISTS email_delivery_last_event_at timestamptz,
    ADD COLUMN IF NOT EXISTS email_delivered_at timestamptz,
    ADD COLUMN IF NOT EXISTS email_first_opened_at timestamptz,
    ADD COLUMN IF NOT EXISTS email_last_opened_at timestamptz,
    ADD COLUMN IF NOT EXISTS email_open_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS email_first_clicked_at timestamptz,
    ADD COLUMN IF NOT EXISTS email_last_clicked_at timestamptz,
    ADD COLUMN IF NOT EXISTS email_click_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS email_delivery_last_error text;


DO $migration$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.notifications'::regclass
          AND conname = 'notifications_email_delivery_status_check'
    ) THEN

        ALTER TABLE public.notifications
            ADD CONSTRAINT notifications_email_delivery_status_check
            CHECK (
                email_delivery_status IS NULL
                OR email_delivery_status IN (
                    'accepted',
                    'delivered',
                    'deferred',
                    'soft_bounce',
                    'hard_bounce',
                    'invalid_email',
                    'blocked',
                    'error',
                    'spam',
                    'unsubscribed'
                )
            );

    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.notifications'::regclass
          AND conname = 'notifications_email_open_count_check'
    ) THEN

        ALTER TABLE public.notifications
            ADD CONSTRAINT notifications_email_open_count_check
            CHECK (email_open_count >= 0);

    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.notifications'::regclass
          AND conname = 'notifications_email_click_count_check'
    ) THEN

        ALTER TABLE public.notifications
            ADD CONSTRAINT notifications_email_click_count_check
            CHECK (email_click_count >= 0);

    END IF;

END;
$migration$;


COMMENT ON COLUMN public.notifications.email_delivery_status IS
    'Estado final o transitorio informado por Brevo. No reemplaza email_status.';

COMMENT ON COLUMN public.notifications.email_delivery_last_event IS
    'Último tipo de evento recibido desde Brevo.';

COMMENT ON COLUMN public.notifications.email_delivery_last_event_at IS
    'Fecha UTC del evento más reciente recibido desde Brevo.';

COMMENT ON COLUMN public.notifications.email_delivered_at IS
    'Primera confirmación de entrega informada por Brevo.';

COMMENT ON COLUMN public.notifications.email_first_opened_at IS
    'Primera apertura informada por Brevo.';

COMMENT ON COLUMN public.notifications.email_last_opened_at IS
    'Apertura más reciente informada por Brevo.';

COMMENT ON COLUMN public.notifications.email_first_clicked_at IS
    'Primer clic informado por Brevo.';

COMMENT ON COLUMN public.notifications.email_last_clicked_at IS
    'Clic más reciente informado por Brevo.';

COMMENT ON COLUMN public.notifications.email_delivery_last_error IS
    'Último motivo de rechazo, rebote, bloqueo o error informado por Brevo.';


-- Los envíos reales ya aceptados por la API quedan identificados como
-- aceptados, pero no se inventa una entrega que Brevo no haya confirmado.
UPDATE public.notifications
SET
    email_delivery_status = 'accepted',
    email_delivery_last_event = 'legacy_api_accepted',
    email_delivery_last_event_at = COALESCE(
        email_sent_at,
        email_last_attempt_at,
        created_at
    )
WHERE email_status = 'sent'
  AND email_provider = 'brevo'
  AND email_delivery_status IS NULL;


-- ============================================================
-- HISTORIAL INMUTABLE DE EVENTOS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notification_email_events (

    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    notification_id bigint NOT NULL
        REFERENCES public.notifications(id)
        ON DELETE CASCADE,

    provider text NOT NULL DEFAULT 'brevo',

    provider_message_id text NOT NULL,

    provider_event_id text,

    provider_event_hash text NOT NULL,

    event_type text NOT NULL,

    event_at timestamptz NOT NULL,

    recipient text,

    reason text,

    clicked_url text,

    payload jsonb NOT NULL,

    received_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT notification_email_events_provider_check
        CHECK (
            char_length(btrim(provider)) BETWEEN 1 AND 50
        ),

    CONSTRAINT notification_email_events_message_id_check
        CHECK (
            char_length(btrim(provider_message_id)) BETWEEN 1 AND 500
        ),

    CONSTRAINT notification_email_events_hash_check
        CHECK (
            provider_event_hash ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT notification_email_events_type_check
        CHECK (
            char_length(btrim(event_type)) BETWEEN 1 AND 64
        ),

    CONSTRAINT notification_email_events_payload_check
        CHECK (
            jsonb_typeof(payload) = 'object'
        )

);


COMMENT ON TABLE public.notification_email_events IS
    'Historial inmutable de eventos transaccionales recibidos desde Brevo.';

COMMENT ON COLUMN public.notification_email_events.provider_event_hash IS
    'SHA-256 del evento normalizado, utilizado para evitar duplicados.';

COMMENT ON COLUMN public.notification_email_events.event_at IS
    'Fecha del evento convertida desde ts_epoch/ts_event y almacenada en UTC.';


CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_email_events_provider_hash
    ON public.notification_email_events (
        provider,
        provider_event_hash
    );


CREATE INDEX IF NOT EXISTS idx_notification_email_events_notification_time
    ON public.notification_email_events (
        notification_id,
        event_at DESC,
        id DESC
    );


CREATE INDEX IF NOT EXISTS idx_notification_email_events_provider_message
    ON public.notification_email_events (
        provider,
        provider_message_id
    );


-- Brevo puede devolver el message-id con o sin los signos < >.
-- Este índice permite buscarlo de manera normalizada.
CREATE INDEX IF NOT EXISTS idx_notifications_email_provider_message_normalized
    ON public.notifications (
        lower(
            btrim(
                email_provider_message_id,
                '<> '
            )
        )
    )
    WHERE email_provider_message_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS idx_notifications_email_delivery_status
    ON public.notifications (
        email_delivery_status,
        email_delivery_last_event_at DESC
    )
    WHERE email_delivery_status IS NOT NULL;


-- ============================================================
-- SEGURIDAD
-- ============================================================

ALTER TABLE public.notification_email_events
    ENABLE ROW LEVEL SECURITY;


REVOKE ALL
ON TABLE public.notification_email_events
FROM anon, authenticated;


GRANT ALL
ON TABLE public.notification_email_events
TO service_role;


REVOKE ALL
ON SEQUENCE public.notification_email_events_id_seq
FROM anon, authenticated;


GRANT USAGE, SELECT
ON SEQUENCE public.notification_email_events_id_seq
TO service_role;


-- Los clientes pueden leer el resumen mediante las políticas existentes de
-- notifications, pero nunca deben modificar estos campos directamente.
REVOKE UPDATE (
    email_delivery_status,
    email_delivery_last_event,
    email_delivery_last_event_at,
    email_delivered_at,
    email_first_opened_at,
    email_last_opened_at,
    email_open_count,
    email_first_clicked_at,
    email_last_clicked_at,
    email_click_count,
    email_delivery_last_error
)
ON public.notifications
FROM anon, authenticated;


COMMIT;