// ============================================================
// TASKVOICE
// admin-reports.js
//
// Reportes y búsqueda operativa.
// ============================================================

import {
    initAdminLayout,
    setAdminTopbarSubtitle,
    setAdminTopbarTitle,
} from "../components/admin-layout-v3.js?v=20260831-01";

import {
    getLocations,
    getMaintenanceTypes,
    getShifts,
    getTechnicians,
} from "../services/tasks.js";

import { getWorkTypes } from "../services/executions.js";

import { getOperationalReport } from "../services/reports.js";

// ============================================================
// ELEMENTOS
// ============================================================

const form = document.getElementById("reportsFilterForm");

const dateFrom = document.getElementById("reportDateFrom");

const dateTo = document.getElementById("reportDateTo");

const technicianSelect = document.getElementById("reportTechnician");

const locationSelect = document.getElementById("reportLocation");

const shiftSelect = document.getElementById("reportShift");

const maintenanceSelect = document.getElementById("reportMaintenance");

const workTypeSelect = document.getElementById("reportWorkType");

const taskStatusSelect = document.getElementById("reportTaskStatus");

const technicianStatusSelect = document.getElementById(
    "reportTechnicianStatus",
);

const ticketInput = document.getElementById("reportTicket");

const clearButton = document.getElementById("clearReportsButton");

const searchButton = document.getElementById("searchReportsButton");

const message = document.getElementById("reportsMessage");

const loading = document.getElementById("reportsLoading");

const emptyState = document.getElementById("reportsEmpty");

const tableWrapper = document.getElementById("reportsTableWrapper");

const tableBody = document.getElementById("reportsTableBody");

const resultCount = document.getElementById("reportsResultCount");

const exportCsvButton = document.getElementById("exportCsvButton");

const locationsRanking = document.getElementById("reportLocationsRanking");

const techniciansRanking = document.getElementById("reportTechniciansRanking");

const workTypesRanking = document.getElementById("reportWorkTypesRanking");

const maintenanceRanking = document.getElementById("reportMaintenanceRanking");

// ============================================================
// ESTADO
// ============================================================

let currentRows = [];

// ============================================================
// SELECT GENÉRICO
// ============================================================

function appendOptions(select, items, getLabel) {
    for (const item of items) {
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

    const parts = value.split("-");

    if (parts.length !== 3) {
        return value;
    }

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatDuration(minutes) {
    if (minutes === null || minutes === undefined) {
        return "-";
    }

    const total = Number(minutes);

    if (!Number.isFinite(total)) {
        return "-";
    }

    if (total < 60) {
        return `${total} min`;
    }

    const hours = Math.floor(total / 60);

    const remaining = total % 60;

    if (remaining === 0) {
        return `${hours} h`;
    }

    return `${hours} h ${remaining} min`;
}

// ============================================================
// LABELS
// ============================================================

function technicianStatusLabel(state) {
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

function technicianStatusClass(state) {
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

// ============================================================
// FILTROS
// ============================================================

function getFilters() {
    return {
        dateFrom: dateFrom.value || null,

        dateTo: dateTo.value || null,

        technicianId: technicianSelect.value || null,

        locationId: locationSelect.value || null,

        shiftId: shiftSelect.value || null,

        maintenanceTypeId: maintenanceSelect.value || null,

        workTypeId: workTypeSelect.value || null,

        taskStatus: taskStatusSelect.value || null,

        technicianStatus: technicianStatusSelect.value || null,

        ticket: ticketInput.value.trim() || null,
    };
}

// ============================================================
// MENSAJES
// ============================================================

function clearMessage() {
    message.textContent = "";

    message.className = "reports-message";
}

function showError(text) {
    message.textContent = text;

    message.className = "reports-message error";
}

// ============================================================
// ANÁLISIS OPERATIVO
// ============================================================

// ============================================================
// CONTADOR GENÉRICO
// ============================================================

function countValues(values) {
    const counter = new Map();

    for (const rawValue of values) {
        const value = String(rawValue ?? "").trim();

        if (!value) {
            continue;
        }

        counter.set(
            value,

            (counter.get(value) ?? 0) + 1,
        );
    }

    return Array.from(counter.entries())
        .map(([label, count]) => ({
            label,
            count,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

// ============================================================
// RENDER DE RANKING
// ============================================================

function renderRanking(container, items, limit = 5) {
    container.replaceChildren();

    const visibleItems = items.slice(0, limit);

    if (visibleItems.length === 0) {
        const empty = document.createElement("p");

        empty.className = "reports-ranking-empty";

        empty.textContent = "Sin datos para mostrar.";

        container.append(empty);

        return;
    }

    const maximum = Math.max(...visibleItems.map((item) => item.count));

    visibleItems.forEach((item, index) => {
        const row = document.createElement("div");

        row.className = "reports-ranking-row";

        // --------------------------------------------------
        // CABECERA
        // --------------------------------------------------

        const header = document.createElement("div");

        header.className = "reports-ranking-row-header";

        const label = document.createElement("span");

        label.className = "reports-ranking-label";

        label.textContent = `${index + 1}. ${item.label}`;

        const count = document.createElement("strong");

        count.className = "reports-ranking-count";

        count.textContent = String(item.count);

        header.append(label, count);

        // --------------------------------------------------
        // BARRA
        // --------------------------------------------------

        const track = document.createElement("div");

        track.className = "reports-ranking-track";

        const bar = document.createElement("div");

        bar.className = "reports-ranking-bar";

        const percentage = maximum > 0 ? (item.count / maximum) * 100 : 0;

        bar.style.width = `${percentage}%`;

        track.append(bar);

        row.append(header, track);

        container.append(row);
    });
}

// ============================================================
// EJECUCIONES ÚNICAS
//
// El RPC devuelve una fila por técnico asignado.
// En tareas de equipo, varios técnicos pueden compartir
// el mismo execution_id.
//
// Para indicadores de actividad debemos contar cada ejecución
// una sola vez.
// ============================================================

function getUniqueExecutionRows(rows) {
    const executions = new Map();

    for (const row of rows) {
        if (row.execution_id === null || row.execution_id === undefined) {
            continue;
        }

        const key = String(row.execution_id);

        if (!executions.has(key)) {
            executions.set(key, row);
        }
    }

    return [...executions.values()];
}

// ============================================================
// PARTICIPACIONES REALES
//
// Una participación existe cuando el técnico quedó vinculado
// a una ejecución compartida.
//
// Los asignados pendientes, aceptados, rechazados o cancelados
// sin ejecución no inflan este indicador.
// ============================================================

function getParticipationRows(rows) {
    return rows.filter(
        (row) => row.execution_id !== null && row.execution_id !== undefined,
    );
}

// ============================================================
// RENDER ANÁLISIS
// ============================================================

function renderAnalysis(rows) {
    const executionRows = getUniqueExecutionRows(rows);

    // ========================================================
    // LUGARES
    //
    // Una ejecución compartida cuenta una sola vez.
    // ========================================================

    const locations = countValues(
        executionRows.map((row) => row.location_name || "Sin lugar"),
    );

    renderRanking(locationsRanking, locations);

    // ========================================================
    // TÉCNICOS
    //
    // Este ranking sí mide PARTICIPACIONES completadas.
    // Un técnico suma una participación por tarea/ejeución
    // en la que efectivamente participó y quedó completado.
    // ========================================================

    const completedTechnicians = countValues(
        getParticipationRows(rows)
            .filter((row) => row.technician_status === "completada")
            .map((row) => row.technician_name || "Técnico"),
    );

    renderRanking(techniciansRanking, completedTechnicians);

    // ========================================================
    // TRABAJOS REALIZADOS
    //
    // Se toma una sola fila por execution_id para evitar que
    // un equipo de 2 o 3 técnicos multiplique artificialmente
    // los tipos de trabajo de una misma intervención.
    // ========================================================

    const workTypes = countValues(
        executionRows.flatMap((row) =>
            Array.isArray(row.work_type_names) ? row.work_type_names : [],
        ),
    );

    renderRanking(workTypesRanking, workTypes);

    // ========================================================
    // TIPOS DE MANTENIMIENTO
    //
    // También se cuenta una sola vez por intervención real.
    // ========================================================

    const maintenanceTypes = countValues(
        executionRows.map((row) => row.maintenance_type_name || "Sin tipo"),
    );

    renderRanking(maintenanceRanking, maintenanceTypes);
}

// ============================================================
// KPI
// ============================================================

function renderStats(rows) {
    const executionRows = getUniqueExecutionRows(rows);

    const participationRows = getParticipationRows(rows);

    // ========================================================
    // INTERVENCIONES
    //
    // Una intervención = un execution_id distinto.
    // ========================================================

    const total = executionRows.length;

    // ========================================================
    // COMPLETADAS
    //
    // Se determina por finalización real de la ejecución,
    // no por cantidad de técnicos completados.
    // ========================================================

    const completed = executionRows.filter(
        (row) => row.finished_at !== null && row.finished_at !== undefined,
    ).length;

    // ========================================================
    // EN PROGRESO
    // ========================================================

    const progress = executionRows.filter(
        (row) => row.started_at && !row.finished_at,
    ).length;

    // ========================================================
    // PARTICIPACIONES
    //
    // Una fila de técnico vinculada a execution_id.
    // ========================================================

    const participations = participationRows.length;

    // ========================================================
    // TIEMPO PROMEDIO
    //
    // Se promedia una sola vez por execution_id.
    // ========================================================

    const durations = executionRows

        .map((row) => row.duration_minutes)

        .filter(
            (value) =>
                value !== null && value !== undefined && Number.isFinite(Number(value)),
        )

        .map(Number);

    const average =
        durations.length > 0
            ? Math.round(
                durations.reduce((sum, value) => sum + value, 0) / durations.length,
            )
            : null;

    document.getElementById("reportTotal").textContent = String(total);

    document.getElementById("reportCompleted").textContent = String(completed);

    document.getElementById("reportProgress").textContent = String(progress);

    document.getElementById("reportParticipations").textContent =
        String(participations);

    document.getElementById("reportAverageTime").textContent =
        average === null ? "-" : formatDuration(average);
}

// ============================================================
// CREAR CELDA
// ============================================================

function createCell(text) {
    const cell = document.createElement("td");

    cell.textContent = text ?? "-";

    return cell;
}

// ============================================================
// TRABAJOS REALIZADOS
// ============================================================

function createWorkTypesCell(names) {
    const cell = document.createElement("td");

    const container = document.createElement("div");

    container.className = "report-work-types";

    if (!Array.isArray(names) || names.length === 0) {
        const empty = document.createElement("span");

        empty.className = "report-work-empty";

        empty.textContent = "Sin registrar";

        container.append(empty);
    } else {
        for (const name of names) {
            const chip = document.createElement("span");

            chip.className = "report-work-chip";

            chip.textContent = name;

            container.append(chip);
        }
    }

    cell.append(container);

    return cell;
}

// ============================================================
// ESTADO
// ============================================================

function createStatusCell(state) {
    const cell = document.createElement("td");

    const badge = document.createElement("span");

    badge.className =
        "report-status " + `report-status-${technicianStatusClass(state)}`;

    badge.textContent = technicianStatusLabel(state);

    cell.append(badge);

    return cell;
}

// ============================================================
// ACCIÓN
// ============================================================

function createActionCell(taskId) {
    const cell = document.createElement("td");

    const link = document.createElement("a");

    link.className = "report-detail-link";

    link.href = `./tarea-detalle.html?id=${taskId}`;

    link.textContent = "Ver";

    cell.append(link);

    return cell;
}

// ============================================================
// RENDER TABLA
// ============================================================

function renderRows(rows) {
    tableBody.replaceChildren();

    loading.classList.add("hidden");

    const executionCount = getUniqueExecutionRows(rows).length;

    const participationCount = getParticipationRows(rows).length;

    const recordLabel =
        rows.length === 1 ? "1 registro" : `${rows.length} registros`;

    const executionLabel =
        executionCount === 1
            ? "1 intervención"
            : `${executionCount} intervenciones`;

    const participationLabel =
        participationCount === 1
            ? "1 participación"
            : `${participationCount} participaciones`;

    resultCount.textContent = `${recordLabel} · ${executionLabel} · ${participationLabel}`;

    if (rows.length === 0) {
        tableWrapper.classList.add("hidden");

        emptyState.classList.remove("hidden");

        return;
    }

    exportCsvButton.disabled = rows.length === 0;

    emptyState.classList.add("hidden");

    tableWrapper.classList.remove("hidden");

    for (const row of rows) {
        const tr = document.createElement("tr");

        tr.append(
            createCell(formatDate(row.report_date)),

            createCell(`#${row.task_id} · ${row.task_title}`),

            createCell(row.ticket_number || "Sin ticket"),

            createCell(row.technician_name),

            createCell(row.location_name),

            createCell(row.maintenance_type_name),

            createWorkTypesCell(row.work_type_names),

            createStatusCell(row.technician_status),

            createCell(formatDuration(row.duration_minutes)),

            createActionCell(row.task_id),
        );

        tableBody.append(tr);
    }
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

    loading.textContent = "Cargando reporte...";

    loading.classList.remove("hidden");

    emptyState.classList.add("hidden");

    tableWrapper.classList.add("hidden");

    searchButton.disabled = true;

    searchButton.textContent = "Buscando...";

    try {
        currentRows = await getOperationalReport(getFilters());

        renderStats(currentRows);

        renderAnalysis(currentRows);

        renderRows(currentRows);
    } catch (error) {
        console.error("Error cargando reporte:", error);

        loading.textContent = "No fue posible cargar el reporte.";

        showError(error?.message || "No fue posible realizar la consulta.");
    } finally {
        searchButton.disabled = false;

        searchButton.textContent = "Buscar";
    }
}

// ============================================================
// LIMPIAR
// ============================================================

clearButton.addEventListener(
    "click",

    async () => {
        form.reset();

        clearMessage();

        await loadReport();
    },
);

// ============================================================
// BUSCAR
// ============================================================

form.addEventListener(
    "submit",

    async (event) => {
        event.preventDefault();

        await loadReport();
    },
);

// ============================================================
// CSV
// ============================================================

// ============================================================
// ESCAPAR VALOR CSV
// ============================================================

function escapeCsvValue(value) {
    if (value === null || value === undefined) {
        return '""';
    }

    let text = String(value);

    // Excel en configuración regional argentina
    // suele trabajar bien con punto y coma como separador.

    text = text.replaceAll('"', '""');

    return `"${text}"`;
}

// ============================================================
// FORMATEAR TRABAJOS PARA EXPORTACIÓN
// ============================================================

function formatWorkTypesForExport(names) {
    if (!Array.isArray(names) || names.length === 0) {
        return "Sin registrar";
    }

    return names.join(" | ");
}

// ============================================================
// FORMATEAR ESTADO TAREA
// ============================================================

function taskStatusLabel(state) {
    const labels = {
        pendiente: "Pendiente",

        aceptada: "Aceptada",

        en_progreso: "En progreso",

        completada: "Completada",

        cancelada: "Cancelada",

        vencida: "Vencida",
    };

    return labels[state] ?? state ?? "";
}

// ============================================================
// CREAR NOMBRE DE ARCHIVO
// ============================================================

function createReportFileName() {
    const now = new Date();

    const year = now.getFullYear();

    const month = String(now.getMonth() + 1).padStart(2, "0");

    const day = String(now.getDate()).padStart(2, "0");

    return `taskvoice_reporte_${year}-${month}-${day}.csv`;
}

// ============================================================
// EXPORTAR CSV
// ============================================================

function exportCurrentReportToCsv() {
    if (!Array.isArray(currentRows) || currentRows.length === 0) {
        showError("No hay resultados para exportar.");

        return;
    }

    clearMessage();

    // ========================================================
    // ENCABEZADOS
    // ========================================================

    const headers = [
        "Fecha",

        "ID Tarea",

        "ID Ejecución",

        "Tarea",

        "N° Ticket",

        "Técnico",

        "Email técnico",

        "Lugar",

        "Turno",

        "Tipo de mantenimiento",

        "Prioridad",

        "Estado tarea",

        "Estado técnico",

        "Trabajo realizado",

        "Inicio",

        "Finalización",

        "Duración minutos",

        "Descripción",

        "Transcripción",

        "Tiene audio",
    ];

    // ========================================================
    // FILAS
    // ========================================================

    const rows = currentRows.map((row) => [
        formatDate(row.report_date),

        row.task_id,

        row.execution_id ?? "",

        row.task_title,

        row.ticket_number || "",

        row.technician_name || "",

        row.technician_email || "",

        row.location_name || "",

        row.shift_name || "",

        row.maintenance_type_name || "",

        row.priority || "",

        taskStatusLabel(row.task_status),

        technicianStatusLabel(row.technician_status),

        formatWorkTypesForExport(row.work_type_names),

        row.started_at ? new Date(row.started_at).toLocaleString("es-AR") : "",

        row.finished_at ? new Date(row.finished_at).toLocaleString("es-AR") : "",

        row.duration_minutes ?? "",

        row.description || "",

        row.transcription || "",

        row.has_audio ? "Sí" : "No",
    ]);

    // ========================================================
    // CONSTRUIR CSV
    // ========================================================

    const separator = ";";

    const lines = [
        headers.map(escapeCsvValue).join(separator),

        ...rows.map((row) => row.map(escapeCsvValue).join(separator)),
    ];

    // ========================================================
    // BOM UTF-8
    //
    // Importante para que Excel interprete correctamente:
    // á, é, í, ó, ú, ñ, etc.
    // ========================================================

    const csvContent = "\uFEFF" + lines.join("\r\n");

    const blob = new Blob(
        [csvContent],

        {
            type: "text/csv;charset=utf-8;",
        },
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = createReportFileName();

    document.body.append(link);

    link.click();

    link.remove();

    setTimeout(
        () => {
            URL.revokeObjectURL(url);
        },

        1000,
    );
}

// ============================================================
// EXPORTAR
// ============================================================

exportCsvButton.addEventListener(
    "click",

    () => {
        exportCurrentReportToCsv();
    },
);

// ============================================================
// INICIALIZAR
// ============================================================

async function initialize() {
    const profile = await initAdminLayout({
        activePage: "reportes",

        title: "Reportes",

        subtitle: "Búsqueda y análisis operativo",
    });

    if (!profile) {
        return;
    }

    try {
        const [technicians, locations, shifts, maintenanceTypes, workTypes] =
            await Promise.all([
                getTechnicians(),

                getLocations(),

                getShifts(),

                getMaintenanceTypes(),

                getWorkTypes(),
            ]);

        appendOptions(
            technicianSelect,

            technicians,

            (technician) =>
                `${technician.nombre ?? ""} ${technician.apellido ?? ""}`.trim(),
        );

        appendOptions(
            locationSelect,

            locations,

            (item) => item.nombre,
        );

        appendOptions(
            shiftSelect,

            shifts,

            (item) => item.nombre,
        );

        appendOptions(
            maintenanceSelect,

            maintenanceTypes,

            (item) => item.nombre,
        );

        appendOptions(
            workTypeSelect,

            workTypes,

            (item) => item.nombre,
        );

        setAdminTopbarTitle("Reportes");

        setAdminTopbarSubtitle("Búsqueda y análisis operativo");

        await loadReport();
    } catch (error) {
        console.error("Error inicializando reportes:", error);

        loading.textContent = "No fue posible inicializar Reportes.";

        showError(error?.message || "No fue posible cargar los datos necesarios.");
    }
}

initialize();
