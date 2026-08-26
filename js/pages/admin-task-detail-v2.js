// ============================================================
// TASKVOICE
// admin-task-detail.js
//
// Detalle administrativo de una tarea.
//
// Compatible con:
// - múltiples técnicos
// - lugar
// - turno
// - ticket
// - tipo de mantenimiento
// - estado individual de cada técnico
// ============================================================

import {
  initAdminLayout,
  setAdminTopbarSubtitle,
  setAdminTopbarTitle,
} from "../components/admin-layout-v2.js";

import {
  cancelTask,
  getLocations,
  getMaintenanceTypes,
  getShifts,
  getTaskAssignees,
  getTaskHistory,
  getTaskMulti,
  getTechnicians,
  updateTaskMulti,
} from "../services/tasks.js";

import {
  createExecutionAudioSignedUrl,
  getTaskExecutionsForAdmin,
  transcribeExecution,
} from "../services/executions.js";

// ============================================================
// ID DE TAREA
// ============================================================

const params = new URLSearchParams(window.location.search);

const taskId = Number(params.get("id"));

// ============================================================
// ELEMENTOS
// ============================================================

const loading = document.getElementById("loading");

const content = document.getElementById("content");

const form = document.getElementById("editForm");

const message = document.getElementById("message");

const saveButton = document.getElementById("saveButton");

const cancelTaskButton = document.getElementById("cancelTaskButton");

const techniciansList = document.getElementById("techniciansList");

const techniciansSummary = document.getElementById("techniciansSummary");

const techniciansLockMessage = document.getElementById(
  "techniciansLockMessage",
);

const locationSelect = document.getElementById("lugar");

const shiftSelect = document.getElementById("turno");

const maintenanceTypeSelect = document.getElementById("maintenanceType");

const executionsList = document.getElementById("executionsList");

const executionsLoading = document.getElementById("executionsLoading");

const executionsEmpty = document.getElementById("executionsEmpty");

const executionsCount = document.getElementById("executionsCount");

// ============================================================
// ESTADO
// ============================================================

let currentTask = null;

let currentAssignees = [];

// ============================================================
// FECHA / HORA
// ============================================================

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "es-AR",

    {
      dateStyle: "short",

      timeStyle: "short",
    },
  ).format(new Date(value));
}

// ============================================================
// LABEL ESTADO GENERAL
// ============================================================

function taskStatusLabel(status) {
  const labels = {
    pendiente: "Pendiente",

    aceptada: "Aceptada",

    en_progreso: "En progreso",

    completada: "Completada",

    cancelada: "Cancelada",

    vencida: "Vencida",
  };

  return labels[status] ?? status;
}

// ============================================================
// LABEL PRIORIDAD
// ============================================================

function priorityLabel(priority) {
  const labels = {
    baja: "Baja",

    normal: "Normal",

    alta: "Alta",

    urgente: "Urgente",
  };

  return labels[priority] ?? priority;
}

// ============================================================
// LABEL ESTADO INDIVIDUAL
// ============================================================

function assigneeStatusLabel(status) {
  const labels = {
    pendiente: "Pendiente",

    aceptada: "Aceptada",

    en_progreso: "En progreso",

    completada: "Completada",

    cancelada: "Cancelada",

    rechazada: "Rechazada",
  };

  return labels[status] ?? status;
}

// ============================================================
// CLASE ESTADO INDIVIDUAL
// ============================================================

function assigneeStatusClass(status) {
  const classes = {
    pendiente: "pending",

    aceptada: "accepted",

    en_progreso: "progress",

    completada: "completed",

    cancelada: "cancelled",

    rechazada: "rejected",
  };

  return classes[status] ?? "neutral";
}

// ============================================================
// ID BIGINT OPCIONAL
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
// MENSAJES
// ============================================================

function clearMessage() {
  message.textContent = "";

  message.className = "form-message";
}

function showError(text) {
  message.textContent = text;

  message.className = "form-message error";
}

// ============================================================
// COMPLETAR SELECT
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
// TÉCNICOS SELECCIONADOS
// ============================================================

function getSelectedTechnicians() {
  return [
    ...techniciansList.querySelectorAll('input[name="technicians"]:checked'),
  ].map((input) => input.value);
}

// ============================================================
// RESUMEN
// ============================================================

function updateTechniciansSummary() {
  const selected = getSelectedTechnicians();

  if (selected.length === 0) {
    techniciansSummary.textContent = "Ningún técnico seleccionado";

    techniciansSummary.classList.remove("has-selection");

    return;
  }

  techniciansSummary.textContent =
    selected.length === 1
      ? "1 técnico seleccionado"
      : `${selected.length} técnicos seleccionados`;

  techniciansSummary.classList.add("has-selection");
}

// ============================================================
// RENDER TÉCNICOS
// ============================================================

function renderTechnicians(technicians, assignees) {
  techniciansList.replaceChildren();

  const assigneeMap = new Map();

  for (const assignee of assignees) {
    assigneeMap.set(assignee.user_id, assignee);
  }

  // ========================================================
  // COMBINAR:
  //
  // Técnicos activos
  // +
  // asignados históricos que quizás ya no estén en esa lista
  // ========================================================

  const technicianMap = new Map();

  for (const technician of technicians) {
    technicianMap.set(technician.id, {
      id: technician.id,

      nombre: `${technician.nombre} ${technician.apellido}`.trim(),

      email: technician.email ?? "",

      activo: true,

      rol: technician.rol,
    });
  }

  for (const assignee of assignees) {
    if (technicianMap.has(assignee.user_id)) {
      continue;
    }

    technicianMap.set(assignee.user_id, {
      id: assignee.user_id,

      nombre: assignee.nombre,

      email: assignee.email ?? "",

      activo: assignee.activo,

      rol: assignee.rol,
    });
  }

  const combinedTechnicians = [...technicianMap.values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es"),
  );

  if (combinedTechnicians.length === 0) {
    const empty = document.createElement("div");

    empty.className = "detail-technicians-empty";

    empty.textContent = "No hay técnicos disponibles.";

    techniciansList.append(empty);

    updateTechniciansSummary();

    return;
  }

  const lockAssignments =
    currentTask.estado === "en_progreso" ||
    currentTask.estado === "completada" ||
    currentTask.estado === "cancelada";

  for (const technician of combinedTechnicians) {
    const assignment = assigneeMap.get(technician.id);

    const label = document.createElement("label");

    label.className = "detail-technician-option";

    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";

    checkbox.name = "technicians";

    checkbox.value = technician.id;

    checkbox.checked = Boolean(assignment);

    checkbox.disabled = lockAssignments;

    const content = document.createElement("span");

    content.className = "detail-technician-data";

    const topRow = document.createElement("span");

    topRow.className = "detail-technician-top";

    const name = document.createElement("strong");

    name.textContent = technician.nombre;

    topRow.append(name);

    if (assignment) {
      const status = document.createElement("span");

      status.className =
        "technician-state " +
        `technician-state-${assigneeStatusClass(assignment.estado)}`;

      status.textContent = assigneeStatusLabel(assignment.estado);

      topRow.append(status);
    }

    const email = document.createElement("small");

    email.textContent = technician.email;

    content.append(topRow, email);

    label.append(checkbox, content);

    techniciansList.append(label);

    checkbox.addEventListener(
      "change",

      updateTechniciansSummary,
    );
  }

  updateTechniciansSummary();

  if (currentTask.estado === "en_progreso") {
    techniciansLockMessage.classList.remove("hidden");
  } else {
    techniciansLockMessage.classList.add("hidden");
  }
}

// ============================================================
// RENDER TAREA
// ============================================================

function renderTask() {
  document.getElementById("taskId").textContent = `Tarea #${currentTask.id}`;

  document.getElementById("taskTitle").textContent = currentTask.titulo;

  document.getElementById("titulo").value = currentTask.titulo;

  document.getElementById("descripcion").value = currentTask.descripcion ?? "";

  document.getElementById("prioridad").value = currentTask.prioridad;

  document.getElementById("fechaLimite").value = currentTask.fecha_limite ?? "";

  document.getElementById("horaLimite").value = currentTask.hora_limite ?? "";

  document.getElementById("ticketNumber").value =
    currentTask.ticket_number ?? "";

  locationSelect.value = currentTask.location_id
    ? String(currentTask.location_id)
    : "";

  shiftSelect.value = currentTask.shift_id ? String(currentTask.shift_id) : "";

  maintenanceTypeSelect.value = currentTask.maintenance_type_id
    ? String(currentTask.maintenance_type_id)
    : "";

  document.getElementById("taskBadges").textContent =
    `${taskStatusLabel(currentTask.estado)}` +
    " · " +
    `${priorityLabel(currentTask.prioridad)}`;

  // ========================================================
  // TAREAS FINALIZADAS
  // ========================================================

  if (
    currentTask.estado === "completada" ||
    currentTask.estado === "cancelada"
  ) {
    form
      .querySelectorAll("input, textarea, select, button")
      .forEach((item) => (item.disabled = true));

    cancelTaskButton.disabled = true;
  }
}

// ============================================================
// HISTORIAL
// ============================================================

function renderHistory(history) {
  const list = document.getElementById("historyList");

  list.replaceChildren();

  if (history.length === 0) {
    list.textContent = "Sin movimientos.";

    return;
  }

  for (const item of history) {
    const element = document.createElement("article");

    element.className = "history-item";

    const title = document.createElement("strong");

    title.textContent = item.accion.replaceAll("_", " ");

    const date = document.createElement("small");

    date.textContent = formatDateTime(item.created_at);

    element.append(title, date);

    if (item.estado_anterior || item.estado_nuevo) {
      const state = document.createElement("p");

      state.textContent =
        `${item.estado_anterior ?? "-"}` +
        " → " +
        `${item.estado_nuevo ?? "-"}`;

      element.append(state);
    }

    if (item.comentario) {
      const comment = document.createElement("p");

      comment.textContent = item.comentario;

      element.append(comment);
    }

    list.append(element);
  }
}

// ============================================================
// DURACIÓN DE UNA EJECUCIÓN
// ============================================================

function formatDuration(start, end) {
  if (!start || !end) {
    return "En curso";
  }

  const milliseconds = new Date(end).getTime() - new Date(start).getTime();

  if (milliseconds < 0) {
    return "-";
  }

  const totalMinutes = Math.floor(milliseconds / 60000);

  const hours = Math.floor(totalMinutes / 60);

  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return `${hours} h ${minutes} min`;
}

// ============================================================
// CREAR DATO DE EJECUCIÓN
// ============================================================

function createExecutionMeta(label, value) {
  const item = document.createElement("div");

  item.className = "admin-execution-meta-item";

  const labelElement = document.createElement("span");

  labelElement.textContent = label;

  const valueElement = document.createElement("strong");

  valueElement.textContent = value || "-";

  item.append(labelElement, valueElement);

  return item;
}

// ============================================================
// AUDIO PRIVADO
// ============================================================

function createAudioSection(execution) {
  const container = document.createElement("div");

  container.className = "admin-execution-audio";

  const label = document.createElement("span");

  label.className = "admin-execution-section-label";

  label.textContent = "Informe de voz";

  container.append(label);

  if (!execution.audio_path) {
    const empty = document.createElement("p");

    empty.className = "admin-execution-muted";

    empty.textContent = "Sin audio registrado.";

    container.append(empty);

    return container;
  }

  const button = document.createElement("button");

  button.type = "button";

  button.className = "admin-execution-audio-button";

  button.textContent = "▶ Escuchar informe";

  button.addEventListener(
    "click",

    async () => {
      button.disabled = true;

      button.textContent = "Preparando audio...";

      try {
        const signedUrl = await createExecutionAudioSignedUrl(
          execution.audio_path,
        );

        if (!signedUrl) {
          throw new Error("No fue posible generar la URL del audio.");
        }

        const audio = document.createElement("audio");

        audio.controls = true;

        audio.preload = "metadata";

        audio.src = signedUrl;

        audio.className = "admin-execution-audio-player";

        button.replaceWith(audio);

        try {
          await audio.play();
        } catch {
          // Algunos navegadores requieren que
          // el usuario pulse Play manualmente.
        }
      } catch (error) {
        console.error("Error cargando audio:", error);

        button.disabled = false;

        button.textContent = "No fue posible cargar el audio";
      }
    },
  );

  container.append(button);

  return container;
}

// ============================================================
// TRANSCRIPCIÓN DE EJECUCIÓN
//
// - Si existe: muestra el texto.
// - Si no existe pero hay audio: permite reintentar.
// - Si no existe audio: informa que no puede transcribirse.
// ============================================================

function createTranscriptionSection(execution) {
  const section = document.createElement("div");

  section.className = "admin-execution-section";

  // ========================================================
  // LABEL
  // ========================================================

  const label = document.createElement("span");

  label.className = "admin-execution-section-label";

  label.textContent = "Transcripción del audio";

  // ========================================================
  // CONTENIDO
  // ========================================================

  const content = document.createElement("div");

  content.className = "admin-execution-transcription-content";

  section.append(label, content);

  // ========================================================
  // FUNCIÓN INTERNA:
  // MOSTRAR TRANSCRIPCIÓN
  // ========================================================

  function showTranscription(text) {
    content.replaceChildren();

    const paragraph = document.createElement("p");

    paragraph.className = "admin-execution-transcription";

    paragraph.textContent = text;

    content.append(paragraph);
  }

  // ========================================================
  // YA EXISTE TRANSCRIPCIÓN
  // ========================================================

  if (execution.transcripcion && execution.transcripcion.trim()) {
    showTranscription(execution.transcripcion.trim());

    return section;
  }

  // ========================================================
  // SIN AUDIO
  // ========================================================

  if (!execution.audio_path) {
    const empty = document.createElement("p");

    empty.className = "admin-execution-muted";

    empty.textContent = "No existe audio para transcribir.";

    content.append(empty);

    return section;
  }

  // ========================================================
  // AUDIO EXISTE PERO NO HAY TRANSCRIPCIÓN
  // ========================================================

  const message = document.createElement("p");

  message.className = "admin-execution-transcription-pending";

  message.textContent =
    "El audio está guardado, pero todavía no tiene transcripción.";

  const button = document.createElement("button");

  button.type = "button";

  button.className = "admin-execution-transcription-button";

  button.textContent = "↻ Reintentar transcripción";

  const status = document.createElement("div");

  status.className = "admin-execution-transcription-status";

  content.append(message, button, status);

  // ========================================================
  // REINTENTAR
  // ========================================================

  button.addEventListener(
    "click",

    async () => {
      const confirmed = window.confirm(
        "¿Querés volver a intentar la transcripción de este informe de voz?",
      );

      if (!confirmed) {
        return;
      }

      button.disabled = true;

      button.textContent = "Transcribiendo...";

      status.textContent = "Procesando el audio...";

      status.className = "admin-execution-transcription-status";

      try {
        const transcription = await transcribeExecution(execution.id);

        if (!transcription || !transcription.trim()) {
          throw new Error("La transcripción fue devuelta vacía.");
        }

        // =================================================
        // ACTUALIZAR OBJETO LOCAL
        // =================================================

        execution.transcripcion = transcription.trim();

        // =================================================
        // MOSTRAR SIN RECARGAR
        // =================================================

        showTranscription(execution.transcripcion);
      } catch (error) {
        console.error("Error reintentando transcripción:", error);

        button.disabled = false;

        button.textContent = "↻ Reintentar transcripción";

        status.textContent =
          error?.message || "No fue posible generar la transcripción.";

        status.className = "admin-execution-transcription-status error";
      }
    },
  );

  return section;
}

// ============================================================
// CREAR CARD DE EJECUCIÓN
// ============================================================

function createExecutionCard(execution) {
  const card = document.createElement("article");

  card.className = "admin-execution-card";

  // ========================================================
  // HEADER
  // ========================================================

  const header = document.createElement("div");

  header.className = "admin-execution-header";

  const technician = document.createElement("div");

  technician.className = "admin-execution-technician";

  const name = document.createElement("strong");

  name.textContent = execution.technician_name;

  const email = document.createElement("small");

  email.textContent = execution.technician_email;

  technician.append(name, email);

  const status = document.createElement("span");

  status.className = execution.fin
    ? "admin-execution-status completed"
    : "admin-execution-status progress";

  status.textContent = execution.fin ? "Completada" : "En progreso";

  header.append(technician, status);

  // ========================================================
  // TRABAJOS REALIZADOS
  // ========================================================

  const workSection = document.createElement("div");

  workSection.className = "admin-execution-section";

  const workLabel = document.createElement("span");

  workLabel.className = "admin-execution-section-label";

  workLabel.textContent = "Trabajo realizado";

  const workTypes = document.createElement("div");

  workTypes.className = "admin-execution-work-types";

  if (execution.work_types.length === 0) {
    const empty = document.createElement("span");

    empty.className = "admin-execution-muted";

    empty.textContent = "Sin clasificación registrada";

    workTypes.append(empty);
  } else {
    for (const workType of execution.work_types) {
      const chip = document.createElement("span");

      chip.className = "admin-execution-work-chip";

      chip.textContent = workType.nombre;

      workTypes.append(chip);
    }
  }

  workSection.append(workLabel, workTypes);

  // ========================================================
  // DESCRIPCIÓN
  // ========================================================

  const descriptionSection = document.createElement("div");

  descriptionSection.className = "admin-execution-section";

  const descriptionLabel = document.createElement("span");

  descriptionLabel.className = "admin-execution-section-label";

  descriptionLabel.textContent = "Descripción del técnico";

  const description = document.createElement("p");

  description.className = "admin-execution-description";

  description.textContent = execution.descripcion || "Sin descripción escrita.";

  descriptionSection.append(descriptionLabel, description);

  // ========================================================
  // TRANSCRIPCIÓN
  // ========================================================

  const transcriptionSection = createTranscriptionSection(execution);

  // ========================================================
  // FECHAS
  // ========================================================

  const meta = document.createElement("div");

  meta.className = "admin-execution-meta";

  meta.append(
    createExecutionMeta(
      "Inicio",

      execution.inicio ? formatDateTime(execution.inicio) : "-",
    ),

    createExecutionMeta(
      "Finalización",

      execution.fin ? formatDateTime(execution.fin) : "En curso",
    ),

    createExecutionMeta(
      "Duración",

      formatDuration(execution.inicio, execution.fin),
    ),
  );

  // ========================================================
  // CARD
  // ========================================================

  card.append(
    header,

    workSection,

    descriptionSection,

    transcriptionSection,

    createAudioSection(execution),

    meta,
  );

  return card;
}

// ============================================================
// RENDER EJECUCIONES
// ============================================================

function renderExecutions(executions) {
  executionsList.replaceChildren();

  executionsLoading.classList.add("hidden");

  executionsCount.textContent =
    executions.length === 1
      ? "1 ejecución"
      : `${executions.length} ejecuciones`;

  if (executions.length === 0) {
    executionsList.classList.add("hidden");

    executionsEmpty.classList.remove("hidden");

    return;
  }

  executionsEmpty.classList.add("hidden");

  executionsList.classList.remove("hidden");

  for (const execution of executions) {
    executionsList.append(createExecutionCard(execution));
  }
}

// ============================================================
// CARGAR EJECUCIONES
//
// Está aislado del resto del detalle.
// Si falla, NO rompe Información/Historial.
// ============================================================

async function loadExecutions() {
  executionsLoading.classList.remove("hidden");

  executionsEmpty.classList.add("hidden");

  executionsList.classList.add("hidden");

  try {
    const executions = await getTaskExecutionsForAdmin(taskId);

    renderExecutions(executions);
  } catch (error) {
    console.error("Error cargando ejecuciones:", error);

    executionsLoading.textContent =
      "No fue posible cargar los trabajos realizados.";
  }
}

// ============================================================
// GUARDAR
// ============================================================

form.addEventListener(
  "submit",

  async (event) => {
    event.preventDefault();

    clearMessage();

    if (!form.reportValidity()) {
      return;
    }

    const selectedTechnicians = getSelectedTechnicians();

    if (selectedTechnicians.length === 0) {
      showError("Seleccioná al menos un técnico.");

      techniciansList.scrollIntoView({
        behavior: "smooth",

        block: "center",
      });

      return;
    }

    saveButton.disabled = true;

    saveButton.textContent = "Guardando...";

    try {
      await updateTaskMulti(
        taskId,

        {
          titulo: document.getElementById("titulo").value.trim(),

          descripcion: document.getElementById("descripcion").value.trim(),

          asignados: selectedTechnicians,

          prioridad: document.getElementById("prioridad").value,

          fecha_limite: document.getElementById("fechaLimite").value || null,

          hora_limite: document.getElementById("horaLimite").value || null,

          template_id: currentTask.template_id,

          location_id: optionalId(locationSelect.value),

          shift_id: optionalId(shiftSelect.value),

          ticket_number:
            document.getElementById("ticketNumber").value.trim() || null,

          maintenance_type_id: optionalId(maintenanceTypeSelect.value),
        },
      );

      window.location.href = "./tareas.html?updated=1";
    } catch (error) {
      console.error("Error actualizando tarea:", error);

      showError(error.message ?? "No fue posible actualizar la tarea.");

      saveButton.disabled = false;

      saveButton.textContent = "Guardar cambios";
    }
  },
);

// ============================================================
// CANCELAR TAREA
// ============================================================

cancelTaskButton.addEventListener(
  "click",

  async () => {
    const confirmed = window.confirm("¿Seguro que querés cancelar esta tarea?");

    if (!confirmed) {
      return;
    }

    const comment = window.prompt("Motivo de cancelación:", "");

    try {
      await cancelTask(taskId, comment);

      window.location.href = "./tareas.html?cancelled=1";
    } catch (error) {
      alert(error.message);
    }
  },
);

// ============================================================
// INICIALIZAR
// ============================================================

async function initialize() {
  const profile = await initAdminLayout({
    activePage: "tareas",

    title: "Detalle de tarea",

    subtitle: "Información, técnicos, historial y seguimiento",
  });

  if (!profile) {
    return;
  }

  if (!Number.isInteger(taskId) || taskId <= 0) {
    window.location.replace("./tareas.html");

    return;
  }

  try {
    const [
      task,

      assignees,

      history,

      technicians,

      locations,

      shifts,

      maintenanceTypes,
    ] = await Promise.all([
      getTaskMulti(taskId),

      getTaskAssignees(taskId),

      getTaskHistory(taskId),

      getTechnicians(),

      getLocations(),

      getShifts(),

      getMaintenanceTypes(),
    ]);

    currentTask = task;

    currentAssignees = assignees;

    // ====================================================
    // CATÁLOGOS
    // ====================================================

    populateSelect(locationSelect, locations);

    populateSelect(shiftSelect, shifts);

    populateSelect(maintenanceTypeSelect, maintenanceTypes);

    // ====================================================
    // RENDER
    // ====================================================

    renderTask();

    renderTechnicians(technicians, currentAssignees);

    renderHistory(history);

    await loadExecutions();

    setAdminTopbarTitle(`Tarea #${currentTask.id}`);

    setAdminTopbarSubtitle(currentTask.titulo);

    loading.classList.add("hidden");

    content.classList.remove("hidden");
  } catch (error) {
    console.error("Error cargando detalle:", error);

    loading.textContent = "No fue posible cargar la tarea.";
  }
}

initialize();
