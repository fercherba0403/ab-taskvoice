// ============================================================
// TASKVOICE
// transcribe-execution-report
//
// Transcribe un reporte parcial sin finalizar la tarea.
//
// Seguridad:
// - requiere un JWT valido de Supabase Auth
// - valida organizacion, usuario activo, rol o asignacion
// - reclama atomicamente el reporte mediante una RPC privada
// - usa service_role y GROQ_API_KEY solo dentro del servidor
// - limita el cuerpo HTTP y el tamano del audio
// ============================================================

import {
    createClient,
    type SupabaseClient
} from 'npm:@supabase/supabase-js@2';


const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};


const MAX_BODY_BYTES = 16 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_TRANSCRIPTION_CHARS = 100000;
const GROQ_TIMEOUT_MS = 70000;


type JsonObject = Record<string, unknown>;


type ClaimResult =
    | 'claimed'
    | 'existing'
    | 'busy'
    | 'attempts_exhausted';


interface ClaimRow {
    report_id: number;
    execution_id: number;
    audio_path: string;
    task_title: string | null;
    ticket_number: string | null;
    transcription_status: string;
    transcription_attempts: number;
    existing_transcription: string | null;
    claim_result: ClaimResult;
}


interface ActiveClaim {
    reportId: number;
    attempt: number;
}


function jsonResponse(
    body: JsonObject,
    status = 200
) {
    return new Response(
        JSON.stringify(body),
        {
            status,
            headers: {
                ...CORS_HEADERS,
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
            }
        }
    );
}


function getRequiredEnvironmentVariable(
    name: string
) {
    const value = Deno.env.get(name)?.trim();

    if (!value) {
        throw new Error(`Configuracion faltante: ${name}.`);
    }

    return value;
}


function getBearerToken(
    authorizationHeader: string | null
) {
    const match = authorizationHeader?.match(
        /^Bearer\s+([^\s]+)$/i
    );

    return match?.[1] ?? null;
}


async function readJsonBody(
    request: Request
) {
    const declaredLength = Number(
        request.headers.get('content-length')
    );

    if (
        Number.isFinite(declaredLength)
        && declaredLength > MAX_BODY_BYTES
    ) {
        throw new RangeError('El cuerpo de la solicitud es demasiado grande.');
    }

    const rawBody = await request.text();
    const actualLength = new TextEncoder().encode(rawBody).byteLength;

    if (actualLength > MAX_BODY_BYTES) {
        throw new RangeError('El cuerpo de la solicitud es demasiado grande.');
    }

    if (!rawBody.trim()) {
        throw new SyntaxError('El cuerpo de la solicitud esta vacio.');
    }

    const parsed = JSON.parse(rawBody) as unknown;

    if (
        typeof parsed !== 'object'
        || parsed === null
        || Array.isArray(parsed)
    ) {
        throw new SyntaxError('El cuerpo JSON debe ser un objeto.');
    }

    return parsed as JsonObject;
}


function getMimeType(
    fileName: string
) {
    const extension = fileName
        .split('.')
        .pop()
        ?.toLowerCase();

    const mimeTypes: Record<string, string> = {
        webm: 'audio/webm',
        ogg: 'audio/ogg',
        mp4: 'audio/mp4',
        mp3: 'audio/mpeg',
        wav: 'audio/wav'
    };

    return mimeTypes[extension ?? ''] ?? 'audio/webm';
}


function getErrorMessage(
    error: unknown
) {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}


function normalizeStoredError(
    context: string,
    error: unknown
) {
    return `${context}: ${getErrorMessage(error)}`
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000);
}


async function finishTranscriptionAttempt(
    adminClient: SupabaseClient,
    reportId: number,
    attempt: number,
    transcription: string | null,
    errorMessage: string | null
) {
    const {
        data,
        error
    } = await adminClient.rpc(
        'finish_execution_report_transcription',
        {
            p_report_id: reportId,
            p_attempt: attempt,
            p_transcription: transcription,
            p_error: errorMessage
        }
    );

    if (error) {
        throw error;
    }

    return data === true;
}


async function markAttemptFailed(
    adminClient: SupabaseClient,
    claim: ActiveClaim,
    errorMessage: string
) {
    try {
        const updated = await finishTranscriptionAttempt(
            adminClient,
            claim.reportId,
            claim.attempt,
            null,
            errorMessage
        );

        if (!updated) {
            console.warn(
                'transcribe-execution-report: el intento fallido ya no era el activo.',
                claim.reportId,
                claim.attempt
            );
        }
    } catch (error) {
        console.error(
            'transcribe-execution-report: no se pudo guardar el error del intento.',
            claim.reportId,
            claim.attempt,
            getErrorMessage(error)
        );
    }
}


function claimErrorResponse(
    message: string
) {
    const normalized = message.toLowerCase();

    if (normalized.includes('reporte inexistente')) {
        return jsonResponse(
            {error: 'Reporte inexistente.'},
            404
        );
    }

    if (
        normalized.includes('acceso denegado')
        || normalized.includes('no tiene acceso')
        || normalized.includes('usuario inexistente')
        || normalized.includes('usuario inactivo')
    ) {
        return jsonResponse(
            {error: 'Acceso denegado.'},
            403
        );
    }

    return jsonResponse(
        {error: 'No fue posible reclamar el reporte para transcribirlo.'},
        500
    );
}


Deno.serve(
    async (
        request: Request
    ) => {
        if (request.method === 'OPTIONS') {
            return new Response(
                null,
                {
                    status: 204,
                    headers: CORS_HEADERS
                }
            );
        }


        if (request.method !== 'POST') {
            return jsonResponse(
                {error: 'Metodo no permitido.'},
                405
            );
        }


        let adminClient: SupabaseClient | null = null;
        let activeClaim: ActiveClaim | null = null;


        try {
            const supabaseUrl = getRequiredEnvironmentVariable(
                'SUPABASE_URL'
            );
            const anonKey = getRequiredEnvironmentVariable(
                'SUPABASE_ANON_KEY'
            );
            const serviceRoleKey = getRequiredEnvironmentVariable(
                'SUPABASE_SERVICE_ROLE_KEY'
            );
            const groqApiKey = getRequiredEnvironmentVariable(
                'GROQ_API_KEY'
            );


            const authorizationHeader = request.headers.get(
                'Authorization'
            );
            const token = getBearerToken(authorizationHeader);


            if (!authorizationHeader || !token) {
                return jsonResponse(
                    {error: 'Usuario no autenticado.'},
                    401
                );
            }


            const userClient = createClient(
                supabaseUrl,
                anonKey,
                {
                    global: {
                        headers: {
                            Authorization: authorizationHeader
                        }
                    },
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false
                    }
                }
            );


            const {
                data: {
                    user
                },
                error: userError
            } = await userClient.auth.getUser(token);


            if (userError || !user) {
                return jsonResponse(
                    {error: 'Sesion invalida.'},
                    401
                );
            }


            let body: JsonObject;

            try {
                body = await readJsonBody(request);
            } catch (error) {
                const status = error instanceof RangeError
                    ? 413
                    : 400;

                return jsonResponse(
                    {error: getErrorMessage(error)},
                    status
                );
            }


            const reportId = Number(body.report_id);

            if (
                !Number.isSafeInteger(reportId)
                || reportId <= 0
            ) {
                return jsonResponse(
                    {error: 'report_id invalido.'},
                    400
                );
            }


            adminClient = createClient(
                supabaseUrl,
                serviceRoleKey,
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false
                    }
                }
            );


            const {
                data: claimData,
                error: claimError
            } = await adminClient.rpc(
                'claim_execution_report_transcription',
                {
                    p_report_id: reportId,
                    p_requester_id: user.id
                }
            );


            if (claimError) {
                console.error(
                    'transcribe-execution-report claim:',
                    claimError.message
                );

                return claimErrorResponse(claimError.message);
            }


            const claimRows = claimData as ClaimRow[] | null;
            const claim = claimRows?.[0];


            if (!claim) {
                return jsonResponse(
                    {error: 'La solicitud no produjo un reclamo valido.'},
                    409
                );
            }


            if (claim.claim_result === 'existing') {
                return jsonResponse({
                    ok: true,
                    existing: true,
                    report_id: claim.report_id,
                    execution_id: claim.execution_id,
                    transcription:
                        claim.existing_transcription ?? ''
                });
            }


            if (claim.claim_result === 'busy') {
                return jsonResponse(
                    {
                        error: 'Este reporte ya se esta transcribiendo.',
                        retryable: true,
                        report_id: claim.report_id
                    },
                    409
                );
            }


            if (claim.claim_result === 'attempts_exhausted') {
                return jsonResponse(
                    {
                        error: 'El reporte alcanzo el maximo de cinco intentos.',
                        retryable: false,
                        report_id: claim.report_id
                    },
                    429
                );
            }


            if (claim.claim_result !== 'claimed') {
                return jsonResponse(
                    {error: 'Estado de reclamo no reconocido.'},
                    500
                );
            }


            if (
                !Number.isSafeInteger(claim.transcription_attempts)
                || claim.transcription_attempts <= 0
                || !claim.audio_path
            ) {
                return jsonResponse(
                    {error: 'El reclamo contiene datos invalidos.'},
                    500
                );
            }


            activeClaim = {
                reportId: claim.report_id,
                attempt: claim.transcription_attempts
            };


            const {
                data: audioBlob,
                error: audioError
            } = await adminClient
                .storage
                .from('audios')
                .download(claim.audio_path);


            if (audioError || !audioBlob) {
                const storedError = normalizeStoredError(
                    'Storage',
                    audioError?.message ?? 'Audio no disponible.'
                );

                await markAttemptFailed(
                    adminClient,
                    activeClaim,
                    storedError
                );
                activeClaim = null;

                return jsonResponse(
                    {error: 'No fue posible obtener el audio.'},
                    500
                );
            }


            if (audioBlob.size > MAX_AUDIO_BYTES) {
                await markAttemptFailed(
                    adminClient,
                    activeClaim,
                    'El audio supera el limite de 25 MB.'
                );
                activeClaim = null;

                return jsonResponse(
                    {error: 'El audio supera el limite permitido.'},
                    413
                );
            }


            const fileName = claim.audio_path
                .split('/')
                .pop() ?? 'audio.webm';
            const mimeType = audioBlob.type.startsWith('audio/')
                ? audioBlob.type
                : getMimeType(fileName);
            const audioFile = new File(
                [audioBlob],
                fileName,
                {type: mimeType}
            );


            const formData = new FormData();
            formData.append('file', audioFile);
            formData.append('model', 'whisper-large-v3-turbo');
            formData.append('language', 'es');
            formData.append('response_format', 'json');
            formData.append(
                'prompt',
                [
                    'Informe tecnico de mantenimiento en espanol.',
                    'Transcribir fielmente el audio.',
                    'Conservar numeros, siglas, nombres de equipos,',
                    'marcas, componentes, medidas y terminos tecnicos.',
                    claim.task_title
                        ? `Tarea: ${claim.task_title}.`
                        : '',
                    claim.ticket_number
                        ? `Ticket: ${claim.ticket_number}.`
                        : ''
                ]
                    .filter(Boolean)
                    .join(' ')
            );


            const controller = new AbortController();
            const timeoutId = setTimeout(
                () => controller.abort(),
                GROQ_TIMEOUT_MS
            );


            let groqResponse: Response;

            try {
                groqResponse = await fetch(
                    'https://api.groq.com/openai/v1/audio/transcriptions',
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${groqApiKey}`
                        },
                        body: formData,
                        signal: controller.signal
                    }
                );
            } catch (error) {
                const timedOut =
                    error instanceof DOMException
                    && error.name === 'AbortError';
                const storedError = timedOut
                    ? 'Groq: tiempo de espera agotado.'
                    : normalizeStoredError('Groq network', error);

                await markAttemptFailed(
                    adminClient,
                    activeClaim,
                    storedError
                );
                activeClaim = null;

                return jsonResponse(
                    {
                        error: timedOut
                            ? 'La transcripcion excedio el tiempo de espera.'
                            : 'No fue posible conectar con el servicio de transcripcion.'
                    },
                    timedOut ? 504 : 502
                );
            } finally {
                clearTimeout(timeoutId);
            }


            if (!groqResponse.ok) {
                const errorText = (
                    await groqResponse.text()
                ).slice(0, 500);

                console.error(
                    'transcribe-execution-report Groq:',
                    groqResponse.status,
                    errorText
                );

                await markAttemptFailed(
                    adminClient,
                    activeClaim,
                    normalizeStoredError(
                        `Groq HTTP ${groqResponse.status}`,
                        errorText || 'Respuesta sin detalle.'
                    )
                );
                activeClaim = null;

                return jsonResponse(
                    {error: 'No fue posible transcribir el audio.'},
                    502
                );
            }


            let transcriptionResult: JsonObject;

            try {
                transcriptionResult =
                    await groqResponse.json() as JsonObject;
            } catch (error) {
                await markAttemptFailed(
                    adminClient,
                    activeClaim,
                    normalizeStoredError('Groq JSON', error)
                );
                activeClaim = null;

                return jsonResponse(
                    {error: 'El servicio devolvio una respuesta invalida.'},
                    502
                );
            }


            const transcription =
                typeof transcriptionResult.text === 'string'
                    ? transcriptionResult.text.trim()
                    : '';


            if (!transcription) {
                await markAttemptFailed(
                    adminClient,
                    activeClaim,
                    'Groq devolvio una transcripcion vacia.'
                );
                activeClaim = null;

                return jsonResponse(
                    {error: 'La transcripcion fue devuelta vacia.'},
                    502
                );
            }


            if (transcription.length > MAX_TRANSCRIPTION_CHARS) {
                await markAttemptFailed(
                    adminClient,
                    activeClaim,
                    'La transcripcion supera el limite de caracteres.'
                );
                activeClaim = null;

                return jsonResponse(
                    {error: 'La transcripcion supera el limite permitido.'},
                    502
                );
            }


            const saved = await finishTranscriptionAttempt(
                adminClient,
                activeClaim.reportId,
                activeClaim.attempt,
                transcription,
                null
            );

            activeClaim = null;


            if (!saved) {
                return jsonResponse(
                    {error: 'El intento fue reemplazado por otro proceso.'},
                    409
                );
            }


            return jsonResponse({
                ok: true,
                existing: false,
                report_id: claim.report_id,
                execution_id: claim.execution_id,
                attempt: claim.transcription_attempts,
                transcription
            });
        } catch (error) {
            console.error(
                'transcribe-execution-report:',
                getErrorMessage(error)
            );


            if (adminClient && activeClaim) {
                await markAttemptFailed(
                    adminClient,
                    activeClaim,
                    normalizeStoredError('Error interno', error)
                );
            }


            return jsonResponse(
                {error: 'Error interno de transcripcion.'},
                500
            );
        }
    }
);