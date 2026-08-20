// ============================================================
// TASKVOICE
// first-password-v1.js
//
// Cambio obligatorio de la contraseña temporal.
// ============================================================

import { supabase } from "../core/supabase.js";

import {
  getCurrentProfile,
  getCurrentUser,
  logout,
  redirectByRole,
  requiresPasswordChange,
} from "../core/auth-v2.js";

const form = document.getElementById("passwordChangeForm");
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const submitButton = document.getElementById("passwordChangeButton");
const message = document.getElementById("passwordChangeMessage");
const toggleNewPassword = document.getElementById("toggleNewPassword");
const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");

let currentProfile = null;

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `form-message ${type}`;
}

function clearMessage() {
  message.textContent = "";
  message.className = "form-message";
}

function bindPasswordToggle(button, input) {
  button.addEventListener("click", () => {
    const hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    button.textContent = hidden ? "Ocultar" : "Ver";
  });
}

bindPasswordToggle(toggleNewPassword, newPasswordInput);
bindPasswordToggle(toggleConfirmPassword, confirmPasswordInput);

async function getFunctionErrorMessage(error, data) {
  if (data && typeof data.error === "string") {
    return data.error;
  }

  const context = error?.context;

  if (context && typeof context.json === "function") {
    try {
      const response =
        typeof context.clone === "function"
          ? context.clone()
          : context;

      const body = await response.json();

      if (typeof body?.error === "string") {
        return body.error;
      }
    } catch {
      // Continuamos con el mensaje genérico.
    }
  }

  return (
    error?.message ||
    "No fue posible cambiar la contraseña."
  );
}

async function goToLoginAfterChange() {
  try {
    await logout();
  } catch {
    // La intención es limpiar la sesión local si todavía existe.
  }

  window.location.replace(
    "./index.html?password_changed=1"
  );
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  const newPassword = newPasswordInput.value;
  const confirmation = confirmPasswordInput.value;

  if (newPassword.length < 10) {
    showMessage(
      "La nueva contraseña debe tener al menos 10 caracteres."
    );
    return;
  }

  if (newPassword !== confirmation) {
    showMessage("Las contraseñas no coinciden.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Guardando...";

  try {
    const { data, error } =
      await supabase.functions.invoke(
        "change-first-password",
        {
          body: {
            password: newPassword,
            password_confirmation: confirmation,
          },
        }
      );

    if (error) {
      const errorMessage =
        await getFunctionErrorMessage(error, data);

      throw new Error(errorMessage);
    }

    if (data?.ok !== true) {
      throw new Error(
        data?.error ||
        "No fue posible confirmar el cambio de contraseña."
      );
    }

    showMessage(
      "Contraseña actualizada correctamente.",
      "success"
    );

    // Refrescamos la sesión para que el JWT local reciba
    // el app_metadata actualizado.
    const { error: refreshError } =
      await supabase.auth.refreshSession();

    if (refreshError) {
      await goToLoginAfterChange();
      return;
    }

    const updatedUser = await getCurrentUser();

    if (
      !updatedUser ||
      requiresPasswordChange(updatedUser)
    ) {
      // La contraseña ya fue cambiada en servidor.
      // Si el metadata local aún no se actualizó,
      // pedimos un login limpio.
      await goToLoginAfterChange();
      return;
    }

    redirectByRole(currentProfile, "./");

  } catch (error) {
    console.error(
      "Error cambiando contraseña temporal:",
      error
    );

    showMessage(
      error.message ||
      "No fue posible cambiar la contraseña."
    );

    submitButton.disabled = false;
    submitButton.textContent =
      "Guardar nueva contraseña";
  }
});

async function initialize() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      window.location.replace("./index.html");
      return;
    }

    currentProfile = await getCurrentProfile();

    if (
      !currentProfile ||
      !currentProfile.activo
    ) {
      try {
        await logout();
      } finally {
        window.location.replace("./index.html");
      }

      return;
    }

    if (!requiresPasswordChange(user)) {
      redirectByRole(currentProfile, "./");
      return;
    }

    newPasswordInput.focus();

  } catch (error) {
    console.error(
      "Error inicializando cambio de contraseña:",
      error
    );

    showMessage(
      "No fue posible validar la sesión."
    );

    submitButton.disabled = true;
  }
}

initialize();
