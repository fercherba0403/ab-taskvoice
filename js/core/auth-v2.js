// ============================================================
// TASKVOICE
// auth-v2.js
//
// Funciones comunes de autenticación y autorización.
// Añade el control de contraseña temporal.
// ============================================================

import { supabase } from "./supabase.js";

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

  return data;
}

// ============================================================
// LOGOUT
// ============================================================

export async function logout() {
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
  window.location.replace(
    passwordChangeRoute(rootPrefix)
  );
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
    .select(`
      id,
      organization_id,
      nombre,
      apellido,
      email,
      telefono,
      rol,
      activo,
      avatar_url
    `)
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Error obteniendo perfil:", error);
    return null;
  }

  return data;
}

// ============================================================
// RUTA SEGÚN ROL
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

export function redirectByRole(profile, rootPrefix = "./") {
  const route = routeByRole(profile.rol, rootPrefix);
  window.location.replace(route);
}

// ============================================================
// PROTEGER PÁGINA
//
// Además del rol, bloquea el acceso mientras exista una
// contraseña temporal pendiente.
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

  if (!allowedRoles.includes(profile.rol)) {
    redirectByRole(profile, rootPrefix);
    return null;
  }

  return profile;
}
