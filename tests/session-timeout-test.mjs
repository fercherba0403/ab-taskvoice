import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

const browserWindow = new EventTarget();

browserWindow.localStorage = new MemoryStorage();
browserWindow.sessionStorage = new MemoryStorage();
browserWindow.setTimeout = globalThis.setTimeout;
browserWindow.clearTimeout = globalThis.clearTimeout;
browserWindow.setInterval = globalThis.setInterval;
browserWindow.clearInterval = globalThis.clearInterval;
browserWindow.atob = globalThis.atob;
browserWindow.crypto = globalThis.crypto;

const browserDocument = new EventTarget();

browserDocument.visibilityState = "visible";

globalThis.window = browserWindow;
globalThis.document = browserDocument;

const sourceUrl = new URL(
  "../js/core/session-timeout-v1.js",
  import.meta.url,
);
const source = await readFile(sourceUrl, "utf8");
const encodedSource = Buffer.from(source).toString("base64");
const sessionTimeout = await import(
  `data:text/javascript;base64,${encodedSource}`
);

function createAccessToken(sessionId) {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({ session_id: sessionId }),
  ).toString("base64url");

  return `${header}.${payload}.signature`;
}

function createSession({ userId, sessionId, lastSignInAt }) {
  return {
    access_token: createAccessToken(sessionId),
    user: {
      id: userId,
      last_sign_in_at: lastSignInAt,
    },
  };
}

const realDateNow = Date.now;
const initialTime = Date.parse("2026-08-31T12:00:00.000Z");
let currentTime = initialTime;

Date.now = () => currentTime;

try {
  const session = createSession({
    userId: "user-1",
    sessionId: "session-1",
    lastSignInAt: new Date(initialTime).toISOString(),
  });

  assert.equal(sessionTimeout.SESSION_MAX_AGE_MS, 7_200_000);

  const initialRecord = sessionTimeout.registerSessionLifetime(session);

  assert.equal(initialRecord.startedAt, initialTime);
  assert.equal(initialRecord.expiresAt, initialTime + 7_200_000);
  assert.equal(
    sessionTimeout.isSessionExpired(
      initialRecord,
      initialTime + 7_200_000 - 1,
    ),
    false,
  );
  assert.equal(
    sessionTimeout.isSessionExpired(
      initialRecord,
      initialTime + 7_200_000,
    ),
    true,
  );

  currentTime = initialTime + 60 * 60 * 1000;

  const restoredState = sessionTimeout.monitorSessionLifetime(
    session,
    () => {},
  );

  assert.equal(restoredState.active, true);
  assert.equal(restoredState.record.startedAt, initialTime);

  sessionTimeout.stopSessionLifetimeMonitor();

  currentTime = initialTime + 65 * 60 * 1000;

  const newSession = createSession({
    userId: "user-1",
    sessionId: "session-2",
    lastSignInAt: new Date(currentTime).toISOString(),
  });
  const renewedRecord = sessionTimeout.registerSessionLifetime(newSession);

  assert.equal(renewedRecord.startedAt, currentTime);
  assert.equal(renewedRecord.sessionId, "session-2");

  sessionTimeout.clearSessionLifetime();

  currentTime = initialTime + 3 * 60 * 60 * 1000;

  const expiredSession = createSession({
    userId: "user-2",
    sessionId: "session-3",
    lastSignInAt: new Date(initialTime).toISOString(),
  });
  const expiredState = sessionTimeout.monitorSessionLifetime(
    expiredSession,
    () => {},
  );

  assert.equal(expiredState.expired, true);
  assert.equal(expiredState.active, false);

  sessionTimeout.stopSessionLifetimeMonitor();
  sessionTimeout.clearSessionLifetime();

  currentTime = initialTime;

  const timerSession = createSession({
    userId: "user-3",
    sessionId: "session-4",
    lastSignInAt: new Date(initialTime).toISOString(),
  });

  sessionTimeout.registerSessionLifetime(timerSession);

  let scheduledExpiration = null;
  let receivedReason = null;

  browserWindow.setTimeout = (callback) => {
    scheduledExpiration = callback;

    return 1;
  };
  browserWindow.clearTimeout = () => {};
  browserWindow.setInterval = () => 2;
  browserWindow.clearInterval = () => {};

  const timerState = sessionTimeout.monitorSessionLifetime(
    timerSession,
    (reason) => {
      receivedReason = reason;
    },
  );

  assert.equal(timerState.active, true);
  assert.equal(typeof scheduledExpiration, "function");

  scheduledExpiration();

  assert.equal(receivedReason, "expired");

  const controlEvent = JSON.parse(
    browserWindow.localStorage.getItem(
      "taskvoice_session_control_event_v1",
    ),
  );

  assert.equal(controlEvent.reason, "expired");
  assert.equal(controlEvent.sessionId, "session-4");

  sessionTimeout.stopSessionLifetimeMonitor();
  sessionTimeout.clearSessionLifetime();

  console.log("session-timeout-test: OK");
} finally {
  Date.now = realDateNow;
}
