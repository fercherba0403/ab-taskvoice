-- ============================================================
-- AB TASKVOICE
-- Registro atómico de eventos transaccionales de Brevo
--
-- Requiere:
-- - sql/23_email_delivery_tracking.sql
--
-- La función:
-- 1. Localiza la notificación por su ID o por message-id.
-- 2. Valida que el destinatario y el message-id sean coherentes.
-- 3. Inserta el evento una sola vez mediante su SHA-256.
-- 4. Actualiza el resumen de notifications en la misma transacción.
-- 5. Solo puede ejecutarse desde service_role.
-- ============================================================

BEGIN;


CREATE OR REPLACE FUNCTION public.record_brevo_email_event(

    p_notification_id bigint,

    p_provider_message_id text,

    p_provider_event_id text,

    p_provider_event_hash text,

    p_event_type text,

    p_event_at timestamptz,

    p_recipient text,

    p_reason text,

    p_clicked_url text,

    p_payload jsonb

)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$

DECLARE

    v_notification_id bigint;

    v_event_id bigint;

    v_delivery_status text;

    v_stored_message_id text;

    v_stored_recipient text;

    v_profile_email text;

    v_expected_recipient text;

    v_message_id text;

    v_event_hash text;

    v_event_type text;

    v_recipient text;

    v_reason text;

    v_clicked_url text;

BEGIN

    v_message_id :=
        lower(
            btrim(
                coalesce(
                    p_provider_message_id,
                    ''
                ),
                '<> '
            )
        );


    v_event_hash :=
        lower(
            btrim(
                coalesce(
                    p_provider_event_hash,
                    ''
                )
            )
        );


    v_event_type :=
        lower(
            btrim(
                coalesce(
                    p_event_type,
                    ''
                )
            )
        );


    v_recipient :=
        nullif(
            lower(
                btrim(
                    coalesce(
                        p_recipient,
                        ''
                    )
                )
            ),
            ''
        );


    v_reason :=
        nullif(
            left(
                btrim(
                    coalesce(
                        p_reason,
                        ''
                    )
                ),
                4000
            ),
            ''
        );


    v_clicked_url :=
        nullif(
            left(
                btrim(
                    coalesce(
                        p_clicked_url,
                        ''
                    )
                ),
                4000
            ),
            ''
        );


    IF char_length(v_message_id) NOT BETWEEN 1 AND 500 THEN

        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Brevo provider_message_id inválido.';

    END IF;


    IF v_event_hash !~ '^[0-9a-f]{64}$' THEN

        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Brevo provider_event_hash inválido.';

    END IF;


    IF char_length(v_event_type) NOT BETWEEN 1 AND 64 THEN

        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Brevo event_type inválido.';

    END IF;


    IF p_event_at IS NULL THEN

        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Brevo event_at es obligatorio.';

    END IF;


    IF p_payload IS NULL
       OR jsonb_typeof(p_payload) <> 'object' THEN

        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Brevo payload debe ser un objeto JSON.';

    END IF;


    -- ========================================================
    -- LOCALIZACIÓN POR TAG/ID DE NOTIFICACIÓN
    -- ========================================================

    IF p_notification_id IS NOT NULL THEN

        SELECT
            notification.id,
            notification.email_provider_message_id,
            notification.email_recipient,
            profile.email
        INTO
            v_notification_id,
            v_stored_message_id,
            v_stored_recipient,
            v_profile_email
        FROM public.notifications AS notification
        LEFT JOIN public.profiles AS profile
            ON profile.id = notification.user_id
        WHERE notification.id = p_notification_id
          AND notification.tipo = 'tarea_asignada'
          AND notification.email_status IN (
              'processing',
              'sent'
          )
        FOR UPDATE OF notification;


        IF v_notification_id IS NULL THEN

            RETURN jsonb_build_object(
                'matched', false,
                'inserted', false,
                'reason', 'notification_not_found'
            );

        END IF;


        IF v_stored_message_id IS NOT NULL
           AND lower(
               btrim(
                   v_stored_message_id,
                   '<> '
               )
           ) <> v_message_id THEN

            RETURN jsonb_build_object(
                'matched', false,
                'inserted', false,
                'notification_id', v_notification_id,
                'reason', 'message_id_mismatch'
            );

        END IF;

    ELSE

        -- Compatibilidad con emails enviados antes de incorporar tags.
        SELECT
            notification.id,
            notification.email_provider_message_id,
            notification.email_recipient,
            profile.email
        INTO
            v_notification_id,
            v_stored_message_id,
            v_stored_recipient,
            v_profile_email
        FROM public.notifications AS notification
        LEFT JOIN public.profiles AS profile
            ON profile.id = notification.user_id
        WHERE notification.tipo = 'tarea_asignada'
          AND notification.email_status IN (
              'processing',
              'sent'
          )
          AND lower(
              btrim(
                  notification.email_provider_message_id,
                  '<> '
              )
          ) = v_message_id
        ORDER BY notification.id DESC
        LIMIT 1
        FOR UPDATE OF notification;


        IF v_notification_id IS NULL THEN

            RETURN jsonb_build_object(
                'matched', false,
                'inserted', false,
                'reason', 'notification_not_found'
            );

        END IF;

    END IF;


    -- ========================================================
    -- VALIDACIÓN DE DESTINATARIO
    -- ========================================================

    v_expected_recipient :=
        nullif(
            lower(
                btrim(
                    coalesce(
                        v_stored_recipient,
                        v_profile_email,
                        ''
                    )
                )
            ),
            ''
        );


    IF v_recipient IS NOT NULL
       AND v_expected_recipient IS NOT NULL
       AND v_recipient <> v_expected_recipient THEN

        RETURN jsonb_build_object(
            'matched', false,
            'inserted', false,
            'notification_id', v_notification_id,
            'reason', 'recipient_mismatch'
        );

    END IF;


    -- ========================================================
    -- EVENTO INMUTABLE E IDEMPOTENTE
    -- ========================================================

    INSERT INTO public.notification_email_events (
        notification_id,
        provider,
        provider_message_id,
        provider_event_id,
        provider_event_hash,
        event_type,
        event_at,
        recipient,
        reason,
        clicked_url,
        payload
    )
    VALUES (
        v_notification_id,
        'brevo',
        v_message_id,
        nullif(
            left(
                btrim(
                    coalesce(
                        p_provider_event_id,
                        ''
                    )
                ),
                200
            ),
            ''
        ),
        v_event_hash,
        v_event_type,
        p_event_at,
        v_recipient,
        v_reason,
        v_clicked_url,
        p_payload
    )
    ON CONFLICT (
        provider,
        provider_event_hash
    )
    DO NOTHING
    RETURNING id
    INTO v_event_id;


    IF v_event_id IS NULL THEN

        RETURN jsonb_build_object(
            'matched', true,
            'inserted', false,
            'notification_id', v_notification_id,
            'reason', 'duplicate_event'
        );

    END IF;


    -- ========================================================
    -- RESUMEN EN NOTIFICATIONS
    -- ========================================================

    UPDATE public.notifications AS notification
    SET
        email_provider =
            coalesce(
                notification.email_provider,
                'brevo'
            ),

        email_provider_message_id =
            coalesce(
                notification.email_provider_message_id,
                btrim(p_provider_message_id)
            ),

        email_recipient =
            coalesce(
                notification.email_recipient,
                v_recipient,
                v_expected_recipient
            ),

        email_delivery_status =
            CASE

                WHEN v_event_type = 'request' THEN
                    coalesce(
                        notification.email_delivery_status,
                        'accepted'
                    )

                WHEN v_event_type IN (
                    'deferred',
                    'soft_bounce'
                ) THEN
                    CASE
                        WHEN notification.email_delivery_status IN (
                            'delivered',
                            'hard_bounce',
                            'invalid_email',
                            'blocked',
                            'error',
                            'spam',
                            'unsubscribed'
                        ) THEN
                            notification.email_delivery_status
                        ELSE
                            v_event_type
                    END

                WHEN v_event_type = 'delivered' THEN
                    CASE
                        WHEN notification.email_delivery_status IN (
                            'hard_bounce',
                            'invalid_email',
                            'blocked',
                            'error',
                            'spam',
                            'unsubscribed'
                        ) THEN
                            notification.email_delivery_status
                        ELSE
                            'delivered'
                    END

                WHEN v_event_type IN (
                    'hard_bounce',
                    'invalid_email',
                    'blocked',
                    'error',
                    'spam',
                    'unsubscribed'
                ) THEN
                    v_event_type

                ELSE
                    notification.email_delivery_status

            END,

        email_delivery_last_event =
            CASE
                WHEN notification.email_delivery_last_event_at IS NULL
                     OR p_event_at >= notification.email_delivery_last_event_at
                THEN v_event_type
                ELSE notification.email_delivery_last_event
            END,

        email_delivery_last_event_at =
            CASE
                WHEN notification.email_delivery_last_event_at IS NULL
                     OR p_event_at >= notification.email_delivery_last_event_at
                THEN p_event_at
                ELSE notification.email_delivery_last_event_at
            END,

        email_delivered_at =
            CASE
                WHEN v_event_type = 'delivered'
                     AND (
                         notification.email_delivered_at IS NULL
                         OR p_event_at < notification.email_delivered_at
                     )
                THEN p_event_at
                ELSE notification.email_delivered_at
            END,

        email_first_opened_at =
            CASE
                WHEN v_event_type IN (
                    'unique_opened',
                    'opened'
                )
                     AND (
                         notification.email_first_opened_at IS NULL
                         OR p_event_at < notification.email_first_opened_at
                     )
                THEN p_event_at
                ELSE notification.email_first_opened_at
            END,

        email_last_opened_at =
            CASE
                WHEN v_event_type IN (
                    'unique_opened',
                    'opened'
                )
                     AND (
                         notification.email_last_opened_at IS NULL
                         OR p_event_at > notification.email_last_opened_at
                     )
                THEN p_event_at
                ELSE notification.email_last_opened_at
            END,

        email_open_count =
            CASE
                WHEN v_event_type = 'opened' THEN
                    notification.email_open_count + 1
                WHEN v_event_type = 'unique_opened' THEN
                    greatest(
                        notification.email_open_count,
                        1
                    )
                ELSE
                    notification.email_open_count
            END,

        email_first_clicked_at =
            CASE
                WHEN v_event_type = 'click'
                     AND (
                         notification.email_first_clicked_at IS NULL
                         OR p_event_at < notification.email_first_clicked_at
                     )
                THEN p_event_at
                ELSE notification.email_first_clicked_at
            END,

        email_last_clicked_at =
            CASE
                WHEN v_event_type = 'click'
                     AND (
                         notification.email_last_clicked_at IS NULL
                         OR p_event_at > notification.email_last_clicked_at
                     )
                THEN p_event_at
                ELSE notification.email_last_clicked_at
            END,

        email_click_count =
            CASE
                WHEN v_event_type = 'click' THEN
                    notification.email_click_count + 1
                ELSE
                    notification.email_click_count
            END,

        email_delivery_last_error =
            CASE

                WHEN v_event_type IN (
                    'hard_bounce',
                    'invalid_email',
                    'blocked',
                    'error',
                    'spam',
                    'unsubscribed'
                ) THEN
                    coalesce(
                        v_reason,
                        v_event_type
                    )

                WHEN v_event_type IN (
                    'deferred',
                    'soft_bounce'
                )
                     AND coalesce(
                         notification.email_delivery_status,
                         ''
                     ) NOT IN (
                         'delivered',
                         'hard_bounce',
                         'invalid_email',
                         'blocked',
                         'error',
                         'spam',
                         'unsubscribed'
                     ) THEN
                    coalesce(
                        v_reason,
                        v_event_type
                    )

                WHEN v_event_type = 'delivered'
                     AND coalesce(
                         notification.email_delivery_status,
                         ''
                     ) NOT IN (
                         'hard_bounce',
                         'invalid_email',
                         'blocked',
                         'error',
                         'spam',
                         'unsubscribed'
                     ) THEN
                    NULL

                ELSE
                    notification.email_delivery_last_error

            END

    WHERE notification.id = v_notification_id
    RETURNING notification.email_delivery_status
    INTO v_delivery_status;


    RETURN jsonb_build_object(
        'matched', true,
        'inserted', true,
        'notification_id', v_notification_id,
        'event_id', v_event_id,
        'delivery_status', v_delivery_status
    );

END;

$function$;


COMMENT ON FUNCTION public.record_brevo_email_event(
    bigint,
    text,
    text,
    text,
    text,
    timestamptz,
    text,
    text,
    text,
    jsonb
) IS
    'Registra de forma atómica e idempotente un evento transaccional de Brevo.';


REVOKE ALL
ON FUNCTION public.record_brevo_email_event(
    bigint,
    text,
    text,
    text,
    text,
    timestamptz,
    text,
    text,
    text,
    jsonb
)
FROM PUBLIC, anon, authenticated;


GRANT EXECUTE
ON FUNCTION public.record_brevo_email_event(
    bigint,
    text,
    text,
    text,
    text,
    timestamptz,
    text,
    text,
    text,
    jsonb
)
TO service_role;


COMMIT;