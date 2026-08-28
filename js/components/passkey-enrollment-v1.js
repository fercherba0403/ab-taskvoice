// ============================================================
// TASKVOICE
// passkey-enrollment-v1.js
//
// Consentimiento y registro de passkeys después de un acceso
// tradicional con correo electrónico y contraseña.
// ============================================================

import { supabase } from "../core/supabase.js";

const ENROLLMENT_REQUEST_KEY = "taskvoice_passkey_enrollment_requested";

const ENROLLED_USERS_KEY = "taskvoice_passkey_enrolled_users";

const COMPONENT_SELECTOR = "[data-passkey-enrollment-component]";

function readStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    storage.setItem(key, value);

    return true;
  } catch {
    return false;
  }
}

function removeStorage(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // El acceso tradicional continúa aunque el almacenamiento
    // del navegador no se encuentre disponible.
  }
}

export function requestPasskeyEnrollmentAfterPasswordLogin() {
  writeStorage(sessionStorage, ENROLLMENT_REQUEST_KEY, "1");
}

function hasPendingEnrollmentRequest() {
  return readStorage(sessionStorage, ENROLLMENT_REQUEST_KEY) === "1";
}

function clearPendingEnrollmentRequest() {
  removeStorage(sessionStorage, ENROLLMENT_REQUEST_KEY);
}

function getEnrolledUsers() {
  const storedValue = readStorage(localStorage, ENROLLED_USERS_KEY);

  if (!storedValue) {
    return [];
  }

  try {
    const users = JSON.parse(storedValue);

    return Array.isArray(users)
      ? users.filter((userId) => typeof userId === "string")
      : [];
  } catch {
    return [];
  }
}

export function rememberPasskeyEnrollmentForUser(userId) {
  if (typeof userId !== "string" || !userId) {
    return;
  }

  const users = new Set(getEnrolledUsers());

  users.add(userId);

  writeStorage(localStorage, ENROLLED_USERS_KEY, JSON.stringify([...users]));
}

function isUserRememberedAsEnrolled(userId) {
  return getEnrolledUsers().includes(userId);
}

export function isMobilePasskeyDevice() {
  const clientHintMobile = navigator.userAgentData?.mobile;

  if (typeof clientHintMobile === "boolean") {
    return clientHintMobile;
  }

  const userAgent = navigator.userAgent ?? "";

  const isIphone = /iPhone|iPod/i.test(userAgent);

  const isAndroidPhone =
    /Android/i.test(userAgent) && /Mobile/i.test(userAgent);

  return isIphone || isAndroidPhone;
}

export async function supportsPlatformPasskeys() {
  if (
    !window.isSecureContext ||
    typeof window.PublicKeyCredential !== "function" ||
    !navigator.credentials
  ) {
    return false;
  }

  const availabilityCheck =
    window.PublicKeyCredential
      .isUserVerifyingPlatformAuthenticatorAvailable;

  if (typeof availabilityCheck !== "function") {
    return true;
  }

  try {
    return await availabilityCheck.call(window.PublicKeyCredential);
  } catch {
    return false;
  }
}

export function getPasskeyErrorCode(error) {
  return (
    error?.code ??
    error?.cause?.code ??
    error?.originalError?.code ??
    ""
  );
}

export function isPasskeyUserCancellation(error) {
  const names = [
    error?.name,
    error?.cause?.name,
    error?.originalError?.name,
  ];

  if (names.includes("NotAllowedError") || names.includes("AbortError")) {
    return true;
  }

  const message = `${error?.message ?? ""} ${error?.cause?.message ?? ""}`;

  return /cancel|notallowed|not allowed|timed out|timeout|abort/i.test(message);
}

function createIcon() {
  const icon = document.createElement("span");

  icon.className = "passkey-enrollment__icon";

  icon.setAttribute("aria-hidden", "true");

  icon.innerHTML = `
    <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
      <path d="M12 2a5 5 0 0 0-5 5v3H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Zm3 4a2 2 0 0 1 1 3.73V19h-2v-1.27A2 2 0 0 1 12 14Z" />
    </svg>
  `;

  return icon;
}

function createEnrollmentNotice(userId) {
  const notice = document.createElement("aside");

  notice.className = "passkey-enrollment";

  notice.dataset.passkeyEnrollmentComponent = "";

  notice.setAttribute("aria-labelledby", "passkeyEnrollmentTitle");

  const header = document.createElement("div");

  header.className = "passkey-enrollment__header";

  const heading = document.createElement("div");

  const title = document.createElement("h2");

  title.id = "passkeyEnrollmentTitle";

  title.textContent = "Acceso rápido en este dispositivo";

  const description = document.createElement("p");

  description.textContent =
    "Ingresá usando la seguridad del dispositivo: huella, rostro, PIN o patrón.";

  heading.append(title, description);

  header.append(createIcon(), heading);

  const recovery = document.createElement("p");

  recovery.className = "passkey-enrollment__recovery";

  recovery.textContent =
    "Tu usuario y contraseña seguirán disponibles como método de recuperación.";

  const status = document.createElement("p");

  status.className = "passkey-enrollment__status";

  status.setAttribute("role", "status");

  status.setAttribute("aria-live", "polite");

  const actions = document.createElement("div");

  actions.className = "passkey-enrollment__actions";

  const activateButton = document.createElement("button");

  activateButton.type = "button";

  activateButton.className = "passkey-enrollment__primary";

  activateButton.textContent = "Activar acceso rápido";

  const dismissButton = document.createElement("button");

  dismissButton.type = "button";

  dismissButton.className = "passkey-enrollment__secondary";

  dismissButton.textContent = "Ahora no";

  actions.append(activateButton, dismissButton);

  notice.append(header, recovery, status, actions);

  function setBusy(isBusy) {
    notice.setAttribute("aria-busy", String(isBusy));

    activateButton.disabled = isBusy;

    dismissButton.disabled = isBusy;

    activateButton.textContent = isBusy
      ? "Activando..."
      : "Activar acceso rápido";
  }

  function showCompletion(message, type) {
    clearPendingEnrollmentRequest();

    status.textContent = message;

    status.dataset.type = type;

    activateButton.hidden = true;

    dismissButton.disabled = false;

    dismissButton.textContent = "Cerrar";

    notice.setAttribute("aria-busy", "false");
  }

  dismissButton.addEventListener("click", () => {
    clearPendingEnrollmentRequest();

    notice.remove();
  });

  activateButton.addEventListener("click", async () => {
    status.textContent = "";

    delete status.dataset.type;

    setBusy(true);

    try {
      const { error } = await supabase.auth.registerPasskey();

      if (error) {
        throw error;
      }

      rememberPasskeyEnrollmentForUser(userId);

      showCompletion(
        "Acceso rápido activado correctamente en este dispositivo.",
        "success",
      );
    } catch (error) {
      const errorCode = getPasskeyErrorCode(error);

      if (errorCode === "webauthn_credential_exists") {
        rememberPasskeyEnrollmentForUser(userId);

        showCompletion(
          "El acceso rápido ya estaba disponible en este dispositivo.",
          "success",
        );

        return;
      }

      if (isPasskeyUserCancellation(error)) {
        showCompletion(
          "No se activó el acceso rápido. Podés continuar usando la aplicación normalmente.",
          "neutral",
        );

        return;
      }

      console.error("Error registrando passkey:", error);

      status.textContent =
        errorCode === "too_many_passkeys"
          ? "La cuenta alcanzó el límite de accesos rápidos. El ingreso con contraseña continúa disponible."
          : "No pudimos activar el acceso rápido. Podés intentarlo nuevamente o continuar con contraseña.";

      status.dataset.type = "error";

      setBusy(false);
    }
  });

  return notice;
}

export async function initializePasskeyEnrollment() {
  if (
    !document.body?.hasAttribute("data-passkey-enrollment") ||
    !hasPendingEnrollmentRequest() ||
    document.querySelector(COMPONENT_SELECTOR)
  ) {
    return;
  }

  const { data, error } = await supabase.auth.getUser();

  const user = data?.user ?? null;

  if (error || !user) {
    clearPendingEnrollmentRequest();

    return;
  }

  if (isUserRememberedAsEnrolled(user.id)) {
    clearPendingEnrollmentRequest();

    return;
  }

  if (!isMobilePasskeyDevice() || !(await supportsPlatformPasskeys())) {
    clearPendingEnrollmentRequest();

    return;
  }

  document.body.append(createEnrollmentNotice(user.id));
}

function autoInitialize() {
  initializePasskeyEnrollment().catch((error) => {
    console.error("Error inicializando acceso rápido:", error);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoInitialize, { once: true });
} else {
  autoInitialize();
}
