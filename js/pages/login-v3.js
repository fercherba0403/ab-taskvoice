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
  logout,
  redirectAfterAuthentication,
  redirectToPasswordChange,
  requiresPasswordChange,
} from "../core/auth-v3.js";

import {
  requestPasskeyEnrollmentAfterPasswordLogin,
} from "../components/passkey-enrollment-v1.js";

const form = document.getElementById("loginForm");

const emailInput = document.getElementById("email");

const passwordInput = document.getElementById("password");

const loginButton = document.getElementById("loginButton");

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

  loginButton.disabled = true;

  loginButton.textContent = "Ingresando...";

  try {
    await login(email, password);

    const user = await getCurrentUser();

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

    requestPasskeyEnrollmentAfterPasswordLogin();

    showMessage("Ingreso correcto.", "success");

    await redirectAfterAuthentication(profile, "./");
  } catch (error) {
    console.error(error);

    showMessage("Correo electrónico o contraseña incorrectos.");

    loginButton.disabled = false;

    loginButton.textContent = "Ingresar";
  }
});

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

checkExistingSession();
