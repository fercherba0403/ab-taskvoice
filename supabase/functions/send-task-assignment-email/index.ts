import {
    createClient,
    type SupabaseClient
} from 'npm:@supabase/supabase-js@2';


// ============================================================
// AB TASKVOICE
// Edge Function: send-task-assignment-email
//
// Procesa notificaciones de asignación creadas en el outbox.
// La asignación de la tarea ya fue confirmada antes de que esta
// función sea invocada por el Database Webhook.
// ============================================================


const BREVO_ENDPOINT =
    'https://api.brevo.com/v3/smtp/email';


const SENDER_NAME =
    'AB TaskVoice Reporte de turno';


const EMAIL_SUBJECT =
    'Nueva tarea asignada en AB TaskVoice';


const APPLICATION_URL =
    'https://reporteaubasa.pages.dev/trabajador/inicio.html';


const WEBHOOK_SECRET_HEADER =
    'x-taskvoice-webhook-secret';


const MAX_PROVIDER_ERROR_LENGTH =
    1000;


const EMAIL_PATTERN =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


type JsonObject =
    Record<string, unknown>;


type EmailStatus =
    'sent'
    | 'failed'
    | 'skipped';


interface ClaimedEmail {

    notification_id: number;

    task_id: number | null;

    email_attempts: number;

    email_idempotency_key: string | null;

    recipient: string | null;

    technician_name: string | null;

    profile_active: boolean | null;

    task_title: string | null;

}


interface EmailContent {

    htmlContent: string;

    textContent: string;

}


interface ProviderResult {

    code: string;

    message: string;

    messageId: string | null;

}


// ============================================================
// RESPUESTA JSON
// ============================================================

function jsonResponse(
    body: unknown,
    status = 200
) {

    return new Response(

        JSON.stringify(
            body
        ),

        {

            status,

            headers: {

                'Cache-Control':
                    'no-store',

                'Content-Type':
                    'application/json; charset=utf-8'

            }

        }

    );

}


// ============================================================
// VALIDACIONES BÁSICAS
// ============================================================

function isObject(
    value: unknown
): value is JsonObject {

    return (
        typeof value ===
            'object'
        &&
        value !==
            null
        &&
        !Array.isArray(
            value
        )
    );

}


function normalizeString(
    value: unknown
) {

    return typeof value ===
        'string'

        ? value.trim()

        : '';

}


function nullableString(
    value: unknown
) {

    const normalized =
        normalizeString(
            value
        );


    return normalized
        || null;

}


function isPositiveSafeInteger(
    value: unknown
) {

    const numericValue =
        Number(
            value
        );


    return (
        Number.isSafeInteger(
            numericValue
        )
        &&
        numericValue >
            0
    );

}


function parsePositiveSafeInteger(
    value: unknown
) {

    if (
        !isPositiveSafeInteger(
            value
        )
    ) {

        return null;

    }


    return Number(
        value
    );

}


function isValidEmail(
    value: string
) {

    return EMAIL_PATTERN.test(
        value
    );

}


function isUuid(
    value: string
) {

    return UUID_PATTERN.test(
        value
    );

}


// ============================================================
// COMPARACIÓN DEL SECRETO DEL WEBHOOK
// ============================================================

async function secureEquals(
    provided: string,
    expected: string
) {

    const encoder =
        new TextEncoder();


    const [
        providedHash,
        expectedHash
    ] =
        await Promise.all([

            crypto.subtle.digest(
                'SHA-256',
                encoder.encode(
                    provided
                )
            ),

            crypto.subtle.digest(
                'SHA-256',
                encoder.encode(
                    expected
                )
            )

        ]);


    const left =
        new Uint8Array(
            providedHash
        );


    const right =
        new Uint8Array(
            expectedHash
        );


    let difference =
        0;


    for (
        let index = 0;
        index < left.length;
        index += 1
    ) {

        difference |=
            left[index]
            ^
            right[index];

    }


    return difference ===
        0;

}


// ============================================================
// CLAIM DEVUELTO POR POSTGRESQL
// ============================================================

function parseClaimedEmail(
    value: unknown
): ClaimedEmail | null {

    if (!isObject(value)) {

        return null;

    }


    const notificationId =
        parsePositiveSafeInteger(
            value.notification_id
        );


    const attempts =
        parsePositiveSafeInteger(
            value.email_attempts
        );


    if (
        !notificationId
        ||
        !attempts
    ) {

        return null;

    }


    return {

        notification_id:
            notificationId,

        task_id:
            parsePositiveSafeInteger(
                value.task_id
            ),

        email_attempts:
            attempts,

        email_idempotency_key:
            nullableString(
                value.email_idempotency_key
            ),

        recipient:
            nullableString(
                value.recipient
            ),

        technician_name:
            nullableString(
                value.technician_name
            ),

        profile_active:
            typeof value.profile_active ===
                'boolean'

                ? value.profile_active

                : null,

        task_title:
            nullableString(
                value.task_title
            )

    };

}


// ============================================================
// CONTENIDO SEGURO DEL EMAIL
// ============================================================

function escapeHtml(
    value: string
) {

    return value
        .replaceAll(
            '&',
            '&amp;'
        )
        .replaceAll(
            '<',
            '&lt;'
        )
        .replaceAll(
            '>',
            '&gt;'
        )
        .replaceAll(
            '"',
            '&quot;'
        )
        .replaceAll(
            "'",
            '&#039;'
        );

}


function buildEmailContent(
    technicianName: string | null,
    taskTitle: string
): EmailContent {

    const safeName =
        technicianName

            ? escapeHtml(
                technicianName
                    .slice(
                        0,
                        120
                    )
            )

            : '';


    const safeTaskTitle =
        escapeHtml(
            taskTitle
                .slice(
                    0,
                    500
                )
        );


    const safeApplicationUrl =
        escapeHtml(
            APPLICATION_URL
        );


    const htmlGreeting =
        safeName

            ? `Hola, ${safeName}.`

            : 'Hola.';


    const textGreeting =
        technicianName

            ? `Hola, ${technicianName.slice(0, 120)}.`

            : 'Hola.';


    const htmlContent =
        `<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(EMAIL_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        Se te asignó una nueva tarea en AB TaskVoice.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f4f6;">
        <tr>
            <td align="center" style="padding:24px 12px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
                    <tr>
                        <td style="padding:28px;">
                            <p style="margin:0 0 8px;color:#2563eb;font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">
                                AB TaskVoice
                            </p>
                            <h1 style="margin:0 0 24px;color:#111827;font-size:24px;line-height:1.3;">
                                Nueva tarea asignada
                            </h1>
                            <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
                                ${htmlGreeting}
                            </p>
                            <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">
                                Se te asignó una nueva tarea:
                            </p>
                            <p style="margin:0 0 24px;padding:16px;background:#f9fafb;border-left:4px solid #2563eb;color:#111827;font-size:17px;font-weight:700;line-height:1.5;">
                                ${safeTaskTitle}
                            </p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="border-radius:8px;background:#2563eb;">
                                        <a href="${safeApplicationUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">
                                            Ver tarea en AB TaskVoice
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
                                Este es un aviso automático. La tarea permanece disponible dentro de AB TaskVoice.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;


    const textContent =
        [
            textGreeting,
            '',
            'Se te asignó una nueva tarea:',
            taskTitle.slice(
                0,
                500
            ),
            '',
            'Ingresá a AB TaskVoice para consultar los detalles:',
            APPLICATION_URL,
            '',
            'Este es un aviso automático.'
        ]
            .join(
                '\n'
            );


    return {
        htmlContent,
        textContent
    };

}


// ============================================================
// ESTADO FINAL DEL OUTBOX
// ============================================================

async function updateClaimedNotification(
    adminClient: SupabaseClient,
    claim: ClaimedEmail,
    values: JsonObject
) {

    const {
        data,
        error
    } =
        await adminClient

            .from(
                'notifications'
            )

            .update(
                values
            )

            .eq(
                'id',
                claim.notification_id
            )

            .eq(
                'email_status',
                'processing'
            )

            .eq(
                'email_attempts',
                claim.email_attempts
            )

            .select(
                'id'
            )

            .maybeSingle();


    if (
        error
        ||
        !data
    ) {

        console.error(
            'send-task-assignment-email update outbox:',
            claim.notification_id,
            error?.message
            ??
            'No matching processing row.'
        );


        return false;

    }


    return true;

}


function retryAtForAttempt(
    attempts: number
) {

    if (
        attempts >=
        5
    ) {

        return null;

    }


    const retryMinutes = [
        5,
        15,
        60,
        360
    ];


    const minutes =
        retryMinutes[
            Math.min(
                attempts - 1,
                retryMinutes.length - 1
            )
        ];


    return new Date(
        Date.now()
        +
        minutes
        *
        60_000
    )
        .toISOString();

}


async function markSkipped(
    adminClient: SupabaseClient,
    claim: ClaimedEmail,
    reason: string,
    recipient: string | null
) {

    return updateClaimedNotification(

        adminClient,

        claim,

        {

            email_status:
                'skipped' satisfies EmailStatus,

            email_recipient:
                recipient,

            email_provider:
                null,

            email_provider_message_id:
                null,

            email_last_error:
                reason.slice(
                    0,
                    MAX_PROVIDER_ERROR_LENGTH
                ),

            email_next_retry_at:
                null,

            email_sent_at:
                null

        }

    );

}


async function markFailed(
    adminClient: SupabaseClient,
    claim: ClaimedEmail,
    reason: string,
    recipient: string | null,
    provider = 'brevo'
) {

    return updateClaimedNotification(

        adminClient,

        claim,

        {

            email_status:
                'failed' satisfies EmailStatus,

            email_recipient:
                recipient,

            email_provider:
                provider,

            email_provider_message_id:
                null,

            email_last_error:
                reason.slice(
                    0,
                    MAX_PROVIDER_ERROR_LENGTH
                ),

            email_next_retry_at:
                retryAtForAttempt(
                    claim.email_attempts
                ),

            email_sent_at:
                null

        }

    );

}


async function markSandboxAccepted(
    adminClient: SupabaseClient,
    claim: ClaimedEmail,
    recipient: string,
    providerMessageId: string | null
) {

    return updateClaimedNotification(

        adminClient,

        claim,

        {

            email_status:
                'skipped' satisfies EmailStatus,

            email_recipient:
                recipient,

            email_provider:
                'brevo_sandbox',

            email_provider_message_id:
                providerMessageId,

            email_last_error:
                'Sandbox de Brevo: solicitud aceptada sin entregar el email.',

            email_next_retry_at:
                null,

            email_sent_at:
                null

        }

    );

}


async function markSent(
    adminClient: SupabaseClient,
    claim: ClaimedEmail,
    recipient: string,
    providerMessageId: string | null
) {

    return updateClaimedNotification(

        adminClient,

        claim,

        {

            email_status:
                'sent' satisfies EmailStatus,

            email_recipient:
                recipient,

            email_provider:
                'brevo',

            email_provider_message_id:
                providerMessageId,

            email_last_error:
                null,

            email_next_retry_at:
                null,

            email_sent_at:
                new Date()
                    .toISOString()

        }

    );

}


// ============================================================
// RESPUESTA DE BREVO
// ============================================================

function parseProviderResult(
    responseText: string
): ProviderResult {

    let body:
        unknown =
            null;


    try {

        body =
            JSON.parse(
                responseText
            );

    } catch {

        body =
            null;

    }


    if (!isObject(body)) {

        return {

            code:
                '',

            message:
                responseText
                    .trim()
                    .slice(
                        0,
                        MAX_PROVIDER_ERROR_LENGTH
                    ),

            messageId:
                null

        };

    }


    return {

        code:
            normalizeString(
                body.code
            ),

        message:
            normalizeString(
                body.message
            ),

        messageId:
            nullableString(
                body.messageId
            )

    };

}


function providerErrorMessage(
    status: number,
    providerResult: ProviderResult
) {

    const detail = [
        providerResult.code,
        providerResult.message
    ]
        .filter(Boolean)
        .join(
            ': '
        );


    return (
        detail

            ? `Brevo HTTP ${status}: ${detail}`

            : `Brevo HTTP ${status}.`
    )
        .slice(
            0,
            MAX_PROVIDER_ERROR_LENGTH
        );

}


function isIdempotencyDuplicate(
    providerResult: ProviderResult
) {

    return (
        providerResult.code ===
            'duplicate_parameter'
        &&
        providerResult.message
            .toLowerCase()
            .includes(
                'idempotency'
            )
    );

}


function errorMessage(
    error: unknown
) {

    if (
        error instanceof
        Error
    ) {

        return error.message
            .slice(
                0,
                MAX_PROVIDER_ERROR_LENGTH
            );

    }


    return 'Unexpected server error.';

}


// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================

Deno.serve(

    async (
        request: Request
    ) => {


        if (
            request.method !==
            'POST'
        ) {

            return jsonResponse(
                {
                    error:
                        'Método no permitido.'
                },
                405
            );

        }


        const expectedWebhookSecret =
            Deno.env.get(
                'TASK_EMAIL_WEBHOOK_SECRET'
            )
                ?.trim()
            ??
            '';


        if (!expectedWebhookSecret) {

            console.error(
                'TASK_EMAIL_WEBHOOK_SECRET no configurado.'
            );


            return jsonResponse(
                {
                    error:
                        'Configuración del servidor incompleta.'
                },
                500
            );

        }


        const providedWebhookSecret =
            request.headers.get(
                WEBHOOK_SECRET_HEADER
            )
                ?.trim()
            ??
            '';


        if (
            !providedWebhookSecret
            ||
            !await secureEquals(
                providedWebhookSecret,
                expectedWebhookSecret
            )
        ) {

            return jsonResponse(
                {
                    error:
                        'Solicitud no autorizada.'
                },
                401
            );

        }


        let payload:
            unknown;


        try {

            payload =
                await request.json();

        } catch {

            return jsonResponse(
                {
                    error:
                        'Payload JSON inválido.'
                },
                400
            );

        }


        if (!isObject(payload)) {

            return jsonResponse(
                {
                    error:
                        'Payload inválido.'
                },
                400
            );

        }


        if (
            payload.type !==
                'INSERT'
            ||
            payload.schema !==
                'public'
            ||
            payload.table !==
                'notifications'
        ) {

            return jsonResponse({

                ok:
                    true,

                processed:
                    false,

                reason:
                    'ignored_event'

            });

        }


        if (!isObject(payload.record)) {

            return jsonResponse(
                {
                    error:
                        'Registro de notificación inválido.'
                },
                400
            );

        }


        const notificationId =
            parsePositiveSafeInteger(
                payload.record.id
            );


        if (!notificationId) {

            return jsonResponse(
                {
                    error:
                        'notification_id inválido.'
                },
                400
            );

        }


        if (
            payload.record.tipo !==
                'tarea_asignada'
            ||
            payload.record.email_status !==
                'pending'
        ) {

            return jsonResponse({

                ok:
                    true,

                processed:
                    false,

                notification_id:
                    notificationId,

                reason:
                    'not_an_assignment_email'

            });

        }


        const supabaseUrl =
            Deno.env.get(
                'SUPABASE_URL'
            );


        const serviceRoleKey =
            Deno.env.get(
                'SUPABASE_SERVICE_ROLE_KEY'
            );


        if (
            !supabaseUrl
            ||
            !serviceRoleKey
        ) {

            console.error(
                'Variables administrativas de Supabase incompletas.'
            );


            return jsonResponse(
                {
                    error:
                        'Configuración del servidor incompleta.'
                },
                500
            );

        }


        const adminClient =
            createClient(

                supabaseUrl,

                serviceRoleKey,

                {

                    auth: {

                        persistSession:
                            false,

                        autoRefreshToken:
                            false

                    }

                }

            );


        let activeClaim:
            ClaimedEmail
            | null =
                null;


        let activeProvider =
            'brevo';


        try {

            const {
                data:
                    claimData,
                error:
                    claimError
            } =
                await adminClient
                    .rpc(
                        'claim_task_assignment_email',
                        {
                            p_notification_id:
                                notificationId
                        }
                    );


            if (claimError) {

                console.error(
                    'send-task-assignment-email claim:',
                    notificationId,
                    claimError.message
                );


                return jsonResponse(
                    {
                        error:
                            'No fue posible reclamar la notificación.'
                    },
                    500
                );

            }


            const rawClaim =
                Array.isArray(
                    claimData
                )

                    ? claimData[0]

                    : claimData;


            if (!rawClaim) {

                return jsonResponse({

                    ok:
                        true,

                    processed:
                        false,

                    notification_id:
                        notificationId,

                    reason:
                        'not_claimable'

                });

            }


            activeClaim =
                parseClaimedEmail(
                    rawClaim
                );


            if (!activeClaim) {

                console.error(
                    'Claim inválido:',
                    notificationId
                );


                return jsonResponse(
                    {
                        error:
                            'La reclamación devolvió datos inválidos.'
                    },
                    500
                );

            }


            const recipient =
                activeClaim.recipient
                    ?.toLowerCase()
                    .trim()
                ??
                null;


            if (
                activeClaim.profile_active !==
                true
            ) {

                const updated =
                    await markSkipped(
                        adminClient,
                        activeClaim,
                        'El Técnico está inactivo o no tiene un perfil válido.',
                        recipient
                    );


                return jsonResponse(
                    {

                        ok:
                            updated,

                        processed:
                            updated,

                        status:
                            'skipped',

                        notification_id:
                            notificationId

                    },
                    updated
                        ? 200
                        : 500
                );

            }


            if (
                !recipient
                ||
                !isValidEmail(
                    recipient
                )
            ) {

                const updated =
                    await markSkipped(
                        adminClient,
                        activeClaim,
                        'El Técnico no tiene un email válido.',
                        null
                    );


                return jsonResponse(
                    {

                        ok:
                            updated,

                        processed:
                            updated,

                        status:
                            'skipped',

                        notification_id:
                            notificationId

                    },
                    updated
                        ? 200
                        : 500
                );

            }


            if (
                !activeClaim.task_id
                ||
                !activeClaim.task_title
            ) {

                const updated =
                    await markSkipped(
                        adminClient,
                        activeClaim,
                        'La tarea vinculada no existe o no tiene título.',
                        recipient
                    );


                return jsonResponse(
                    {

                        ok:
                            updated,

                        processed:
                            updated,

                        status:
                            'skipped',

                        notification_id:
                            notificationId

                    },
                    updated
                        ? 200
                        : 500
                );

            }


            if (
                !activeClaim.email_idempotency_key
                ||
                !isUuid(
                    activeClaim.email_idempotency_key
                )
            ) {

                const updated =
                    await markFailed(
                        adminClient,
                        activeClaim,
                        'La notificación no tiene una clave de idempotencia válida.',
                        recipient
                    );


                return jsonResponse(
                    {

                        ok:
                            false,

                        processed:
                            updated,

                        status:
                            'failed',

                        notification_id:
                            notificationId

                    },
                    500
                );

            }


            const brevoApiKey =
                Deno.env.get(
                    'BREVO_API_KEY'
                )
                    ?.trim()
                ??
                '';


            const senderEmail =
                Deno.env.get(
                    'BREVO_SENDER_EMAIL'
                )
                    ?.trim()
                    .toLowerCase()
                ??
                '';


            const brevoSandboxMode =
                normalizeString(
                    Deno.env.get(
                        'BREVO_SANDBOX_MODE'
                    )
                )
                    .toLowerCase() ===
                'true';


            activeProvider =
                brevoSandboxMode
                    ? 'brevo_sandbox'
                    : 'brevo';


            if (
                !brevoApiKey
                ||
                !isValidEmail(
                    senderEmail
                )
            ) {

                const updated =
                    await markFailed(
                        adminClient,
                        activeClaim,
                        'La configuración de Brevo está incompleta.',
                        recipient
                    );


                return jsonResponse(
                    {

                        ok:
                            false,

                        processed:
                            updated,

                        status:
                            'failed',

                        notification_id:
                            notificationId

                    },
                    500
                );

            }


            const technicianName =
                activeClaim.technician_name
                    ?.slice(
                        0,
                        120
                    )
                ??
                null;


            const emailContent =
                buildEmailContent(
                    technicianName,
                    activeClaim.task_title
                );


            const recipientDefinition =
                technicianName

                    ? {
                        email:
                            recipient,
                        name:
                            technicianName
                    }

                    : {
                        email:
                            recipient
                    };


            const brevoHeaders:
                Record<string, string> = {

                    Accept:
                        'application/json',

                    'Content-Type':
                        'application/json',

                    'api-key':
                        brevoApiKey

                };


            if (brevoSandboxMode) {

                brevoHeaders[
                    'X-Sib-Sandbox'
                ] =
                    'drop';

            }


            const brevoResponse =
                await fetch(

                    BREVO_ENDPOINT,

                    {

                        method:
                            'POST',

                        headers:
                            brevoHeaders,

                        body:
                            JSON.stringify({

                                sender: {

                                    name:
                                        SENDER_NAME,

                                    email:
                                        senderEmail

                                },

                                to: [
                                    recipientDefinition
                                ],

                                subject:
                                    EMAIL_SUBJECT,

                                htmlContent:
                                    emailContent
                                        .htmlContent,

                                textContent:
                                    emailContent
                                        .textContent,

                                headers: {

                                    idempotencyKey:
                                        activeClaim
                                            .email_idempotency_key

                                }

                            }),

                        signal:
                            AbortSignal.timeout(
                                6_000
                            )

                    }

                );


            const providerText =
                await brevoResponse
                    .text();


            const providerResult =
                parseProviderResult(
                    providerText
                );


            if (
                brevoResponse.ok
                ||
                isIdempotencyDuplicate(
                    providerResult
                )
            ) {

                if (brevoSandboxMode) {

                    const updated =
                        await markSandboxAccepted(
                            adminClient,
                            activeClaim,
                            recipient,
                            providerResult
                                .messageId
                        );


                    return jsonResponse(
                        {

                            ok:
                                updated,

                            processed:
                                updated,

                            status:
                                'skipped',

                            sandbox:
                                true,

                            notification_id:
                                notificationId

                        },
                        updated
                            ? 200
                            : 500
                    );

                }


                const updated =
                    await markSent(
                        adminClient,
                        activeClaim,
                        recipient,
                        providerResult
                            .messageId
                    );


                if (!updated) {

                    return jsonResponse(
                        {
                            error:
                                'Brevo aceptó el email, pero no pudo actualizarse el outbox.'
                        },
                        500
                    );

                }


                return jsonResponse({

                    ok:
                        true,

                    processed:
                        true,

                    status:
                        'sent',

                    notification_id:
                        notificationId

                });

            }


            const updated =
                await markFailed(
                    adminClient,
                    activeClaim,
                    providerErrorMessage(
                        brevoResponse.status,
                        providerResult
                    ),
                    recipient,
                    brevoSandboxMode
                        ? 'brevo_sandbox'
                        : 'brevo'
                );


            return jsonResponse(
                {

                    ok:
                        false,

                    processed:
                        updated,

                    status:
                        'failed',

                    notification_id:
                        notificationId

                },
                502
            );


        } catch (error) {

            const reason =
                `Error interno: ${errorMessage(error)}`;


            console.error(
                'send-task-assignment-email:',
                notificationId,
                reason
            );


            if (activeClaim) {

                try {

                    await markFailed(
                        adminClient,
                        activeClaim,
                        reason,
                        activeClaim.recipient,
                        activeProvider
                    );

                } catch (updateError) {

                    console.error(
                        'send-task-assignment-email recovery update:',
                        notificationId,
                        errorMessage(
                            updateError
                        )
                    );

                }

            }


            return jsonResponse(
                {
                    error:
                        'Error interno procesando el email.'
                },
                500
            );

        }

    }

);