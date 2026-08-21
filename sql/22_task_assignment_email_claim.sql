BEGIN;

-- ============================================================
-- AB TASKVOICE
-- MIGRACIÓN 22: CLAIM ATÓMICO DE EMAIL DE ASIGNACIÓN
-- ============================================================
-- Impide que dos procesos reclamen simultáneamente la misma
-- notificación y prepara una clave estable de idempotencia.
--
-- Esta migración no realiza conexiones HTTP ni envía emails.
-- ============================================================


-- ------------------------------------------------------------
-- CLAVE DE IDEMPOTENCIA DEL PROVEEDOR
-- ------------------------------------------------------------

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS email_idempotency_key uuid;


CREATE UNIQUE INDEX IF NOT EXISTS
    ux_notifications_email_idempotency_key
ON public.notifications (
    email_idempotency_key
)
WHERE email_idempotency_key IS NOT NULL;


COMMENT ON COLUMN
    public.notifications.email_idempotency_key
IS
    'UUID estable utilizado para evitar envíos duplicados en el proveedor de email.';


-- ------------------------------------------------------------
-- RECLAMAR UNA NOTIFICACIÓN
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION
    public.claim_task_assignment_email(
        p_notification_id bigint
    )
RETURNS TABLE (

    notification_id bigint,

    organization_id uuid,

    user_id uuid,

    task_id bigint,

    notification_title text,

    notification_message text,

    email_attempts integer,

    email_idempotency_key uuid,

    recipient text,

    technician_name text,

    profile_active boolean,

    task_title text

)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$

    WITH claimed AS (

        UPDATE public.notifications AS notification

        SET

            email_status =
                'processing',

            email_attempts =
                notification.email_attempts + 1,

            email_last_attempt_at =
                now(),

            email_next_retry_at =
                NULL,

            email_last_error =
                NULL,

            email_idempotency_key =
                COALESCE(
                    notification.email_idempotency_key,
                    gen_random_uuid()
                )

        WHERE notification.id =
                p_notification_id

          AND notification.tipo =
                'tarea_asignada'

          AND notification.email_status
                IN (
                    'pending',
                    'failed'
                )

          AND notification.email_attempts <
                5

          AND (
                notification.email_next_retry_at
                    IS NULL

                OR

                notification.email_next_retry_at <=
                    now()
          )

        RETURNING

            notification.id,

            notification.organization_id,

            notification.user_id,

            notification.task_id,

            notification.titulo,

            notification.mensaje,

            notification.email_attempts,

            notification.email_idempotency_key

    )

    SELECT

        claimed.id
            AS notification_id,

        claimed.organization_id,

        claimed.user_id,

        claimed.task_id,

        claimed.titulo
            AS notification_title,

        claimed.mensaje
            AS notification_message,

        claimed.email_attempts,

        claimed.email_idempotency_key,

        profile.email
            AS recipient,

        NULLIF(
            BTRIM(
                CONCAT_WS(
                    ' ',
                    profile.nombre,
                    profile.apellido
                )
            ),
            ''
        )
            AS technician_name,

        profile.activo
            AS profile_active,

        task.titulo
            AS task_title

    FROM claimed

    LEFT JOIN public.profiles AS profile

        ON profile.id =
            claimed.user_id

       AND profile.organization_id =
            claimed.organization_id

    LEFT JOIN public.tasks AS task

        ON task.id =
            claimed.task_id

       AND task.organization_id =
            claimed.organization_id;

$function$;


-- ------------------------------------------------------------
-- PERMISOS
-- ------------------------------------------------------------

REVOKE ALL
ON FUNCTION
    public.claim_task_assignment_email(bigint)
FROM PUBLIC;


REVOKE ALL
ON FUNCTION
    public.claim_task_assignment_email(bigint)
FROM anon;


REVOKE ALL
ON FUNCTION
    public.claim_task_assignment_email(bigint)
FROM authenticated;


GRANT EXECUTE
ON FUNCTION
    public.claim_task_assignment_email(bigint)
TO service_role;


COMMENT ON FUNCTION
    public.claim_task_assignment_email(bigint)
IS
    'Reclama atómicamente una notificación pendiente o fallida de asignación para procesamiento de email.';


COMMIT;