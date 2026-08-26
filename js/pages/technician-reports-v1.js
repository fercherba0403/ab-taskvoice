// ============================================================
// AB TASKVOICE
// technician-reports-v1.js
//
// Búsqueda Operativa personal del Técnico.
// ============================================================

import { logout, requireRole } from "../core/auth.js";

import {
    getLocations,
    getMaintenanceTypes,
    getShifts,
} from "../services/tasks.js";

import { getWorkTypes } from "../services/executions-v3.js";

import { getMyOperationalReport } from "../services/technician-reports-v1.js";

// ============================================================
// ELEMENTOS
// ============================================================

const form = document.getElementById("technicianReportsForm");

const dateFrom = document.getElementById("reportDateFrom");

const dateTo = document.getElementById("reportDateTo");

const ticketInput = document.getElementById("reportTicket");

const locationSelect = document.getElementById("reportLocation");

const shiftSelect = document.getElementById("reportShift");

const maintenanceSelect = document.getElementById("reportMaintenance");

const workTypeSelect = document.getElementById("reportWorkType");

const taskStatusSelect = document.getElementById("reportTaskStatus");

const technicianStatusSelect = document.getElementById(
    "reportTechnicianStatus",
);

const searchButton = document.getElementById("searchReportsButton");

const clearButton = document.getElementById("clearReportsButton");

const exportButton = document.getElementById("exportReportsButton");

const loading = document.getElementById("reportsLoading");

const emptyState = document.getElementById("reportsEmpty");

const tableWrapper = document.getElementById("reportsTableWrapper");

const tableBody = document.getElementById("reportsTableBody");

const resultCount = document.getElementById("reportsResultCount");

const message = document.getElementById("reportsMessage");

let currentRows = [];

// ============================================================
// MENSAJES
// ============================================================

function clearMessage() {
    message.textContent = "";

    message.className = "technician-reports-message";
}

function showError(text) {
    message.textContent = text;

    message.className = "technician-reports-message error";
}

// ============================================================
// SELECTS
// ============================================================

function appendOptions(select, items, getLabel) {
    for (const item of items ?? []) {
        const option = document.createElement("option");

        option.value = String(item.id);

        option.textContent = getLabel(item);

        select.append(option);
    }
}

// ============================================================
// FORMATOS
// ============================================================

function formatDate(value) {
    if (!value) {
        return "-";
    }

    const parts = String(value).split("-");

    if (parts.length !== 3) {
        return value;
    }

    return `${parts[2]}/` + `${parts[1]}/` + `${parts[0]}`;
}

function formatDuration(minutes) {
    if (minutes === null || minutes === undefined) {
        return "-";
    }

    const total = Number(minutes);

    if (!Number.isFinite(total)) {
        return "-";
    }

    const hours = Math.floor(total / 60);

    const remainder = total % 60;

    if (hours <= 0) {
        return `${remainder} min`;
    }

    return `${hours} h` + (remainder > 0 ? ` ${remainder} min` : "");
}

function participationLabel(state) {
    const labels = {
        pendiente: "Pendiente",

        aceptada: "Aceptada",

        en_progreso: "En progreso",

        completada: "Completada",

        rechazada: "Rechazada",

        cancelada: "Cancelada",
    };

    return labels[state] ?? state ?? "-";
}

function participationClass(state) {
    const classes = {
        pendiente: "pending",

        aceptada: "accepted",

        en_progreso: "progress",

        completada: "completed",

        rechazada: "rejected",

        cancelada: "cancelled",
    };

    return classes[state] ?? "neutral";
}

function workTypesLabel(names) {
    if (!Array.isArray(names) || names.length === 0) {
        return "Sin registrar";
    }

    return names.join(", ");
}

// ============================================================
// CELDA
// ============================================================

function createCell(value, className = "") {
    const td = document.createElement("td");

    td.textContent = value;

    if (className) {
        td.className = className;
    }

    return td;
}

function createStatusCell(state) {
    const td = document.createElement("td");

    const badge = document.createElement("span");

    badge.className = "technician-report-status " + participationClass(state);

    badge.textContent = participationLabel(state);

    td.append(badge);

    return td;
}

function createActionCell(taskId) {
    const td = document.createElement("td");

    const link = document.createElement("a");

    link.className = "technician-report-open";

    link.href = `./tarea-detalle.html?id=${taskId}`;

    link.textContent = "Ver tarea";

    td.append(link);

    return td;
}

// ============================================================
// RENDER
// ============================================================

function renderRows(rows) {
    tableBody.replaceChildren();

    resultCount.textContent =
        rows.length === 1 ? "1 resultado" : `${rows.length} resultados`;

    exportButton.disabled = rows.length === 0;

    if (rows.length === 0) {
        tableWrapper.classList.add("hidden");

        emptyState.classList.remove("hidden");

        return;
    }

    emptyState.classList.add("hidden");

    tableWrapper.classList.remove("hidden");

    for (const row of rows) {
        const tr = document.createElement("tr");

        tr.append(
            createCell(formatDate(row.report_date)),

            createCell(
                `#${row.task_id} · ${row.task_title}`,
                "technician-report-task",
            ),

            createCell(row.ticket_number || "Sin ticket", "technician-report-ticket"),

            createCell(row.location_name || "Sin lugar"),

            createCell(row.shift_name || "Sin turno"),

            createCell(row.maintenance_type_name || "Sin tipo"),

            createCell(
                workTypesLabel(row.work_type_names),
                "technician-report-work-types",
            ),

            createStatusCell(row.technician_status),

            createCell(formatDuration(row.duration_minutes)),

            createActionCell(row.task_id),
        );

        tableBody.append(tr);
    }
}

// ============================================================
// FILTROS
// ============================================================

function getFilters() {
    return {
        dateFrom: dateFrom.value,

        dateTo: dateTo.value,

        ticket: ticketInput.value,

        locationId: locationSelect.value,

        shiftId: shiftSelect.value,

        maintenanceTypeId: maintenanceSelect.value,

        workTypeId: workTypeSelect.value,

        taskStatus: taskStatusSelect.value,

        technicianStatus: technicianStatusSelect.value,
    };
}

// ============================================================
// CARGAR REPORTE
// ============================================================

async function loadReport() {
    clearMessage();

    if (dateFrom.value && dateTo.value && dateFrom.value > dateTo.value) {
        showError("La fecha Desde no puede ser posterior a Hasta.");

        return;
    }

    loading.textContent = "Buscando intervenciones...";

    loading.classList.remove("hidden");

    emptyState.classList.add("hidden");

    tableWrapper.classList.add("hidden");

    searchButton.disabled = true;

    searchButton.textContent = "Buscando...";

    try {
        currentRows = await getMyOperationalReport(getFilters());

        renderRows(currentRows);

        loading.classList.add("hidden");
    } catch (error) {
        console.error("Error cargando búsqueda operativa:", error);

        currentRows = [];

        exportButton.disabled = true;

        loading.textContent = "No fue posible cargar la búsqueda operativa.";

        showError(error?.message || "No fue posible realizar la consulta.");
    } finally {
        searchButton.disabled = false;

        searchButton.textContent = "Buscar";
    }
}

// ============================================================
// CSV
// ============================================================

function escapeCsvValue(value) {
    const text = value === null || value === undefined ? "" : String(value);

    return '"' + text.replaceAll('"', '""') + '"';
}

function exportCsv() {
    if (currentRows.length === 0) {
        return;
    }

    const header = [
        "Fecha",
        "Tarea",
        "Ticket",
        "Lugar",
        "Turno",
        "Tipo de mantenimiento",
        "Trabajo realizado",
        "Estado personal",
        "Duración",
    ];

    const lines = [header.map(escapeCsvValue).join(";")];

    for (const row of currentRows) {
        lines.push(
            [
                formatDate(row.report_date),

                `#${row.task_id} · ${row.task_title}`,

                row.ticket_number || "",

                row.location_name || "",

                row.shift_name || "",

                row.maintenance_type_name || "",

                workTypesLabel(row.work_type_names),

                participationLabel(row.technician_status),

                formatDuration(row.duration_minutes),
            ]
                .map(escapeCsvValue)
                .join(";"),
        );
    }

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download =
        "taskvoice-mi-busqueda-operativa-" +
        new Date().toISOString().slice(0, 10) +
        ".csv";

    document.body.append(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
}

// ============================================================
// EVENTOS
// ============================================================

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    await loadReport();
});

clearButton.addEventListener("click", async () => {
    form.reset();

    clearMessage();

    await loadReport();
});

exportButton.addEventListener("click", exportCsv);

document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
        await logout();
    } finally {
        window.location.replace("../index.html");
    }
});

// ============================================================
// INICIALIZAR
// ============================================================

async function initialize() {
    const profile = await requireRole(["trabajador"], "../");

    if (!profile) {
        return;
    }

    const fullName = `${profile.nombre ?? ""} ${profile.apellido ?? ""}`.trim();

    document.getElementById("topbarUserName").textContent = fullName || "Técnico";

    try {
        const [locations, shifts, maintenanceTypes, workTypes] = await Promise.all([
            getLocations(),
            getShifts(),
            getMaintenanceTypes(),
            getWorkTypes(),
        ]);

        appendOptions(locationSelect, locations, (item) => item.nombre);

        appendOptions(shiftSelect, shifts, (item) => item.nombre);

        appendOptions(maintenanceSelect, maintenanceTypes, (item) => item.nombre);

        appendOptions(workTypeSelect, workTypes, (item) => item.nombre);

        await loadReport();
    } catch (error) {
        console.error("Error inicializando Reportes del Técnico:", error);

        loading.textContent = "No fue posible inicializar Reportes.";

        showError(error?.message || "No fue posible cargar los datos.");
    }
}

initialize();
