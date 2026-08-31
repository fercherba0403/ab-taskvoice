// ============================================================
// TASKVOICE
// profile-selector-v1.js
//
// Selección del perfil activo para usuarios multirol.
// ============================================================

import {
  enforceSessionLifetime,
  getCurrentProfile,
  getCurrentUser,
  getMyRoles,
  logout,
  redirectByRole,
  redirectToPasswordChange,
  requiresPasswordChange,
  setActiveRole,
} from "../core/auth-v3.js?v=20260831-01";

const loading = document.getElementById("profileSelectorLoading");

const content = document.getElementById("profileSelectorContent");

const options = document.getElementById("profileOptions");

const userName = document.getElementById("profileUserName");

const logoutButton = document.getElementById("profileLogoutButton");

function profileDescription(role) {
  const descriptions = {
    supervisor: "Gestión, seguimiento y control operativo.",
    trabajador: "Acceso al panel Técnico y a tus tareas asignadas.",
    admin: "Administración general de TaskVoice.",
  };

  return descriptions[role] ?? "Ingresar con este perfil.";
}

function createProfileButton(role, label, profile) {
  const button = document.createElement("button");

  button.type = "button";

  button.className = "profile-option";

  button.dataset.role = role;

  const title = document.createElement("strong");

  title.textContent = label;

  const description = document.createElement("span");

  description.textContent = profileDescription(role);

  button.append(title, description);

  button.addEventListener("click", () => {
    document.querySelectorAll(".profile-option").forEach((item) => {
      item.disabled = true;
    });

    setActiveRole(role);

    redirectByRole(profile, "./");
  });

  return button;
}

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  logoutButton.textContent = "Cerrando...";

  try {
    await logout();
  } finally {
    window.location.replace("./index.html");
  }
});

async function initialize() {
  try {
    const lifetimeStatus = await enforceSessionLifetime("./");

    if (lifetimeStatus === "expired") {
      return;
    }

    const user = await getCurrentUser();

    if (!user) {
      window.location.replace("./index.html");

      return;
    }

    if (requiresPasswordChange(user)) {
      redirectToPasswordChange("./");

      return;
    }

    const profile = await getCurrentProfile();

    if (!profile || !profile.activo) {
      await logout();

      window.location.replace("./index.html");

      return;
    }

    const roles = await getMyRoles(profile);

    if (roles.length === 0) {
      throw new Error("La cuenta no tiene perfiles habilitados.");
    }

    if (roles.length === 1) {
      setActiveRole(roles[0].role);

      redirectByRole(profile, "./");

      return;
    }

    userName.textContent = `${profile.nombre} ${profile.apellido}`.trim();

    options.replaceChildren();

    for (const item of roles) {
      options.append(createProfileButton(item.role, item.label, profile));
    }

    loading.classList.add("hidden");

    content.classList.remove("hidden");
  } catch (error) {
    console.error("Error seleccionando perfil:", error);

    loading.textContent = "No fue posible cargar los perfiles habilitados.";
  }
}

initialize();
