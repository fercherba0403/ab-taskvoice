// ============================================================
// TASKVOICE
// admin-dashboard-v2.js
//
// Dashboard integrado con admin-layout-v3.js.
// ============================================================

import {
    initAdminLayout,
    setAdminTopbarSubtitle,
    showAdminToast,
} from "../components/admin-layout-v3.js";

import { getDashboardData } from "../services/dashboard.js";

// ============================================================
// ELEMENTOS
// ============================================================

const pendingCount = document.getElementById("pendingCount");

const progressCount = document.getElementById("progressCount");

const completedCount = document.getElementById("completedCount");

const overdueCount = document.getElementById("overdueCount");

const tasksLoading = document.getElementById("tasksLoading");

const tasksEmpty = document.getElementById("tasksEmpty");

const tasksTableWrapper = document.getElementById("tasksTableWrapper");

const recentTasksBody = document.getElementById("recentTasksBody");

const viewTasksButton = document.getElementById("viewTasksButton");

// ============================================================
// FECHA
// ============================================================

function formatDate(value) {
    if (!value) {
        return "Sin fecha";
    }

    const parts = value.split("-");

    if (parts.length !== 3) {
        return value;
    }

    const [year, month, day] = parts;

    return `${day}/${month}/${year}`;
}

// ============================================================
// BADGE
// ============================================================

function createBadge(text, type) {
    const badge = document.createElement("span");

    badge.className = `badge ${type}`;

    badge.textContent = text;

    return badge;
}

// ============================================================
// ESTADOS
// ============================================================

function getStatusConfig(status) {
    const config = {
        pendiente: {
            label: "Pendiente",
            className: "pending",
        },

        aceptada: {
            label: "Aceptada",
            className: "accepted",
        },

        en_progreso: {
            label: "En progreso",
            className: "progress",
        },

        completada: {
            label: "Completada",
            className: "completed",
        },

        cancelada: {
            label: "Cancelada",
            className: "cancelled",
        },

        vencida: {
            label: "Vencida",
            className: "overdue",
        },
    };

    return (
        config[status] ?? {
            label: status,

            className: "neutral",
        }
    );
}

// ============================================================
// PRIORIDAD
// ============================================================

function getPriorityConfig(priority) {
    const config = {
        baja: {
            label: "Baja",
            className: "low",
        },

        normal: {
            label: "Normal",
            className: "normal",
        },

        alta: {
            label: "Alta",
            className: "high",
        },

        urgente: {
            label: "Urgente",
            className: "urgent",
        },
    };

    return (
        config[priority] ?? {
            label: priority,

            className: "normal",
        }
    );
}

// ============================================================
// RENDER TAREAS
// ============================================================

function renderRecentTasks(tasks) {
    recentTasksBody.replaceChildren();

    tasksLoading.classList.add("hidden");

    if (tasks.length === 0) {
        tasksEmpty.classList.remove("hidden");

        tasksTableWrapper.classList.add("hidden");

        return;
    }

    tasksEmpty.classList.add("hidden");

    tasksTableWrapper.classList.remove("hidden");

    for (const task of tasks) {
        const row = document.createElement("tr");

        // TAREA

        const taskCell = document.createElement("td");

        const taskTitle = document.createElement("strong");

        taskTitle.className = "task-title";

        taskTitle.textContent = task.titulo;

        const taskId = document.createElement("small");

        taskId.className = "task-id";

        taskId.textContent = `#${task.id}`;

        taskCell.append(taskTitle, taskId);

        // USUARIO

        const userCell = document.createElement("td");

        userCell.textContent = task.assigned_user_name;

        // PRIORIDAD

        const priorityCell = document.createElement("td");

        const priority = getPriorityConfig(task.prioridad);

        priorityCell.append(
            createBadge(priority.label, `priority-${priority.className}`),
        );

        // ESTADO

        const statusCell = document.createElement("td");

        const status = getStatusConfig(task.estado);

        statusCell.append(createBadge(status.label, `status-${status.className}`));

        // FECHA

        const dateCell = document.createElement("td");

        dateCell.textContent = formatDate(task.fecha_limite);

        row.append(
            taskCell,

            userCell,

            priorityCell,

            statusCell,

            dateCell,
        );

        recentTasksBody.append(row);
    }
}

// ============================================================
// NAVEGACIÓN LOCAL
// ============================================================

viewTasksButton.addEventListener("click", () => {
    window.location.href = "./tareas.html";
});

// ============================================================
// INICIALIZAR
// ============================================================

async function initialize() {
    const profile = await initAdminLayout({
        activePage: "dashboard",

        title: "Dashboard",

        subtitle: "Cargando información...",

        action: {
            href: "./tarea-nueva.html",

            label: "Nueva tarea",

            icon: "+",
        },
    });

    if (!profile) {
        return;
    }

    setAdminTopbarSubtitle(
        `Hola ${profile.nombre}, este es el resumen de actividad.`,
    );

    try {
        const dashboard = await getDashboardData(profile.organization_id);

        pendingCount.textContent = dashboard.stats.pending;

        progressCount.textContent = dashboard.stats.progress;

        completedCount.textContent = dashboard.stats.completed;

        overdueCount.textContent = dashboard.stats.overdue;

        renderRecentTasks(dashboard.recentTasks);
    } catch (error) {
        console.error("Error cargando Dashboard:", error);

        tasksLoading.textContent = "No fue posible cargar la información.";

        showAdminToast("Error al cargar el Dashboard.", "error");
    }
}

initialize();
