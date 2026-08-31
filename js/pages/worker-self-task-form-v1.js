// ============================================================
// TASKVOICE
// worker-self-task-form-v1.js
//
// Formulario de autocreación de tareas.
// La tarea queda obligatoriamente asignada al técnico
// autenticado por seguridad de backend.
// ============================================================

import { logout, requireRole } from "../core/auth.js?v=20260831-01";

import {
    getLocations,
    getMaintenanceTypes,
    getShifts,
} from "../services/tasks.js";

import { createMyTask } from "../services/worker-self-task.js";

// ============================================================
// ELEMENTOS
// ============================================================

const form = document.getElementById("selfTaskForm");

const saveButton = document.getElementById("saveButton");

const formMessage = document.getElementById("formMessage");

const locationSelect = document.getElementById("lugar");

const shiftSelect = document.getElementById("turno");

const maintenanceTypeSelect = document.getElementById("maintenanceType");

// ============================================================
// ID OPCIONAL
// ============================================================

function optionalId(value) {
    if (!value) {
        return null;
    }

    const id = Number(value);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return null;
    }

    return id;
}

// ============================================================
// SELECTS
// ============================================================

function populateSelect(select, items) {
    for (const item of items) {
        const option = document.createElement("option");

        option.value = String(item.id);

        option.textContent = item.nombre;

        select.append(option);
    }
}

// ============================================================
// MENSAJES
// ============================================================

function clearMessage() {
    formMessage.textContent = "";

    formMessage.className = "worker-self-task-message";
}

function showError(text) {
    formMessage.textContent = text;

    formMessage.className = "worker-self-task-message error";
}

function showSuccess(text) {
    formMessage.textContent = text;

    formMessage.className = "worker-self-task-message success";
}

// ============================================================
// ERROR LEGIBLE
// ============================================================

function friendlyError(error) {
    const message = error?.message || "No fue posible crear la tarea.";

    return message.replace(/^TASKVOICE:\s*/i, "");
}

// ============================================================
// LOGOUT
// ============================================================

document.getElementById("logoutButton").addEventListener(
    "click",

    async () => {
        try {
            await logout();
        } finally {
            window.location.replace("../index.html");
        }
    },
);

// ============================================================
// SUBMIT
// ============================================================

form.addEventListener(
    "submit",

    async (event) => {
        event.preventDefault();

        clearMessage();

        const title = document.getElementById("titulo").value.trim();

        if (!title) {
            showError("Ingresá un título para la tarea.");

            document.getElementById("titulo").focus();

            return;
        }

        saveButton.disabled = true;

        saveButton.textContent = "Creando tarea...";

        try {
            const taskId = await createMyTask({
                titulo: title,

                descripcion:
                    document.getElementById("descripcion").value.trim() || null,

                prioridad: document.getElementById("prioridad").value,

                fecha_limite: document.getElementById("fechaLimite").value || null,

                hora_limite: document.getElementById("horaLimite").value || null,

                template_id: null,

                location_id: optionalId(locationSelect.value),

                shift_id: optionalId(shiftSelect.value),

                ticket_number:
                    document.getElementById("ticketNumber").value.trim() || null,

                maintenance_type_id: optionalId(maintenanceTypeSelect.value),
            });

            showSuccess("Tarea creada correctamente. Abriendo tarea...");

            window.location.href = `./tarea-detalle.html?id=${taskId}`;
        } catch (error) {
            console.error("Error creando tarea propia:", error);

            showError(friendlyError(error));

            saveButton.disabled = false;

            saveButton.textContent = "Crear tarea";
        }
    },
);

// ============================================================
// INICIALIZAR
// ============================================================

async function initialize() {
    const profile = await requireRole(
        ["trabajador"],

        "../",
    );

    if (!profile) {
        return;
    }

    const fullName = `${profile.nombre ?? ""} ${profile.apellido ?? ""}`.trim();

    document.getElementById("topbarUserName").textContent = fullName || "Técnico";

    try {
        const [locations, shifts, maintenanceTypes] = await Promise.all([
            getLocations(),

            getShifts(),

            getMaintenanceTypes(),
        ]);

        populateSelect(locationSelect, locations);

        populateSelect(shiftSelect, shifts);

        populateSelect(maintenanceTypeSelect, maintenanceTypes);
    } catch (error) {
        console.error("Error cargando catálogos:", error);

        showError("No fue posible cargar los datos del formulario.");

        saveButton.disabled = true;
    }
}

initialize();
