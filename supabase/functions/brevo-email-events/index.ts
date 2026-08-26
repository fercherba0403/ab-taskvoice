import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// ============================================================
// AB TASKVOICE
// Edge Function: brevo-email-events
//
// Recibe eventos transaccionales enviados por Brevo.
//
// Seguridad:
// - Verify JWT debe permanecer desactivado.
// - Brevo envía Authorization: Bearer <BREVO_WEBHOOK_SECRET>.
// - La función compara el token mediante SHA-256.
// - Solo service_role puede ejecutar la RPC de persistencia.
// ============================================================

const MAX_BODY_BYTES = 128 * 1024;

const MAX_REASON_LENGTH = 4000;

const MAX_URL_LENGTH = 4000;

const TASKVOICE_NOTIFICATION_TAG = "ab_taskvoice_notification_";

type JsonRecord = Record<string, unknown>;

type RpcResult = {
  matched?: boolean;

  inserted?: boolean;

  notification_id?: number;

  event_id?: number;

  delivery_status?: string | null;

  reason?: string;
};

// ============================================================
// RESPUESTAS JSON
// ============================================================

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// ============================================================
// NORMALIZACIÓN
// ============================================================

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMessageId(value: unknown): string {
  return normalizeString(value).replace(/^<|>$/g, "").trim().toLowerCase();
}

function truncateText(value: unknown, maxLength: number): string | null {
  const normalized = normalizeString(value);

  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeInteger(value: unknown): number | null {
  const normalized = normalizeString(value);

  if (typeof value !== "number" && !/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(normalized);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function normalizeEmail(value: unknown): string | null {
  const normalized = normalizeString(value).toLowerCase();

  if (
    !normalized ||
    normalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

// ============================================================
// SEGURIDAD
// ============================================================

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return new Uint8Array(digest);
}

async function secureEquals(
  provided: string,
  expected: string,
): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([
    sha256Bytes(provided),
    sha256Bytes(expected),
  ]);

  let difference = 0;

  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= providedHash[index] ^ expectedHash[index];
  }

  return difference === 0;
}

function readBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization")?.trim() ?? "";

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() ?? "";
}

// ============================================================
// FECHA DEL EVENTO
// ============================================================

function parseNumericTimestamp(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : Number(normalizeString(value));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseEpochMilliseconds(value: unknown): number | null {
  const parsed = parseNumericTimestamp(value);

  if (parsed === null) {
    return null;
  }

  return parsed >= 100_000_000_000
    ? Math.trunc(parsed)
    : Math.trunc(parsed * 1000);
}

function resolveEventDate(payload: JsonRecord): Date | null {
  const milliseconds =
    parseEpochMilliseconds(payload.ts_epoch) ??
    parseEpochMilliseconds(payload.ts_event) ??
    parseEpochMilliseconds(payload.ts);

  if (milliseconds === null) {
    return null;
  }

  const date = new Date(milliseconds);

  const minimum = Date.UTC(2020, 0, 1);

  const maximum = Date.now() + 24 * 60 * 60 * 1000;

  if (
    Number.isNaN(date.getTime()) ||
    date.getTime() < minimum ||
    date.getTime() > maximum
  ) {
    return null;
  }

  return date;
}

// ============================================================
// TAG DE CORRELACIÓN
// ============================================================

function appendTags(destination: string[], value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeString(item);

      if (normalized) {
        destination.push(normalized);
      }
    }

    return;
  }

  const normalized = normalizeString(value);

  if (!normalized) {
    return;
  }

  try {
    const parsed = JSON.parse(normalized);

    if (Array.isArray(parsed)) {
      appendTags(destination, parsed);

      return;
    }
  } catch {
    // Algunos eventos antiguos envían tag como texto simple.
  }

  destination.push(normalized);
}

function extractNotificationId(payload: JsonRecord): number | null {
  const tags: string[] = [];

  appendTags(tags, payload.tags);

  appendTags(tags, payload.tag);

  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();

    if (!normalized.startsWith(TASKVOICE_NOTIFICATION_TAG)) {
      continue;
    }

    const notificationId = normalizeInteger(
      normalized.slice(TASKVOICE_NOTIFICATION_TAG.length),
    );

    if (notificationId !== null) {
      return notificationId;
    }
  }

  return null;
}

// ============================================================
// HASH CANÓNICO PARA IDEMPOTENCIA
// ============================================================

function normalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }

  if (isJsonRecord(value)) {
    const normalized: JsonRecord = {};

    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeJsonValue(value[key]);
    }

    return normalized;
  }

  return value;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createEventHash(payload: JsonRecord): Promise<string> {
  const canonicalPayload = JSON.stringify(normalizeJsonValue(payload));

  return bytesToHex(await sha256Bytes(canonicalPayload));
}

// ============================================================
// CAMPOS OPCIONALES DE BREVO
// ============================================================

function resolveReason(payload: JsonRecord): string | null {
  return truncateText(
    payload.reason ?? payload.message ?? payload.description,
    MAX_REASON_LENGTH,
  );
}

function resolveClickedUrl(payload: JsonRecord): string | null {
  return truncateText(payload.link ?? payload.url, MAX_URL_LENGTH);
}

// ============================================================
// RPC
// ============================================================

async function recordEvent(
  adminClient: SupabaseClient,
  payload: JsonRecord,
): Promise<RpcResult> {
  const eventType = normalizeString(payload.event).toLowerCase();

  const messageId = normalizeMessageId(
    payload["message-id"] ?? payload.messageId,
  );

  const recipient = normalizeEmail(payload.email);

  const eventDate = resolveEventDate(payload);

  if (
    !eventType ||
    eventType.length > 64 ||
    !messageId ||
    messageId.length > 500 ||
    recipient === null ||
    eventDate === null
  ) {
    throw new Error("Payload transaccional de Brevo inválido.");
  }

  const providerEventId =
    normalizeString(payload.id) ||
    (typeof payload.id === "number" ? String(payload.id) : "");

  const eventHash = await createEventHash(payload);

  const { data, error } = await adminClient.rpc("record_brevo_email_event", {
    p_notification_id: extractNotificationId(payload),

    p_provider_message_id: messageId,

    p_provider_event_id: providerEventId || null,

    p_provider_event_hash: eventHash,

    p_event_type: eventType,

    p_event_at: eventDate.toISOString(),

    p_recipient: recipient,

    p_reason: resolveReason(payload),

    p_clicked_url: resolveClickedUrl(payload),

    p_payload: payload,
  });

  if (error) {
    throw new Error(`No se pudo registrar el evento: ${error.message}`);
  }

  if (!isJsonRecord(data)) {
    throw new Error("La RPC devolvió una respuesta inválida.");
  }

  return data as RpcResult;
}

// ============================================================
// SERVIDOR
// ============================================================

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: "Método no permitido.",
      },
      405,
    );
  }

  const webhookSecret = Deno.env.get("BREVO_WEBHOOK_SECRET")?.trim() ?? "";

  if (webhookSecret.length < 32) {
    console.error("brevo-email-events: BREVO_WEBHOOK_SECRET no configurado.");

    return jsonResponse(
      {
        error: "Configuración interna incompleta.",
      },
      500,
    );
  }

  const providedToken = readBearerToken(request);

  if (!providedToken || !(await secureEquals(providedToken, webhookSecret))) {
    return jsonResponse(
      {
        error: "Solicitud no autorizada.",
      },
      401,
    );
  }

  const contentLength = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10,
  );

  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse(
      {
        error: "Solicitud demasiado grande.",
      },
      413,
    );
  }

  const rawBody = await request.text();

  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return jsonResponse(
      {
        error: "Solicitud demasiado grande.",
      },
      413,
    );
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse(
      {
        error: "JSON inválido.",
      },
      400,
    );
  }

  if (!isJsonRecord(payload)) {
    return jsonResponse(
      {
        error: "El cuerpo debe ser un objeto JSON.",
      },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";

  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("brevo-email-events: configuración de Supabase incompleta.");

    return jsonResponse(
      {
        error: "Configuración interna incompleta.",
      },
      500,
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const result = await recordEvent(adminClient, payload);

    return jsonResponse({
      ok: true,
      processed: result.inserted === true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido.";

    console.error("brevo-email-events:", message);

    return jsonResponse(
      {
        error: "No se pudo procesar el evento.",
      },
      500,
    );
  }
});
