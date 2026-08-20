// ============================================================
// TASKVOICE
// services/dashboard.js
//
// Consultas necesarias para el Dashboard administrativo.
// ============================================================

import { supabase } from "../core/supabase.js";

// ============================================================
// FECHA ACTUAL YYYY-MM-DD
// ============================================================

function getToday() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(now.getMonth() + 1).padStart(2, "0");

  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// ============================================================
// OBTENER DASHBOARD
// ============================================================

export async function getDashboardData(organizationId) {
  const today = getToday();

  // ========================================================
  // CONSULTAS EN PARALELO
  // ========================================================

  const [
    pendingResult,

    progressResult,

    completedResult,

    overdueResult,

    recentResult,

    organizationResult,
  ] = await Promise.all([
    // ----------------------------------------------------
    // PENDIENTES + ACEPTADAS
    // ----------------------------------------------------

    supabase

      .from("tasks")

      .select("id", {
        count: "exact",
        head: true,
      })

      .in("estado", ["pendiente", "aceptada"]),

    // ----------------------------------------------------
    // EN PROGRESO
    // ----------------------------------------------------

    supabase

      .from("tasks")

      .select("id", {
        count: "exact",
        head: true,
      })

      .eq("estado", "en_progreso"),

    // ----------------------------------------------------
    // COMPLETADAS
    // ----------------------------------------------------

    supabase

      .from("tasks")

      .select("id", {
        count: "exact",
        head: true,
      })

      .eq("estado", "completada"),

    // ----------------------------------------------------
    // VENCIDAS
    //
    // Por ahora consideramos vencida una tarea cuya fecha
    // límite ya pasó y que todavía no fue finalizada.
    // ----------------------------------------------------

    supabase

      .from("tasks")

      .select("id", {
        count: "exact",
        head: true,
      })

      .lt("fecha_limite", today)

      .in("estado", ["pendiente", "aceptada", "en_progreso", "vencida"]),

    // ----------------------------------------------------
    // TAREAS RECIENTES
    // ----------------------------------------------------

    supabase

      .from("tasks")

      .select(
        `
                id,
                titulo,
                estado,
                prioridad,
                asignado_a,
                fecha_limite,
                created_at
            `,
      )

      .order("created_at", {
        ascending: false,
      })

      .limit(6),

    // ----------------------------------------------------
    // ORGANIZACIÓN
    // ----------------------------------------------------

    supabase

      .from("organizations")

      .select("id,nombre")

      .eq("id", organizationId)

      .single(),
  ]);

  // ========================================================
  // VALIDACIÓN
  // ========================================================

  const results = [
    pendingResult,

    progressResult,

    completedResult,

    overdueResult,

    recentResult,

    organizationResult,
  ];

  const failed = results.find((result) => result.error);

  if (failed) {
    throw failed.error;
  }

  // ========================================================
  // OBTENER USUARIOS DE LAS TAREAS RECIENTES
  // ========================================================

  const recentTasks = recentResult.data ?? [];

  const userIds = [
    ...new Set(
      recentTasks

        .map((task) => task.asignado_a)

        .filter(Boolean),
    ),
  ];

  let usersMap = new Map();

  if (userIds.length > 0) {
    const { data: users, error: usersError } = await supabase

      .from("profiles")

      .select("id,nombre,apellido")

      .in("id", userIds);

    if (usersError) {
      throw usersError;
    }

    usersMap = new Map(
      users.map((user) => [user.id, `${user.nombre} ${user.apellido}`.trim()]),
    );
  }

  // ========================================================
  // AGREGAR NOMBRE DEL USUARIO
  // ========================================================

  const enrichedTasks = recentTasks.map((task) => ({
    ...task,

    assigned_user_name: usersMap.get(task.asignado_a) ?? "Sin asignar",
  }));

  // ========================================================
  // RESULTADO
  // ========================================================

  return {
    organizationName: organizationResult.data.nombre,

    stats: {
      pending: pendingResult.count ?? 0,

      progress: progressResult.count ?? 0,

      completed: completedResult.count ?? 0,

      overdue: overdueResult.count ?? 0,
    },

    recentTasks: enrichedTasks,
  };
}
