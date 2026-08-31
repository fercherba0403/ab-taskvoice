// ============================================================
// AB TASKVOICE
// technician-reports-v2.js
//
// Búsqueda Operativa del equipo para el Panel Técnico.
// ============================================================

import { logout, requireRole } from "../core/auth.js?v=20260831-01";

import {
    getLocations,
    getMaintenanceTypes,
    getShifts,
} from "../services/tasks.js";

import { getWorkTypes } from "../services/executions-v3.js";

import {
    getTechnicianReportTeammates,
    getTechnicianTeamOperationalReport,
} from "../services/technician-reports-v2.js";

// ============================================================
// ELEMENTOS
// ============================================================

const form = document.getElementById("technicianReportsForm");

const dateFrom = document.getElementById("reportDateFrom");

const dateTo = document.getElementById("reportDateTo");

const technicianSelect = document.getElementById("reportTechnician");

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

const detailDialog = document.getElementById("reportDetailDialog");

const detailBody = document.getElementById("reportDetailBody");

const detailClose = document.getElementById("reportDetailClose");

let currentRows = [];

let currentUserId = null;

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

function formatDateTime(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString("es-AR", {
        dateStyle: "short",

        timeStyle: "short",
    });
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

function safeText(value, fallback = "-") {
    if (value === null || value === undefined || String(value).trim() === "") {
        return fallback;
    }

    return String(value);
}

// ============================================================
// TABLA
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

function createActionCell(row) {
    const td = document.createElement("td");

    const wrapper = document.createElement("div");

    wrapper.className = "technician-report-actions-cell";

    const detailButton = document.createElement("button");

    detailButton.type = "button";

    detailButton.className = "technician-report-open";

    detailButton.textContent = "Ver registro";

    detailButton.addEventListener("click", () => {
        openDetail(row);
    });

    wrapper.append(detailButton);

    if (row.technician_id === currentUserId) {
        const taskLink = document.createElement("a");

        taskLink.className = "technician-report-open secondary";

        taskLink.href = `./tarea-detalle.html?id=${row.task_id}`;

        taskLink.textContent = "Mi tarea";

        wrapper.append(taskLink);
    }

    td.append(wrapper);

    return td;
}

function renderRows(rows) {
    tableBody.replaceChildren();

    resultCount.textContent =
        rows.length === 1 ? "1 participación" : `${rows.length} participaciones`;

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
                row.technician_name || "Técnico",
                "technician-report-technician",
            ),

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

            createActionCell(row),
        );

        tableBody.append(tr);
    }
}

// ============================================================
// DETALLE DE REGISTRO
// ============================================================

function detailItem(label, value) {
    const item = document.createElement("div");

    item.className = "technician-report-detail-item";

    const span = document.createElement("span");

    span.textContent = label;

    const strong = document.createElement("strong");

    strong.textContent = safeText(value);

    item.append(span, strong);

    return item;
}

function detailSection(label, value) {
    const section = document.createElement("section");

    section.className = "technician-report-detail-section";

    const title = document.createElement("span");

    title.textContent = label;

    const paragraph = document.createElement("p");

    paragraph.textContent = safeText(value, "Sin registrar");

    section.append(title, paragraph);

    return section;
}

function openDetail(row) {
    detailBody.replaceChildren();

    const heading = document.createElement("div");

    heading.className = "technician-report-detail-heading";

    const eyebrow = document.createElement("span");

    eyebrow.textContent = row.technician_name || "Técnico";

    const title = document.createElement("h2");

    title.textContent = `#${row.task_id} · ${row.task_title}`;

    heading.append(eyebrow, title);

    const grid = document.createElement("div");

    grid.className = "technician-report-detail-grid";

    grid.append(
        detailItem("Fecha", formatDate(row.report_date)),

        detailItem("Ticket", row.ticket_number || "Sin ticket"),

        detailItem("Lugar", row.location_name),

        detailItem("Turno", row.shift_name),

        detailItem("Mantenimiento", row.maintenance_type_name),

        detailItem("Estado del técnico", participationLabel(row.technician_status)),

        detailItem("Inicio", formatDateTime(row.started_at)),

        detailItem("Finalización", formatDateTime(row.finished_at)),

        detailItem("Duración", formatDuration(row.duration_minutes)),

        detailItem("Trabajo realizado", workTypesLabel(row.work_type_names)),
    );

    detailBody.append(
        heading,
        grid,
        detailSection("Descripción del trabajo", row.description),
        detailSection("Transcripción del informe", row.transcription),
    );

    if (typeof detailDialog.showModal === "function") {
        detailDialog.showModal();
    } else {
        detailDialog.setAttribute("open", "");
    }
}

function closeDetail() {
    if (typeof detailDialog.close === "function" && detailDialog.open) {
        detailDialog.close();
    } else {
        detailDialog.removeAttribute("open");
    }
}

// ============================================================
// FILTROS
// ============================================================

function getFilters() {
    return {
        dateFrom: dateFrom.value,

        dateTo: dateTo.value,

        technicianId: technicianSelect.value,

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

    loading.textContent = "Buscando actividad del equipo...";

    loading.classList.remove("hidden");

    emptyState.classList.add("hidden");

    tableWrapper.classList.add("hidden");

    searchButton.disabled = true;

    searchButton.textContent = "Buscando...";

    try {
        currentRows = await getTechnicianTeamOperationalReport(getFilters());

        renderRows(currentRows);

        loading.classList.add("hidden");
    } catch (error) {
        console.error("Error cargando búsqueda operativa del equipo:", error);

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
        "Técnico",
        "Tarea",
        "Ticket",
        "Lugar",
        "Turno",
        "Tipo de mantenimiento",
        "Trabajo realizado",
        "Estado del técnico",
        "Duración",
    ];

    const lines = [header.map(escapeCsvValue).join(";")];

    for (const row of currentRows) {
        lines.push(
            [
                formatDate(row.report_date),

                row.technician_name || "Técnico",

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
        "taskvoice-busqueda-operativa-equipo-" +
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

detailClose.addEventListener("click", closeDetail);

detailDialog.addEventListener("click", (event) => {
    if (event.target === detailDialog) {
        closeDetail();
    }
});

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

    currentUserId = profile.id;

    const fullName = `${profile.nombre ?? ""} ${profile.apellido ?? ""}`.trim();

    document.getElementById("topbarUserName").textContent = fullName || "Técnico";

    try {
        const [technicians, locations, shifts, maintenanceTypes, workTypes] =
            await Promise.all([
                getTechnicianReportTeammates(),
                getLocations(),
                getShifts(),
                getMaintenanceTypes(),
                getWorkTypes(),
            ]);

        appendOptions(technicianSelect, technicians, (item) => item.name);

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
