// ============================================================
// TASKVOICE
// login-v3.js
//
// Login + contraseña temporal + selección de perfil.
// ============================================================

import {
  getCurrentProfile,
  getCurrentUser,
  login,
  loginWithPasskey,
  logout,
  redirectAfterAuthentication,
  redirectToPasswordChange,
  requiresPasswordChange,
} from "../core/auth-v3.js?v=20260828-01";

import {
  getPasskeyErrorCode,
  isPasskeyUserCancellation,
  rememberPasskeyEnrollmentForUser,
  requestPasskeyEnrollmentAfterPasswordLogin,
  supportsPlatformPasskeys,
} from "../components/passkey-enrollment-v1.js?v=20260828-01";

const form = document.getElementById("loginForm");

const emailInput = document.getElementById("email");

const passwordInput = document.getElementById("password");

const loginButton = document.getElementById("loginButton");

const passkeyLoginButton = document.getElementById("passkeyLoginButton");

const passkeyDivider = document.getElementById("passkeyDivider");

const message = document.getElementById("loginMessage");

const togglePassword = document.getElementById("togglePassword");

function showMessage(text, type = "error") {
  message.textContent = text;

  message.className = `form-message ${type}`;
}

function clearMessage() {
  message.textContent = "";

  message.className = "form-message";
}

function setAuthenticationControlsDisabled(disabled) {
  emailInput.disabled = disabled;

  passwordInput.disabled = disabled;

  loginButton.disabled = disabled;

  passkeyLoginButton.disabled = disabled;

  togglePassword.disabled = disabled;
}

async function completeAuthentication({
  authenticatedUser = null,
  requestPasskeyEnrollment = false,
} = {}) {
  const user = authenticatedUser ?? (await getCurrentUser());

  const profile = await getCurrentProfile();

  if (!user || !profile) {
    await logout();

    throw new Error("No se encontró el perfil del usuario.");
  }

  if (!profile.activo) {
    await logout();

    throw new Error("El usuario se encuentra inactivo.");
  }

  if (requiresPasswordChange(user)) {
    redirectToPasswordChange("./");

    return;
  }

  if (requestPasskeyEnrollment) {
    requestPasskeyEnrollmentAfterPasswordLogin();
  }

  showMessage("Ingreso correcto.", "success");

  await redirectAfterAuthentication(profile, "./");
}

function showUrlMessage() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("password_changed") === "1") {
    showMessage(
      "Contraseña actualizada. Ingresá nuevamente con tu nueva contraseña.",
      "success",
    );
  }
}

togglePassword.addEventListener("click", () => {
  const hidden = passwordInput.type === "password";

  passwordInput.type = hidden ? "text" : "password";

  togglePassword.textContent = hidden ? "Ocultar" : "Ver";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearMessage();

  const email = emailInput.value.trim();

  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("Ingresá correo electrónico y contraseña.");

    return;
  }

  setAuthenticationControlsDisabled(true);

  loginButton.textContent = "Ingresando...";

  try {
    await login(email, password);

    await completeAuthentication({ requestPasskeyEnrollment: true });
  } catch (error) {
    console.error(error);

    showMessage("Correo electrónico o contraseña incorrectos.");

    setAuthenticationControlsDisabled(false);

    loginButton.textContent = "Ingresar";
  }
});

passkeyLoginButton.addEventListener("click", async () => {
  clearMessage();

  setAuthenticationControlsDisabled(true);

  passkeyLoginButton.querySelector("span").textContent = "Verificando...";

  try {
    const authentication = await loginWithPasskey();

    if (authentication.user?.id) {
      rememberPasskeyEnrollmentForUser(authentication.user.id);
    }

    await completeAuthentication({
      authenticatedUser: authentication.user ?? null,
    });
  } catch (error) {
    const errorCode = getPasskeyErrorCode(error);

    if (isPasskeyUserCancellation(error)) {
      showMessage(
        "Acceso rápido cancelado. Podés ingresar con usuario y contraseña.",
        "info",
      );
    } else if (errorCode === "webauthn_credential_not_found") {
      showMessage(
        "No encontramos un acceso rápido válido. Ingresá con usuario y contraseña.",
        "info",
      );
    } else {
      console.error("Error ingresando con passkey:", error);

      showMessage(
        "No pudimos completar el acceso rápido. Ingresá con usuario y contraseña.",
      );
    }

    setAuthenticationControlsDisabled(false);

    passkeyLoginButton.querySelector("span").textContent =
      "Ingresar con acceso rápido";
  }
});

async function configurePasskeyLogin() {
  try {
    if (!(await supportsPlatformPasskeys())) {
      return;
    }

    passkeyDivider.hidden = false;

    passkeyLoginButton.hidden = false;
  } catch (error) {
    console.error("Error comprobando compatibilidad con passkeys:", error);
  }
}

async function checkExistingSession() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return;
    }

    const profile = await getCurrentProfile();

    if (!profile || !profile.activo) {
      return;
    }

    if (requiresPasswordChange(user)) {
      redirectToPasswordChange("./");

      return;
    }

    await redirectAfterAuthentication(profile, "./");
  } catch (error) {
    console.error(error);
  }
}

showUrlMessage();

configurePasskeyLogin();

checkExistingSession();
