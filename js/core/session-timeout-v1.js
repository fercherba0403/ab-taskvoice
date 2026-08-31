// ============================================================
// AB TASKVOICE
// session-timeout-v1.js
//
// Límite absoluto de sesión en el navegador.
// La renovación automática del JWT no modifica este vencimiento.
// ============================================================

export const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const SESSION_LIFETIME_KEY = "taskvoice_session_lifetime_v1";
const SESSION_CONTROL_EVENT_KEY = "taskvoice_session_control_event_v1";
const FALLBACK_CHECK_INTERVAL_MS = 30 * 1000;

let memoryRecord = null;
let expirationTimeoutId = null;
let fallbackIntervalId = null;
let monitoredIdentity = null;
let sessionEndHandler = null;
let listenersBound = false;
let sessionEndSignaled = false;

function getStorage(name) {
  try {
    return window[name] ?? null;
  } catch {
    return null;
  }
}

function readStoredValue(key) {
  for (const storageName of ["localStorage", "sessionStorage"]) {
    const storage = getStorage(storageName);

    if (!storage) {
      continue;
    }

    try {
      const value = storage.getItem(key);

      if (value !== null) {
        return value;
      }
    } catch {
      // Se intenta con el siguiente almacenamiento disponible.
    }
  }

  return null;
}

function writeStoredValue(key, value) {
  for (const storageName of ["localStorage", "sessionStorage"]) {
    const storage = getStorage(storageName);

    if (!storage) {
      continue;
    }

    try {
      storage.setItem(key, value);

      return true;
    } catch {
      // Se intenta con el siguiente almacenamiento disponible.
    }
  }

  return false;
}

function removeStoredValue(key) {
  for (const storageName of ["localStorage", "sessionStorage"]) {
    const storage = getStorage(storageName);

    if (!storage) {
      continue;
    }

    try {
      storage.removeItem(key);
    } catch {
      // La limpieza continúa en los demás almacenamientos.
    }
  }
}

function parseJson(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function decodeJwtPayload(accessToken) {
  if (typeof accessToken !== "string") {
    return null;
  }

  const encodedPayload = accessToken.split(".")[1];

  if (!encodedPayload) {
    return null;
  }

  try {
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );

    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function getSessionIdentity(session) {
  const payload = decodeJwtPayload(session?.access_token);

  return {
    userId: session?.user?.id ?? null,
    sessionId: payload?.session_id ?? null,
  };
}

function normalizeRecord(record) {
  if (
    !record ||
    typeof record.userId !== "string" ||
    !Number.isFinite(record.startedAt)
  ) {
    return null;
  }

  return {
    userId: record.userId,
    sessionId:
      typeof record.sessionId === "string" ? record.sessionId : null,
    startedAt: record.startedAt,
    expiresAt: record.startedAt + SESSION_MAX_AGE_MS,
  };
}

function recordsBelongToSameSession(record, identity) {
  if (!record || record.userId !== identity.userId) {
    return false;
  }

  if (record.sessionId && identity.sessionId) {
    return record.sessionId === identity.sessionId;
  }

  return true;
}

function getServerSessionStart(session, now) {
  const lastSignInAt = Date.parse(session?.user?.last_sign_in_at ?? "");

  if (!Number.isFinite(lastSignInAt) || lastSignInAt > now + 5 * 60 * 1000) {
    return now;
  }

  return lastSignInAt;
}

function createRecord(session, now, forceNew) {
  const identity = getSessionIdentity(session);

  if (!identity.userId) {
    return null;
  }

  if (!forceNew) {
    const currentRecord = getSessionLifetimeRecord();

    if (recordsBelongToSameSession(currentRecord, identity)) {
      return currentRecord;
    }
  }

  const startedAt = forceNew ? now : getServerSessionStart(session, now);

  return {
    ...identity,
    startedAt,
    expiresAt: startedAt + SESSION_MAX_AGE_MS,
  };
}

function saveRecord(record) {
  memoryRecord = record;

  writeStoredValue(SESSION_LIFETIME_KEY, JSON.stringify(record));
}

function clearTimers() {
  if (expirationTimeoutId !== null) {
    window.clearTimeout(expirationTimeoutId);
    expirationTimeoutId = null;
  }

  if (fallbackIntervalId !== null) {
    window.clearInterval(fallbackIntervalId);
    fallbackIntervalId = null;
  }
}

function eventMatchesCurrentSession(eventData) {
  if (!eventData || !monitoredIdentity) {
    return false;
  }

  return recordsBelongToSameSession(eventData, monitoredIdentity);
}

function createEventNonce() {
  try {
    return window.crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function publishSessionEnd(reason) {
  const record = getSessionLifetimeRecord();

  if (!record) {
    return;
  }

  writeStoredValue(
    SESSION_CONTROL_EVENT_KEY,
    JSON.stringify({
      ...record,
      reason,
      emittedAt: Date.now(),
      nonce: createEventNonce(),
    }),
  );
}

function signalSessionEnd(reason, broadcast) {
  if (sessionEndSignaled) {
    return;
  }

  sessionEndSignaled = true;
  clearTimers();

  if (broadcast) {
    publishSessionEnd(reason);
  }

  if (typeof sessionEndHandler === "function") {
    void sessionEndHandler(reason);
  }
}

function checkExpiration() {
  const record = getSessionLifetimeRecord();

  if (!record || !recordsBelongToSameSession(record, monitoredIdentity)) {
    return;
  }

  if (isSessionExpired(record)) {
    signalSessionEnd("expired", true);
  }
}

function scheduleExpiration(record) {
  clearTimers();

  const remaining = Math.max(0, record.expiresAt - Date.now());

  if (remaining === 0) {
    signalSessionEnd("expired", true);

    return;
  }

  expirationTimeoutId = window.setTimeout(
    () => signalSessionEnd("expired", true),
    remaining,
  );

  // Respaldo para pestañas suspendidas o cambios del reloj del dispositivo.
  fallbackIntervalId = window.setInterval(
    checkExpiration,
    FALLBACK_CHECK_INTERVAL_MS,
  );
}

function handleStorageEvent(event) {
  if (event.key === SESSION_CONTROL_EVENT_KEY && event.newValue) {
    const controlEvent = normalizeRecord(parseJson(event.newValue));
    const completeEvent = parseJson(event.newValue);

    if (
      eventMatchesCurrentSession(controlEvent) &&
      ["expired", "logout"].includes(completeEvent?.reason)
    ) {
      signalSessionEnd(completeEvent.reason, false);
    }

    return;
  }

  if (event.key !== SESSION_LIFETIME_KEY || !event.newValue) {
    return;
  }

  const updatedRecord = normalizeRecord(parseJson(event.newValue));

  if (!recordsBelongToSameSession(updatedRecord, monitoredIdentity)) {
    return;
  }

  memoryRecord = updatedRecord;

  if (isSessionExpired(updatedRecord)) {
    signalSessionEnd("expired", true);
  } else {
    scheduleExpiration(updatedRecord);
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    checkExpiration();
  }
}

function bindListeners() {
  if (listenersBound) {
    return;
  }

  window.addEventListener("storage", handleStorageEvent);
  window.addEventListener("focus", checkExpiration);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  listenersBound = true;
}

function unbindListeners() {
  if (!listenersBound) {
    return;
  }

  window.removeEventListener("storage", handleStorageEvent);
  window.removeEventListener("focus", checkExpiration);
  document.removeEventListener("visibilitychange", handleVisibilityChange);

  listenersBound = false;
}

export function getSessionLifetimeRecord() {
  const storedRecord = normalizeRecord(
    parseJson(readStoredValue(SESSION_LIFETIME_KEY)),
  );

  if (storedRecord) {
    memoryRecord = storedRecord;
  }

  return storedRecord ?? memoryRecord;
}

export function isSessionExpired(record, now = Date.now()) {
  return !record || now >= record.expiresAt;
}

export function registerSessionLifetime(session) {
  const record = createRecord(session, Date.now(), true);

  if (!record) {
    throw new Error("No fue posible identificar la sesión autenticada.");
  }

  saveRecord(record);

  return record;
}

export function monitorSessionLifetime(session, onSessionEnd) {
  const record = createRecord(session, Date.now(), false);

  if (!record) {
    return {
      active: false,
      expired: false,
      record: null,
    };
  }

  saveRecord(record);

  monitoredIdentity = getSessionIdentity(session);
  sessionEndHandler = onSessionEnd;
  sessionEndSignaled = false;

  bindListeners();

  if (isSessionExpired(record)) {
    return {
      active: false,
      expired: true,
      record,
    };
  }

  scheduleExpiration(record);

  return {
    active: true,
    expired: false,
    record,
  };
}

export function broadcastSessionLogout() {
  publishSessionEnd("logout");
}

export function broadcastSessionExpiration() {
  publishSessionEnd("expired");
}

export function stopSessionLifetimeMonitor() {
  clearTimers();
  unbindListeners();

  monitoredIdentity = null;
  sessionEndHandler = null;
  sessionEndSignaled = false;
}

export function clearSessionLifetime() {
  memoryRecord = null;

  removeStoredValue(SESSION_LIFETIME_KEY);
}
