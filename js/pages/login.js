// ============================================================
// TASKVOICE
// login.js
// ============================================================

import {
  getCurrentProfile,
  login,
  logout,
  redirectByRole,
} from "../core/auth.js";

// ============================================================
// ELEMENTOS
// ============================================================

const form = document.getElementById("loginForm");

const emailInput = document.getElementById("email");

const passwordInput = document.getElementById("password");

const loginButton = document.getElementById("loginButton");

const message = document.getElementById("loginMessage");

const togglePassword = document.getElementById("togglePassword");

// ============================================================
// MENSAJES
// ============================================================

function showMessage(text, type = "error") {
  message.textContent = text;

  message.className = `form-message ${type}`;
}

function clearMessage() {
  message.textContent = "";

  message.className = "form-message";
}

// ============================================================
// MOSTRAR / OCULTAR PASSWORD
// ============================================================

togglePassword.addEventListener("click", () => {
  const hidden = passwordInput.type === "password";

  passwordInput.type = hidden ? "text" : "password";

  togglePassword.textContent = hidden ? "Ocultar" : "Ver";
});

// ============================================================
// LOGIN
// ============================================================

form.addEventListener(
  "submit",

  async (event) => {
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

      const profile = await getCurrentProfile();

      if (!profile) {
        await logout();

        throw new Error("No se encontró el perfil del usuario.");
      }

      if (!profile.activo) {
        await logout();

        throw new Error("El usuario se encuentra inactivo.");
      }

      showMessage("Ingreso correcto.", "success");

      redirectByRole(profile, "./");
    } catch (error) {
      console.error(error);

      showMessage("Correo electrónico o contraseña incorrectos.");

      loginButton.disabled = false;

      loginButton.textContent = "Ingresar";
    }
  },
);

// ============================================================
// SI YA EXISTE SESIÓN
// ============================================================

async function checkExistingSession() {
  try {
    const profile = await getCurrentProfile();

    if (profile && profile.activo) {
      redirectByRole(profile, "./");
    }
  } catch (error) {
    console.error(error);
  }
}

checkExistingSession();
