// ============================================================
// TASKVOICE
// auth-v3.js
//
// Autenticación, contraseña temporal y selección de perfil.
//
// Roles internos compatibles:
// - admin        -> Administrador
// - supervisor   -> Jefatura
// - trabajador   -> Técnico
// ============================================================

import { supabase } from "./supabase.js";

const ACTIVE_ROLE_KEY = "taskvoice_active_role";

// ============================================================
// LOGIN
// ============================================================

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),

    password,
  });

  if (error) {
    throw error;
  }

  // Una sesión nueva debe elegir nuevamente el perfil activo
  // cuando el usuario tenga más de uno.
  clearActiveRole();

  return data;
}

export async function loginWithPasskey() {
  const { data, error } = await supabase.auth.signInWithPasskey();

  if (error) {
    throw error;
  }

  // El perfil activo pertenece a la sesión anterior y no debe
  // reutilizarse después de una autenticación con passkey.
  clearActiveRole();

  return data;
}

// ============================================================
// LOGOUT
// ============================================================

export async function logout() {
  clearActiveRole();

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

// ============================================================
// USUARIO AUTENTICADO
// ============================================================

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user ?? null;
}

// ============================================================
// CONTRASEÑA TEMPORAL
// ============================================================

export function requiresPasswordChange(user) {
  return user?.app_metadata?.must_change_password === true;
}

export function passwordChangeRoute(rootPrefix = "./") {
  return `${rootPrefix}cambiar-contrasena.html`;
}

export function redirectToPasswordChange(rootPrefix = "./") {
  window.location.replace(passwordChangeRoute(rootPrefix));
}

// ============================================================
// PROFILE
// ============================================================

export async function getCurrentProfile() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      `
          id,
          organization_id,
          nombre,
          apellido,
          email,
          telefono,
          rol,
          activo,
          avatar_url
        `,
    )
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Error obteniendo perfil:", error);

    return null;
  }

  return data;
}

// ============================================================
// ROLES HABILITADOS
// ============================================================

function fallbackRoleLabel(role) {
  const labels = {
    admin: "Administrador",
    supervisor: "Jefatura",
    trabajador: "Técnico",
  };

  return labels[role] ?? role;
}

export async function getMyRoles(profile = null) {
  const { data, error } = await supabase.rpc("get_my_roles");

  if (!error) {
    return (data ?? []).map((item) => ({
      role: item.role,

      label: item.label ?? fallbackRoleLabel(item.role),

      is_primary: item.is_primary === true,
    }));
  }

  console.error("Error obteniendo roles habilitados:", error);

  // Compatibilidad defensiva: si por algún motivo falla el RPC,
  // un usuario existente no queda bloqueado.
  const currentProfile = profile ?? (await getCurrentProfile());

  if (!currentProfile?.rol) {
    return [];
  }

  return [
    {
      role: currentProfile.rol,
      label: fallbackRoleLabel(currentProfile.rol),
      is_primary: true,
    },
  ];
}

// ============================================================
// PERFIL ACTIVO DE ESTA SESIÓN
// ============================================================

export function getActiveRole() {
  try {
    return sessionStorage.getItem(ACTIVE_ROLE_KEY);
  } catch {
    return null;
  }
}

export function setActiveRole(role) {
  try {
    sessionStorage.setItem(ACTIVE_ROLE_KEY, role);
  } catch {
    // Si sessionStorage no estuviera disponible, la navegación
    // seguirá funcionando para perfiles de un solo rol.
  }
}

export function clearActiveRole() {
  try {
    sessionStorage.removeItem(ACTIVE_ROLE_KEY);
  } catch {
    // Sin acción adicional.
  }
}

function activeRoleIsValid(role, roles) {
  return typeof role === "string" && roles.some((item) => item.role === role);
}

export async function resolveActiveRole(profile = null) {
  const roles = await getMyRoles(profile);

  if (roles.length === 0) {
    clearActiveRole();

    return {
      roles,
      activeRole: null,
      needsSelection: false,
    };
  }

  if (roles.length === 1) {
    const onlyRole = roles[0].role;

    setActiveRole(onlyRole);

    return {
      roles,
      activeRole: onlyRole,
      needsSelection: false,
    };
  }

  const stored = getActiveRole();

  if (activeRoleIsValid(stored, roles)) {
    return {
      roles,
      activeRole: stored,
      needsSelection: false,
    };
  }

  clearActiveRole();

  return {
    roles,
    activeRole: null,
    needsSelection: true,
  };
}

// ============================================================
// RUTAS
// ============================================================

export function routeByRole(role, rootPrefix = "./") {
  switch (role) {
    case "admin":

    case "supervisor":
      return `${rootPrefix}admin/dashboard.html`;

    case "trabajador":
      return `${rootPrefix}trabajador/inicio.html`;

    default:
      return `${rootPrefix}index.html`;
  }
}

export function profileSelectionRoute(rootPrefix = "./") {
  return `${rootPrefix}seleccionar-perfil.html`;
}

export function redirectToProfileSelection(rootPrefix = "./") {
  window.location.replace(profileSelectionRoute(rootPrefix));
}

export function redirectByRole(profile, rootPrefix = "./") {
  const role = getActiveRole() ?? profile?.rol;

  const route = routeByRole(role, rootPrefix);

  window.location.replace(route);
}

export async function redirectAfterAuthentication(profile, rootPrefix = "./") {
  const { activeRole, needsSelection } = await resolveActiveRole(profile);

  if (needsSelection) {
    redirectToProfileSelection(rootPrefix);

    return;
  }

  if (!activeRole) {
    await logout();

    window.location.replace(`${rootPrefix}index.html`);

    return;
  }

  redirectByRole(profile, rootPrefix);
}

// ============================================================
// PROTEGER PÁGINA
// ============================================================

export async function requireRole(allowedRoles, rootPrefix = "../") {
  const user = await getCurrentUser();

  if (!user) {
    window.location.replace(`${rootPrefix}index.html`);

    return null;
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    await logout();

    window.location.replace(`${rootPrefix}index.html`);

    return null;
  }

  if (!profile.activo) {
    await logout();

    window.location.replace(`${rootPrefix}index.html`);

    return null;
  }

  if (requiresPasswordChange(user)) {
    redirectToPasswordChange(rootPrefix);

    return null;
  }

  const { roles, activeRole, needsSelection } =
    await resolveActiveRole(profile);

  if (needsSelection) {
    redirectToProfileSelection(rootPrefix);

    return null;
  }

  if (!activeRole) {
    await logout();

    window.location.replace(`${rootPrefix}index.html`);

    return null;
  }

  if (!allowedRoles.includes(activeRole)) {
    redirectByRole(profile, rootPrefix);

    return null;
  }

  return {
    ...profile,
    roles: roles.map((item) => item.role),
    role_details: roles,
    active_role: activeRole,
  };
}
