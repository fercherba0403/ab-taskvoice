// ============================================================
// TASKVOICE
// worker-task-detail-v4.js
// ============================================================

import {
    requireRole
} from '../core/auth.js?v=20260831-01';

import {
    acceptTask,

    getLocations,

    getMaintenanceTypes,

    getMyTaskAssignment,

    getShifts,

    getTaskMulti,

    rejectTask,

    startTask
} from '../services/tasks.js';

import {
    addExecutionReport,

    completeExecutionWithWorkTypes,

    createExecutionAudioSignedUrl,

    createExecutionReportAudioSignedUrl,

    getExecutionReports,

    getTaskCompletedExecution,

    getTaskOpenExecution,

    getWorkTypes,

    removeExecutionReportAudio,

    transcribeExecution,

    transcribeExecutionReport,

    uploadExecutionAudio,

    uploadExecutionReportAudio
} from '../services/executions-v3.js';


import {
    createExecutionPhotoSignedUrl,

    getExecutionPhotos,

    removeExecutionPhoto,

    uploadExecutionPhoto
} from '../services/execution-photos.js';

// ============================================================
// ID
// ============================================================

const params =
    new URLSearchParams(
        window.location.search
    );

const taskId =
    Number(
        params.get(
            'id'
        )
    );

// ============================================================
// ELEMENTOS
// ============================================================

const loading =
    document.getElementById(
        'loading'
    );

const content =
    document.getElementById(
        'content'
    );

const decisionPanel =
    document.getElementById(
        'decisionPanel'
    );

const statusPanel =
    document.getElementById(
        'statusPanel'
    );

const acceptButton =
    document.getElementById(
        'acceptButton'
    );

const rejectButton =
    document.getElementById(
        'rejectButton'
    );

const startTaskButton =
    document.getElementById(
        'startTaskButton'
    );

const statusActions =
    document.getElementById(
        'statusActions'
    );

const workPanel =
    document.getElementById(
        'workPanel'
    );

const workDescription =
    document.getElementById(
        'workDescription'
    );

const recordButton =
    document.getElementById(
        'recordButton'
    );

const stopRecordButton =
    document.getElementById(
        'stopRecordButton'
    );

const discardRecordButton =
    document.getElementById(
        'discardRecordButton'
    );

const audioPreview =
    document.getElementById(
        'audioPreview'
    );

const recordingStatus =
    document.getElementById(
        'recordingStatus'
    );

const recordingTimer =
    document.getElementById(
        'recordingTimer'
    );

const completeWorkButton =
    document.getElementById(
        'completeWorkButton'
    );

const workMessage =
    document.getElementById(
        'workMessage'
    );

const reportDescription =
    document.getElementById(
        'reportDescription'
    );

const saveReportButton =
    document.getElementById(
        'saveReportButton'
    );

const executionReportsPanel =
    document.getElementById(
        'executionReportsPanel'
    );

const executionReportsCount =
    document.getElementById(
        'executionReportsCount'
    );

const executionReportsList =
    document.getElementById(
        'executionReportsList'
    );

const executionReportsEmpty =
    document.getElementById(
        'executionReportsEmpty'
    );

const executionReportsMessage =
    document.getElementById(
        'executionReportsMessage'
    );

const workTypesList =
    document.getElementById(
        'workTypesList'
    );

const workTypesSummary =
    document.getElementById(
        'workTypesSummary'
    );

const completedWorkPanel =
    document.getElementById(
        'completedWorkPanel'
    );

const completedWorkTypes =
    document.getElementById(
        'completedWorkTypes'
    );

const completedDescription =
    document.getElementById(
        'completedDescription'
    );

const completedAudio =
    document.getElementById(
        'completedAudio'
    );

const completedStart =
    document.getElementById(
        'completedStart'
    );

const completedEnd =
    document.getElementById(
        'completedEnd'
    );

const completedDuration =
    document.getElementById(
        'completedDuration'
    );
const completedTranscriptionSection =
    document.getElementById(
        'completedTranscriptionSection'
    );

const completedTranscription =
    document.getElementById(
        'completedTranscription'
    );


const photoCounter =
    document.getElementById(
        'photoCounter'
    );

const photoCameraButton =
    document.getElementById(
        'photoCameraButton'
    );

const photoGalleryButton =
    document.getElementById(
        'photoGalleryButton'
    );

const photoCameraInput =
    document.getElementById(
        'photoCameraInput'
    );

const photoGalleryInput =
    document.getElementById(
        'photoGalleryInput'
    );

const photoGrid =
    document.getElementById(
        'photoGrid'
    );

const photoEmpty =
    document.getElementById(
        'photoEmpty'
    );

const completedPhotos =
    document.getElementById(
        'completedPhotos'
    );

const completedPhotosEmpty =
    document.getElementById(
        'completedPhotosEmpty'
    );


let currentTask = null;

let currentAssignment = null;

let currentExecutionId = null;

let availableWorkTypes = [];

let currentExecutionReports = [];

let reportOperationBusy = false;


let currentPhotos = [];

let photoOperationBusy = false;

let mediaRecorder = null;

let mediaStream = null;

let audioChunks = [];

let audioBlob = null;

let audioPreviewUrl = null;

let recordingStartedAt = null;

let recordingInterval = null;

let recordingTimeout = null;

// ============================================================
// ESTADOS
// ============================================================

function stateLabel(
    state
) {

    const labels = {

        pendiente:
            'Pendiente',

        aceptada:
            'Aceptada',

        en_progreso:
            'En progreso',

        completada:
            'Completada',

        rechazada:
            'Rechazada',

        cancelada:
            'Cancelada'

    };


    return labels[state]
        ?? state;

}



function stateClass(
    state
) {

    const classes = {

        pendiente:
            'pending',

        aceptada:
            'accepted',

        en_progreso:
            'progress',

        completada:
            'completed',

        rechazada:
            'rejected',

        cancelada:
            'cancelled'

    };


    return classes[state]
        ?? 'pending';

}



// ============================================================
// PRIORIDAD
// ============================================================

function priorityLabel(
    priority
) {

    const values = {

        baja:
            'Baja',

        normal:
            'Normal',

        alta:
            'Alta',

        urgente:
            'Urgente'

    };


    return values[priority]
        ?? priority;

}



// ============================================================
// FECHA
// ============================================================

function formatDate(
    value
) {

    if (!value) {

        return 'Sin fecha';

    }


    const [
        year,
        month,
        day
    ] =
        value.split('-');


    return (
        `${day}/${month}/${year}`
    );

}



// ============================================================
// BUSCAR NOMBRE EN CATÁLOGO
// ============================================================

function catalogName(
    items,
    id,
    fallback
) {

    if (!id) {

        return fallback;

    }


    return (

        items.find(
            item =>
                Number(item.id) ===
                Number(id)
        )?.nombre

        ??

        fallback

    );

}



// ============================================================
// BADGE
// ============================================================

function renderState() {

    const badge =
        document.getElementById(
            'assignmentState'
        );


    badge.className =

        'worker-state '

        +

        `worker-state-${stateClass(
            currentAssignment.estado
        )

        }`;


    badge.textContent =
        stateLabel(
            currentAssignment.estado
        );

}



// ============================================================
// PANEL SEGÚN ESTADO
// ============================================================

function renderActionState() {

    const state =
        currentAssignment.estado;

    statusActions.classList.add(
        'hidden'
    );

    workPanel.classList.add(
        'hidden'
    );

    completedWorkPanel.classList.add(
        'hidden'
    );


    if (
        state ===
        'pendiente'
    ) {

        decisionPanel.classList.remove(
            'hidden'
        );


        statusPanel.classList.add(
            'hidden'
        );


        return;

    }



    decisionPanel.classList.add(
        'hidden'
    );


    statusPanel.classList.remove(
        'hidden'
    );



    const title =
        document.getElementById(
            'statusTitle'
        );


    const text =
        document.getElementById(
            'statusText'
        );


    const reasonBox =
        document.getElementById(
            'rejectionReasonBox'
        );



    reasonBox.classList.add(
        'hidden'
    );



    if (
        state ===
        'aceptada'
    ) {

        title.textContent =
            'Tarea aceptada';

        text.textContent =
            'La tarea fue aceptada para todo el equipo. Cuando estén listos, cualquiera de los integrantes activos puede iniciar el trabajo.';

        statusActions.classList.remove(
            'hidden'
        );

        return;

    }

    if (
        state ===
        'en_progreso'
    ) {

        title.textContent =
            'Trabajo en progreso';

        text.textContent =
            'La ejecución del equipo está abierta. Registrá el trabajo realizado antes de completarla.';

        workPanel.classList.remove(
            'hidden'
        );

        return;

    }

    if (
        state ===
        'completada'
    ) {

        title.textContent =
            'Trabajo completado';


        text.textContent =
            'La tarea del equipo ya fue finalizada. Debajo podés consultar el trabajo registrado.';


        completedWorkPanel.classList.remove(
            'hidden'
        );


        return;

    }



    if (
        state ===
        'rechazada'
    ) {

        title.textContent =
            'Tarea rechazada';


        text.textContent =
            'Informaste que no podés realizar esta tarea.';


        document.getElementById(
            'rejectionReason'
        ).textContent =

            currentAssignment
                .rejection_reason

            ||

            'Sin motivo registrado.';


        reasonBox.classList.remove(
            'hidden'
        );


        return;

    }



    title.textContent =
        'Tarea no disponible';


    text.textContent =
        'Esta asignación ya no está activa.';

}



// ============================================================
// ACEPTAR
// ============================================================

acceptButton.addEventListener(

    'click',

    async () => {

        const confirmed =
            window.confirm(
                'Al aceptar, la tarea quedará aceptada para todo el equipo. ¿Confirmás?'
            );


        if (!confirmed) {

            return;

        }


        acceptButton.disabled =
            true;


        rejectButton.disabled =
            true;


        acceptButton.textContent =
            'Aceptando...';


        try {

            await acceptTask(
                taskId
            );


            currentAssignment =
                await getMyTaskAssignment(
                    taskId
                );


            renderState();

            renderActionState();

            // ============================================================
// RECARGAR REGISTRO COMPLETADO
//
// Permite mostrar inmediatamente:
// - trabajos realizados
// - descripción
// - audio
// - transcripción
// - tiempos
// ============================================================

if (
    currentAssignment.estado ===
    'completada'
) {

    const completedExecution =
        await getTaskCompletedExecution(
            taskId
        );


    await renderCompletedWork(
        completedExecution
    );


    await loadExecutionReports(
        completedExecution?.id
        ??
        null
    );

}


        } catch (error) {

            console.error(
                'Error aceptando tarea:',
                error
            );


            alert(
                error.message
            );


        } finally {

            acceptButton.disabled =
                false;


            rejectButton.disabled =
                false;


            acceptButton.textContent =
                'Aceptar tarea';

        }

    }

);



// ============================================================
// RECHAZAR
// ============================================================

rejectButton.addEventListener(

    'click',

    async () => {

        const reason =
            window.prompt(
                'Indicá el motivo por el que rechazás esta tarea:',
                ''
            );


        if (
            reason === null
        ) {

            return;

        }


        if (
            !reason.trim()
        ) {

            alert(
                'Debés indicar un motivo.'
            );

            return;

        }


        const confirmed =
            window.confirm(
                '¿Confirmás el rechazo de esta tarea?'
            );


        if (!confirmed) {

            return;

        }


        acceptButton.disabled =
            true;


        rejectButton.disabled =
            true;


        rejectButton.textContent =
            'Rechazando...';


        try {

            await rejectTask(
                taskId,
                reason.trim()
            );


            currentAssignment =
                await getMyTaskAssignment(
                    taskId
                );


            renderState();

            renderActionState();


        } catch (error) {

            console.error(
                'Error rechazando tarea:',
                error
            );


            alert(
                error.message
            );


        } finally {

            acceptButton.disabled =
                false;


            rejectButton.disabled =
                false;


            rejectButton.textContent =
                'Rechazar';

        }

    }

);

// ============================================================
// INICIAR TRABAJO
// ============================================================

startTaskButton.addEventListener(

    'click',

    async () => {

        const confirmed =
            window.confirm(
                'Al iniciar, la tarea pasará a En progreso para todo el equipo. ¿Confirmás?'
            );


        if (!confirmed) {

            return;

        }


        startTaskButton.disabled =
            true;


        startTaskButton.textContent =
            'Iniciando...';


        try {

            const executionId =
                await startTask(
                    taskId
                );

            currentExecutionId =
                executionId;


            currentAssignment =
                await getMyTaskAssignment(
                    taskId
                );


            renderState();

            renderActionState();


            await refreshWorkPhotos();


            await loadExecutionReports(
                executionId
            );


            updateSaveReportButton();


            console.log(
                'Ejecución iniciada:',
                executionId
            );


        } catch (error) {

            console.error(
                'Error iniciando tarea:',
                error
            );


            alert(
                error.message
            );


        } finally {

            startTaskButton.disabled =
                false;


            startTaskButton.textContent =
                'Iniciar trabajo';

        }

    }

);

// ============================================================
// FOTOGRAFÍAS DE LA EJECUCIÓN
// ============================================================

function updatePhotoControls() {

    const canEdit =
        currentAssignment?.estado ===
            'en_progreso'
        &&
        Boolean(
            currentExecutionId
        );


    const limitReached =
        currentPhotos.length >= 3;


    const disabled =
        !canEdit
        ||
        limitReached
        ||
        photoOperationBusy;


    photoCameraButton.disabled =
        disabled;


    photoGalleryButton.disabled =
        disabled;


    photoCounter.textContent =
        `${currentPhotos.length} / 3`;

}


async function buildPhotoCard(
    photo,
    editable
) {

    const card =
        document.createElement(
            'article'
        );


    card.className =
        'worker-photo-card';


    const link =
        document.createElement(
            'a'
        );


    link.className =
        'worker-photo-link';


    link.target =
        '_blank';


    link.rel =
        'noopener noreferrer';


    try {

        const signedUrl =
            await createExecutionPhotoSignedUrl(
                photo.storage_path
            );


        if (!signedUrl) {

            throw new Error(
                'URL de fotografía no disponible.'
            );

        }


        link.href =
            signedUrl;


        const image =
            document.createElement(
                'img'
            );


        image.className =
            'worker-photo-image';


        image.src =
            signedUrl;


        image.alt =
            'Fotografía del trabajo realizado';


        image.loading =
            'lazy';


        link.append(
            image
        );


    } catch (error) {

        console.warn(
            'No fue posible generar la vista previa de una fotografía:',
            error
        );


        link.removeAttribute(
            'href'
        );


        const errorBox =
            document.createElement(
                'div'
            );


        errorBox.className =
            'worker-photo-image-error';


        errorBox.textContent =
            'No se pudo cargar la vista previa';


        link.append(
            errorBox
        );

    }


    card.append(
        link
    );


    if (editable) {

        const footer =
            document.createElement(
                'div'
            );


        footer.className =
            'worker-photo-card-footer';


        const deleteButton =
            document.createElement(
                'button'
            );


        deleteButton.type =
            'button';


        deleteButton.className =
            'worker-photo-delete';


        deleteButton.textContent =
            'Eliminar';


        deleteButton.disabled =
            photoOperationBusy;


        deleteButton.addEventListener(

            'click',

            async () => {

                if (
                    photoOperationBusy
                ) {

                    return;

                }


                const confirmed =
                    window.confirm(
                        '¿Eliminar esta fotografía de la intervención?'
                    );


                if (!confirmed) {

                    return;

                }


                photoOperationBusy =
                    true;


                updatePhotoControls();


                deleteButton.disabled =
                    true;


                showWorkMessage(
                    'Eliminando fotografía...'
                );


                try {

                    await removeExecutionPhoto(
                        photo
                    );


                    await refreshWorkPhotos();


                    showWorkMessage(
                        'Fotografía eliminada.',
                        'success'
                    );


                } catch (error) {

                    console.error(
                        'Error eliminando fotografía:',
                        error
                    );


                    showWorkMessage(
                        error.message
                        ??
                        'No fue posible eliminar la fotografía.',
                        'error'
                    );


                } finally {

                    photoOperationBusy =
                        false;


                    updatePhotoControls();

                }

            }

        );


        footer.append(
            deleteButton
        );


        card.append(
            footer
        );

    }


    return card;

}


async function renderPhotoCollection(
    container,
    emptyElement,
    photos,
    editable
) {

    container.replaceChildren();


    if (
        photos.length === 0
    ) {

        emptyElement.classList.remove(
            'hidden'
        );


        return;

    }


    emptyElement.classList.add(
        'hidden'
    );


    for (
        const photo of photos
    ) {

        const card =
            await buildPhotoCard(
                photo,
                editable
            );


        container.append(
            card
        );

    }

}


async function refreshWorkPhotos() {

    if (!currentExecutionId) {

        currentPhotos = [];


        await renderPhotoCollection(
            photoGrid,
            photoEmpty,
            currentPhotos,
            true
        );


        updatePhotoControls();


        return;

    }


    currentPhotos =
        await getExecutionPhotos(
            currentExecutionId
        );


    await renderPhotoCollection(
        photoGrid,
        photoEmpty,
        currentPhotos,
        true
    );


    updatePhotoControls();

}


async function renderCompletedPhotos(
    executionId
) {

    if (!executionId) {

        completedPhotos.replaceChildren();


        completedPhotosEmpty.classList.remove(
            'hidden'
        );


        return;

    }


    const photos =
        await getExecutionPhotos(
            executionId
        );


    await renderPhotoCollection(
        completedPhotos,
        completedPhotosEmpty,
        photos,
        false
    );

}


async function handleSelectedPhoto(
    file,
    input
) {

    try {

        if (!file) {

            return;

        }


        if (
            photoOperationBusy
        ) {

            return;

        }


        if (!currentExecutionId) {

            throw new Error(
                'No se encontró una ejecución abierta para cargar la fotografía.'
            );

        }


        if (
            currentPhotos.length >= 3
        ) {

            throw new Error(
                'La intervención ya tiene el máximo de 3 fotografías.'
            );

        }


        photoOperationBusy =
            true;


        updatePhotoControls();


        showWorkMessage(
            'Subiendo fotografía...'
        );


        await uploadExecutionPhoto(
            currentTask,
            currentExecutionId,
            file
        );


        await refreshWorkPhotos();


        showWorkMessage(
            'Fotografía agregada correctamente.',
            'success'
        );


    } catch (error) {

        console.error(
            'Error cargando fotografía:',
            error
        );


        showWorkMessage(
            error.message
            ??
            'No fue posible cargar la fotografía.',
            'error'
        );


    } finally {

        if (input) {

            input.value =
                '';

        }


        photoOperationBusy =
            false;


        updatePhotoControls();

    }

}


photoCameraButton.addEventListener(

    'click',

    () => {

        if (!photoCameraButton.disabled) {

            photoCameraInput.click();

        }

    }

);


photoGalleryButton.addEventListener(

    'click',

    () => {

        if (!photoGalleryButton.disabled) {

            photoGalleryInput.click();

        }

    }

);


photoCameraInput.addEventListener(

    'change',

    async event => {

        await handleSelectedPhoto(
            event.target.files?.[0]
                ?? null,
            photoCameraInput
        );

    }

);


photoGalleryInput.addEventListener(

    'change',

    async event => {

        await handleSelectedPhoto(
            event.target.files?.[0]
                ?? null,
            photoGalleryInput
        );

    }

);


// ============================================================
// FORMATEAR TIEMPO DE GRABACIÓN
// ============================================================

function formatRecordingTime(
    seconds
) {

    const minutes =
        Math.floor(
            seconds / 60
        );


    const remainingSeconds =
        seconds % 60;


    return (

        String(minutes)
            .padStart(
                2,
                '0'
            )

        +

        ':'

        +

        String(remainingSeconds)
            .padStart(
                2,
                '0'
            )

    );

}



// ============================================================
// MIME SOPORTADO
// ============================================================

function getSupportedAudioType() {

    const types = [

        'audio/webm;codecs=opus',

        'audio/webm',

        'audio/ogg;codecs=opus',

        'audio/mp4'

    ];


    for (
        const type of types
    ) {

        if (
            MediaRecorder
                .isTypeSupported(
                    type
                )
        ) {

            return type;

        }

    }


    return '';

}



// ============================================================
// LIBERAR MICRÓFONO
// ============================================================

function stopMediaStream() {

    if (!mediaStream) {

        return;

    }


    for (
        const track of
        mediaStream.getTracks()
    ) {

        track.stop();

    }


    mediaStream =
        null;

}



// ============================================================
// DETENER TIMER
// ============================================================

function stopRecordingTimer() {

    if (
        recordingInterval
    ) {

        clearInterval(
            recordingInterval
        );


        recordingInterval =
            null;

    }


    if (
        recordingTimeout
    ) {

        clearTimeout(
            recordingTimeout
        );


        recordingTimeout =
            null;

    }

}



// ============================================================
// MOSTRAR MENSAJE
// ============================================================

function showWorkMessage(
    text,
    type = ''
) {

    workMessage.textContent =
        text;


    workMessage.className =
        'worker-work-message';


    if (type) {

        workMessage.classList.add(
            type
        );

    }

}



// ============================================================
// MENSAJE DEL HISTORIAL DE REPORTES
// ============================================================

function showReportsMessage(
    text,
    type = ''
) {

    executionReportsMessage.textContent =
        text;


    executionReportsMessage.className =
        'worker-reports-message';


    if (type) {

        executionReportsMessage.classList.add(
            type
        );

    }

}



// ============================================================
// FECHA Y HORA DEL REPORTE
// ============================================================

function formatReportDateTime(
    value
) {

    if (!value) {

        return 'Sin fecha';

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return 'Sin fecha';

    }


    return new Intl.DateTimeFormat(
        'es-AR',
        {
            dateStyle:
                'short',

            timeStyle:
                'short'
        }
    ).format(date);

}



// ============================================================
// ESTADO DE TRANSCRIPCIÓN DEL REPORTE
// ============================================================

function reportStatusLabel(
    status
) {

    const labels = {

        not_required:
            'Sin audio',

        pending:
            'Pendiente',

        processing:
            'Transcribiendo',

        completed:
            'Transcripto',

        failed:
            'Error'

    };


    return labels[status]
        ?? 'Pendiente';

}



function reportStatusClass(
    status
) {

    const allowed = [
        'not_required',
        'pending',
        'processing',
        'completed',
        'failed'
    ];


    return allowed.includes(status)
        ? status
        : 'pending';

}



// ============================================================
// RESTABLECER EL GRABADOR
// ============================================================

function resetAudioRecording() {

    stopRecordingTimer();

    stopMediaStream();


    audioBlob =
        null;


    audioChunks =
        [];


    if (
        audioPreviewUrl
    ) {

        URL.revokeObjectURL(
            audioPreviewUrl
        );


        audioPreviewUrl =
            null;

    }


    audioPreview.removeAttribute(
        'src'
    );


    audioPreview.load();


    audioPreview.classList.add(
        'hidden'
    );


    discardRecordButton.classList.add(
        'hidden'
    );


    recordingTimer.textContent =
        '00:00';


    recordingStatus.textContent =
        'Sin grabación';


    recordButton.textContent =
        '🎙 Grabar informe';


    updateSaveReportButton();

}



// ============================================================
// DISPONIBILIDAD DEL BOTÓN GUARDAR REPORTE
// ============================================================

function updateSaveReportButton() {

    const recording =
        mediaRecorder?.state ===
        'recording';


    const hasText =
        Boolean(
            reportDescription
                .value
                .trim()
        );


    const hasAudio =
        Boolean(
            audioBlob
        );


    const canSave =
        currentAssignment?.estado ===
            'en_progreso'
        &&
        Boolean(
            currentExecutionId
        )
        &&
        (
            hasText
            ||
            hasAudio
        )
        &&
        !recording
        &&
        !reportOperationBusy;


    saveReportButton.disabled =
        !canSave;


    if (!reportOperationBusy) {

        if (hasAudio) {

            saveReportButton.textContent =
                'Guardar y transcribir reporte';

        } else if (hasText) {

            saveReportButton.textContent =
                'Guardar reporte escrito';

        } else {

            saveReportButton.textContent =
                'Guardar reporte';

        }

    }

}



// ============================================================
// CREAR ELEMENTO DEL HISTORIAL
// ============================================================

function createExecutionReportItem(
    report,
    index
) {

    const item =
        document.createElement(
            'article'
        );


    item.className =
        'worker-report-item';


    const header =
        document.createElement(
            'div'
        );


    header.className =
        'worker-report-item-header';


    const identification =
        document.createElement(
            'div'
        );


    const number =
        document.createElement(
            'strong'
        );


    number.className =
        'worker-report-number';


    number.textContent =
        `Reporte de avance #${index + 1}`;


    const meta =
        document.createElement(
            'span'
        );


    meta.className =
        'worker-report-meta';


    meta.textContent =
        `${report.technician_name || 'Técnico'} · ${formatReportDateTime(
            report.created_at
        )}`;


    identification.append(
        number,
        meta
    );


    const status =
        document.createElement(
            'span'
        );


    status.className =
        'worker-report-status '
        +
        `worker-report-status-${reportStatusClass(
            report.transcription_status
        )}`;


    status.textContent =
        reportStatusLabel(
            report.transcription_status
        );


    header.append(
        identification,
        status
    );


    item.append(
        header
    );


    if (
        report.descripcion
        &&
        report.descripcion.trim()
    ) {

        const description =
            document.createElement(
                'p'
            );


        description.className =
            'worker-report-description';


        description.textContent =
            report.descripcion.trim();


        item.append(
            description
        );

    }


    if (
        report.transcripcion
        &&
        report.transcripcion.trim()
    ) {

        const transcription =
            document.createElement(
                'p'
            );


        transcription.className =
            'worker-report-transcription';


        transcription.textContent =
            report.transcripcion.trim();


        item.append(
            transcription
        );

    } else {

        const stateMessage =
            document.createElement(
                'p'
            );


        stateMessage.className =
            'worker-report-state-message';


        if (
            report.transcription_status ===
            'not_required'
        ) {

            stateMessage.textContent =
                'Reporte escrito. No requiere transcripción.';

        } else if (
            report.transcription_status ===
            'processing'
        ) {

            stateMessage.textContent =
                'La transcripción se está procesando.';

        } else if (
            report.transcription_status ===
            'failed'
        ) {

            stateMessage.classList.add(
                'error'
            );


            stateMessage.textContent =
                Number(report.transcription_attempts) >= 5
                    ? 'No se pudo transcribir. Se alcanzó el máximo de cinco intentos.'
                    : 'No se pudo generar la transcripción. El audio permanece guardado.';

        } else {

            stateMessage.textContent =
                'La transcripción está pendiente.';

        }


        item.append(
            stateMessage
        );

    }


    const actions =
        document.createElement(
            'div'
        );


    actions.className =
        'worker-report-actions';


    if (report.audio_path) {

        const audioContainer =
            document.createElement(
                'div'
            );


        const audioButton =
            document.createElement(
                'button'
            );


        audioButton.type =
            'button';


        audioButton.className =
            'worker-report-audio-button';


        audioButton.textContent =
            'Escuchar audio';


        audioButton.addEventListener(

        'click',

        async () => {

            audioButton.disabled =
                true;


            audioButton.textContent =
                'Preparando audio...';


            try {

                const signedUrl =
                    await createExecutionReportAudioSignedUrl(
                        report.audio_path
                    );


                if (!signedUrl) {

                    throw new Error(
                        'No se pudo obtener el audio.'
                    );

                }


                const audio =
                    document.createElement(
                        'audio'
                    );


                audio.controls =
                    true;


                audio.preload =
                    'metadata';


                audio.src =
                    signedUrl;


                audio.className =
                    'worker-report-audio-player';


                audioContainer.replaceChildren(
                    audio
                );


                try {

                    await audio.play();

                } catch {

                    // El navegador puede exigir que el usuario
                    // vuelva a pulsar reproducir.

                }


            } catch (error) {

                console.error(
                    'Error cargando audio del reporte:',
                    error
                );


                audioButton.disabled =
                    false;


                audioButton.textContent =
                    'No fue posible cargar el audio';

            }

        }

        );


        audioContainer.append(
            audioButton
        );


        actions.append(
            audioContainer
        );

    }


    const canRetry =
        Boolean(
            report.audio_path
        )
        &&
        (
            report.transcription_status ===
            'pending'
            ||
            report.transcription_status ===
            'failed'
        )
        &&
        Number(report.transcription_attempts) < 5;


    if (canRetry) {

        const retryButton =
            document.createElement(
                'button'
            );


        retryButton.type =
            'button';


        retryButton.className =
            'worker-report-retry-button';


        retryButton.textContent =
            report.transcription_status === 'failed'
                ? 'Reintentar transcripción'
                : 'Generar transcripción';


        retryButton.addEventListener(

            'click',

            () => retryExecutionReport(
                report,
                retryButton
            )

        );


        actions.append(
            retryButton
        );

    }


    if (
        actions.childElementCount > 0
    ) {

        item.append(
            actions
        );

    }


    return item;

}



// ============================================================
// RENDERIZAR HISTORIAL DE REPORTES
// ============================================================

function renderExecutionReports() {

    executionReportsList.replaceChildren();


    const total =
        currentExecutionReports.length;


    executionReportsCount.textContent =
        `${total} reporte${total === 1 ? '' : 's'}`;


    if (total === 0) {

        executionReportsList.classList.add(
            'hidden'
        );


        executionReportsEmpty.classList.remove(
            'hidden'
        );


        return;

    }


    executionReportsEmpty.classList.add(
        'hidden'
    );


    executionReportsList.classList.remove(
        'hidden'
    );


    currentExecutionReports.forEach(

        (
            report,
            index
        ) => {

            executionReportsList.append(
                createExecutionReportItem(
                    report,
                    index
                )
            );

        }

    );

}



// ============================================================
// CARGAR REPORTES DE LA EJECUCIÓN
// ============================================================

async function loadExecutionReports(
    executionId
) {

    if (!executionId) {

        currentExecutionReports =
            [];


        executionReportsPanel.classList.add(
            'hidden'
        );


        return;

    }


    executionReportsPanel.classList.remove(
        'hidden'
    );


    try {

        currentExecutionReports =
            await getExecutionReports(
                executionId
            );


        renderExecutionReports();


    } catch (error) {

        console.error(
            'Error cargando reportes de avance:',
            error
        );


        currentExecutionReports =
            [];


        renderExecutionReports();


        showReportsMessage(
            'No fue posible cargar los reportes de avance.',
            'error'
        );

    }

}



// ============================================================
// REINTENTAR TRANSCRIPCIÓN
// ============================================================

async function retryExecutionReport(
    report,
    button
) {

    if (reportOperationBusy) {

        return;

    }


    reportOperationBusy =
        true;


    updateSaveReportButton();


    button.disabled =
        true;


    button.textContent =
        'Transcribiendo...';


    showReportsMessage(
        'Generando la transcripción del reporte...'
    );


    try {

        await transcribeExecutionReport(
            report.id
        );


        await loadExecutionReports(
            report.execution_id
        );


        showReportsMessage(
            'Transcripción generada correctamente.',
            'success'
        );


    } catch (error) {

        console.error(
            'Error reintentando transcripción:',
            error
        );


        await loadExecutionReports(
            report.execution_id
        );


        showReportsMessage(
            error.message
            ??
            'No fue posible generar la transcripción.',
            'error'
        );


    } finally {

        reportOperationBusy =
            false;


        updateSaveReportButton();

    }

}



// ============================================================
// INICIAR GRABACIÓN
// ============================================================

recordButton.addEventListener(

    'click',

    async () => {

        showWorkMessage(
            ''
        );


        if (
            !navigator.mediaDevices
            ||
            !navigator.mediaDevices.getUserMedia
            ||
            typeof MediaRecorder === 'undefined'
        ) {

            showWorkMessage(
                'Este navegador no permite grabar audio.',
                'error'
            );


            return;

        }


        try {

            mediaStream =
                await navigator
                    .mediaDevices
                    .getUserMedia({

                        audio: {

                            echoCancellation:
                                true,

                            noiseSuppression:
                                true,

                            autoGainControl:
                                true

                        }

                    });


            const mimeType =
                getSupportedAudioType();


            const options =
                mimeType

                    ? {

                        mimeType,

                        audioBitsPerSecond:
                            64000

                    }

                    : {

                        audioBitsPerSecond:
                            64000

                    };


            mediaRecorder =
                new MediaRecorder(
                    mediaStream,
                    options
                );


            audioChunks =
                [];


            mediaRecorder.addEventListener(

                'dataavailable',

                event => {

                    if (
                        event.data
                        &&
                        event.data.size > 0
                    ) {

                        audioChunks.push(
                            event.data
                        );

                    }

                }

            );


            mediaRecorder.addEventListener(

                'stop',

                () => {

                    const finalMimeType =

                        mediaRecorder.mimeType

                        ||

                        mimeType

                        ||

                        'audio/webm';


                    audioBlob =
                        new Blob(

                            audioChunks,

                            {

                                type:
                                    finalMimeType

                            }

                        );


                    if (
                        audioPreviewUrl
                    ) {

                        URL.revokeObjectURL(
                            audioPreviewUrl
                        );

                    }


                    audioPreviewUrl =
                        URL.createObjectURL(
                            audioBlob
                        );


                    audioPreview.src =
                        audioPreviewUrl;


                    audioPreview.classList.remove(
                        'hidden'
                    );


                    discardRecordButton.classList.remove(
                        'hidden'
                    );


                    recordingStatus.textContent =
                        'Grabación lista';


                    recordButton.textContent =
                        '🎙 Volver a grabar';


                    updateSaveReportButton();


                    completeWorkButton.disabled =
                        reportOperationBusy;


                    stopMediaStream();

                }

            );


            mediaRecorder.start();


            recordingStartedAt =
                Date.now();


            recordingTimer.textContent =
                '00:00';


            recordingStatus.textContent =
                'Grabando...';


            recordButton.disabled =
                true;


            saveReportButton.disabled =
                true;


            completeWorkButton.disabled =
                true;


            stopRecordButton.disabled =
                false;


            discardRecordButton.classList.add(
                'hidden'
            );


            audioPreview.classList.add(
                'hidden'
            );


            recordingInterval =
                setInterval(

                    () => {

                        const elapsed =
                            Math.floor(

                                (
                                    Date.now()
                                    -
                                    recordingStartedAt
                                )

                                /

                                1000

                            );


                        recordingTimer.textContent =
                            formatRecordingTime(
                                elapsed
                            );

                    },

                    1000

                );


            // ------------------------------------------------
            // Máximo 5 minutos
            // ------------------------------------------------

            recordingTimeout =
                setTimeout(

                    () => {

                        if (
                            mediaRecorder
                            &&
                            mediaRecorder.state ===
                            'recording'
                        ) {

                            mediaRecorder.stop();

                        }


                        stopRecordingTimer();


                        recordButton.disabled =
                            false;


                        stopRecordButton.disabled =
                            true;

                    },

                    5 * 60 * 1000

                );


        } catch (error) {

            console.error(
                'Error accediendo al micrófono:',
                error
            );


            stopMediaStream();


            showWorkMessage(
                'No fue posible acceder al micrófono. Verificá los permisos del navegador.',
                'error'
            );

        }

    }

);

// ============================================================
// DETENER GRABACIÓN
// ============================================================

stopRecordButton.addEventListener(

    'click',

    () => {

        if (
            !mediaRecorder
            ||
            mediaRecorder.state !==
            'recording'
        ) {

            return;

        }


        mediaRecorder.stop();


        stopRecordingTimer();


        recordButton.disabled =
            false;


        stopRecordButton.disabled =
            true;

    }

);

// ============================================================
// DESCARTAR GRABACIÓN
// ============================================================

discardRecordButton.addEventListener(

    'click',

    () => {

        resetAudioRecording();


        showWorkMessage(
            ''
        );

    }

);



// ============================================================
// HABILITAR GUARDADO DE REPORTE ESCRITO
// ============================================================

reportDescription.addEventListener(
    'input',
    updateSaveReportButton
);



// ============================================================
// GUARDAR Y TRANSCRIBIR REPORTE PARCIAL
//
// Esta operación NO completa la ejecución y NO cambia estados.
// ============================================================

saveReportButton.addEventListener(

    'click',

    async () => {

        showWorkMessage(
            ''
        );


        showReportsMessage(
            ''
        );


        if (
            reportOperationBusy
        ) {

            return;

        }


        const description =
            reportDescription
                .value
                .trim();


        if (
            mediaRecorder?.state ===
            'recording'
        ) {

            showWorkMessage(
                'Detené la grabación antes de guardar el reporte.',
                'error'
            );


            return;

        }


        if (
            !description
            &&
            !audioBlob
        ) {

            showWorkMessage(
                'Escribí un detalle, grabá un informe de voz o ingresá ambos.',
                'error'
            );


            return;

        }


        if (
            !currentExecutionId
            ||
            currentAssignment?.estado !==
            'en_progreso'
        ) {

            showWorkMessage(
                'La tarea debe estar en progreso para guardar un reporte.',
                'error'
            );


            return;

        }


        reportOperationBusy =
            true;


        updateSaveReportButton();


        recordButton.disabled =
            true;


        stopRecordButton.disabled =
            true;


        discardRecordButton.disabled =
            true;


        completeWorkButton.disabled =
            true;


        reportDescription.disabled =
            true;


        saveReportButton.textContent =
            'Guardando reporte...';


        let uploadedAudioPath =
            null;


        let reportRegistered =
            false;


        try {

            if (audioBlob) {

                showWorkMessage(
                    'Subiendo audio del reporte...'
                );


                uploadedAudioPath =
                    await uploadExecutionReportAudio(

                        currentTask,

                        currentExecutionId,

                        audioBlob

                    );

            } else {

                showWorkMessage(
                    'Guardando reporte escrito...'
                );

            }


            const reportId =
                await addExecutionReport(

                    currentExecutionId,

                    uploadedAudioPath,

                    description || null

                );


            reportRegistered =
                true;


            resetAudioRecording();


            reportDescription.value =
                '';


            await loadExecutionReports(
                currentExecutionId
            );


            let transcriptionGenerated =
                false;


            if (uploadedAudioPath) {

                showWorkMessage(
                    'Reporte guardado. Generando transcripción...'
                );


                showReportsMessage(
                    'Reporte guardado. Generando transcripción...'
                );


                try {

                    const transcription =
                        await transcribeExecutionReport(
                            reportId
                        );


                    transcriptionGenerated =
                        Boolean(
                            transcription
                        );


                } catch (transcriptionError) {

                    console.warn(
                        'El reporte se guardó, pero no pudo transcribirse:',
                        transcriptionError
                    );

                }

            }


            await loadExecutionReports(
                currentExecutionId
            );


            if (!uploadedAudioPath) {

                showWorkMessage(
                    'Reporte escrito guardado. La tarea continúa en progreso.',
                    'success'
                );


                showReportsMessage(
                    'Reporte escrito guardado correctamente.',
                    'success'
                );

            } else if (transcriptionGenerated) {

                showWorkMessage(
                    'Reporte guardado y transcripto. La tarea continúa en progreso.',
                    'success'
                );


                showReportsMessage(
                    'Reporte guardado y transcripto correctamente.',
                    'success'
                );

            } else {

                showWorkMessage(
                    'Reporte guardado. El audio está seguro, pero la transcripción necesita reintento.',
                    'success'
                );


                showReportsMessage(
                    'El reporte quedó guardado, pero no pudo transcribirse. Podés reintentarlo desde el historial.',
                    'error'
                );

            }


        } catch (error) {

            console.error(
                'Error guardando reporte parcial:',
                error
            );


            if (
                uploadedAudioPath
                &&
                !reportRegistered
            ) {

                try {

                    await removeExecutionReportAudio(
                        uploadedAudioPath
                    );

                } catch (cleanupError) {

                    console.warn(
                        'No se pudo eliminar el audio no registrado:',
                        cleanupError
                    );

                }

            }


            showWorkMessage(
                error.message
                ??
                'No fue posible guardar el reporte.',
                'error'
            );


        } finally {

            reportOperationBusy =
                false;


            recordButton.disabled =
                false;


            stopRecordButton.disabled =
                true;


            discardRecordButton.disabled =
                false;


            completeWorkButton.disabled =
                false;


            reportDescription.disabled =
                false;


            updateSaveReportButton();

        }

    }

);

// ============================================================
// COMPLETAR TAREA DEL EQUIPO
// ============================================================

completeWorkButton.addEventListener(

    'click',

    async () => {

        showWorkMessage(
            ''
        );


        if (
            reportOperationBusy
        ) {

            showWorkMessage(
                'Esperá a que termine el guardado o la transcripción del reporte.',
                'error'
            );


            return;

        }


        if (
            photoOperationBusy
        ) {

            showWorkMessage(
                'Esperá a que termine la operación con fotografías antes de completar la tarea.',
                'error'
            );


            return;

        }


        const description =
            workDescription
                .value
                .trim();

        const selectedWorkTypeIds =
            getSelectedWorkTypeIds();

        if (
            selectedWorkTypeIds.length === 0
        ) {

            showWorkMessage(
                'Seleccioná al menos un tipo de trabajo realizado.',
                'error'
            );


            return;

        }


        if (
            !description
            &&
            !audioBlob
            &&
            currentExecutionReports.length === 0
        ) {

            showWorkMessage(
                'Ingresá una descripción, grabá un informe o guardá al menos un reporte de avance.',
                'error'
            );


            return;

        }


        if (
            !currentExecutionId
        ) {

            showWorkMessage(
                'No se encontró una ejecución abierta para esta tarea.',
                'error'
            );


            return;

        }


        const confirmed =
            window.confirm(
                'Al completar, la tarea quedará finalizada para todo el equipo. ¿Confirmás?'
            );


        if (!confirmed) {

            return;

        }


        completeWorkButton.disabled =
            true;


        completeWorkButton.textContent =
            'Guardando trabajo...';


        recordButton.disabled =
            true;


        stopRecordButton.disabled =
            true;


        photoOperationBusy =
            true;


        updatePhotoControls();


        try {

            let audioPath =
                null;


            // =================================================
            // AUDIO
            // =================================================

            if (
                audioBlob
            ) {

                showWorkMessage(
                    'Subiendo informe de voz...'
                );


                audioPath =
                    await uploadExecutionAudio(

                        currentTask,

                        currentExecutionId,

                        audioBlob

                    );

            }



            // =================================================
            // COMPLETAR
            // =================================================

            showWorkMessage(
                'Finalizando tarea del equipo...'
            );


            const finishedExecutionId =
                currentExecutionId;


            await completeExecutionWithWorkTypes(

                finishedExecutionId,

                selectedWorkTypeIds,

                {

                    descripcion:
                        description || null,

                    transcripcion:
                        null,

                    audioPath

                }

            );


            // ============================================================
            // TRANSCRIPCIÓN AUTOMÁTICA
            //
            // IMPORTANTE:
            // La tarea YA quedó completada.
            //
            // Si OpenAI falla, NO perdemos:
            // - ejecución
            // - audio
            // - descripción
            // - tipos de trabajo
            // - finalización
            // ============================================================

            let transcriptionGenerated =
                false;


            if (
                audioPath
            ) {

                showWorkMessage(
                    'Trabajo guardado. Generando transcripción del audio...'
                );


                try {

                    const transcription =
                        await transcribeExecution(
                            finishedExecutionId
                        );


                    transcriptionGenerated =
                        Boolean(
                            transcription
                        );


                } catch (
                transcriptionError
                ) {

                    console.warn(
                        'La tarea se completó, pero la transcripción no pudo generarse:',
                        transcriptionError
                    );

                }

            }



            currentAssignment =
                await getMyTaskAssignment(
                    taskId
                );


            renderState();

            renderActionState();


            const completedExecution =
                await getTaskCompletedExecution(
                    taskId
                );


            await renderCompletedWork(
                completedExecution
            );


            await loadExecutionReports(
                finishedExecutionId
            );


            if (
                transcriptionGenerated
            ) {

                showWorkMessage(
                    'Trabajo registrado y audio transcripto correctamente.',
                    'success'
                );

            } else if (
                audioPath
            ) {

                showWorkMessage(
                    'Trabajo registrado correctamente. El audio quedó guardado, pero la transcripción no pudo generarse.',
                    'success'
                );

            } else {

                showWorkMessage(
                    'Trabajo registrado correctamente.',
                    'success'
                );

            }


            currentExecutionId =
                null;


        } catch (error) {

            console.error(
                'Error completando participación:',
                error
            );


            showWorkMessage(
                error.message
                ??
                'No fue posible completar el trabajo.',
                'error'
            );


        } finally {

            photoOperationBusy =
                false;


            updatePhotoControls();


            completeWorkButton.disabled =
                false;


            completeWorkButton.textContent =
                'Completar tarea';


            recordButton.disabled =
                false;

        }

    }

);

// ============================================================
// TIPOS DE TRABAJO SELECCIONADOS
// ============================================================

function getSelectedWorkTypeIds() {

    return [

        ...workTypesList.querySelectorAll(
            'input[type="checkbox"]:checked'
        )

    ].map(

        checkbox =>
            Number(
                checkbox.value
            )

    );

}



// ============================================================
// ACTUALIZAR RESUMEN
// ============================================================

function updateWorkTypesSummary() {

    const selected =
        getSelectedWorkTypeIds();


    if (
        selected.length === 0
    ) {

        workTypesSummary.textContent =
            'Ningún tipo seleccionado';


        return;

    }


    workTypesSummary.textContent =

        `${selected.length} tipo${selected.length === 1
            ? ''
            : 's'

        } seleccionado${selected.length === 1
            ? ''
            : 's'

        }`;

}



// ============================================================
// RENDERIZAR TIPOS DE TRABAJO
// ============================================================

function renderWorkTypes() {

    workTypesList.replaceChildren();


    if (
        availableWorkTypes.length === 0
    ) {

        const empty =
            document.createElement(
                'p'
            );


        empty.className =
            'worker-work-types-empty';


        empty.textContent =
            'No hay tipos de trabajo disponibles.';


        workTypesList.append(
            empty
        );


        return;

    }



    for (
        const workType of
        availableWorkTypes
    ) {

        const label =
            document.createElement(
                'label'
            );


        label.className =
            'worker-work-type-option';



        const checkbox =
            document.createElement(
                'input'
            );


        checkbox.type =
            'checkbox';


        checkbox.value =
            String(
                workType.id
            );



        const text =
            document.createElement(
                'span'
            );


        text.textContent =
            workType.nombre;



        checkbox.addEventListener(

            'change',

            updateWorkTypesSummary

        );


        label.append(
            checkbox,
            text
        );


        workTypesList.append(
            label
        );

    }


    updateWorkTypesSummary();

}

// ============================================================
// FECHA / HORA PARA EJECUCIÓN
// ============================================================

function formatExecutionDateTime(
    value
) {

    if (!value) {

        return '-';

    }


    return new Intl.DateTimeFormat(

        'es-AR',

        {

            dateStyle:
                'short',

            timeStyle:
                'short'

        }

    ).format(
        new Date(value)
    );

}



// ============================================================
// DURACIÓN
// ============================================================

function formatExecutionDuration(
    start,
    end
) {

    if (
        !start
        ||
        !end
    ) {

        return '-';

    }


    const milliseconds =

        new Date(end).getTime()

        -

        new Date(start).getTime();


    if (
        milliseconds < 0
    ) {

        return '-';

    }


    const totalMinutes =
        Math.floor(
            milliseconds / 60000
        );


    const hours =
        Math.floor(
            totalMinutes / 60
        );


    const minutes =
        totalMinutes % 60;


    if (
        hours === 0
    ) {

        return `${totalMinutes} min`;

    }


    return `${hours} h ${minutes} min`;

}

// ============================================================
// RENDER TRABAJO COMPLETADO DEL EQUIPO
// ============================================================

async function renderCompletedWork(
    execution
) {

    completedWorkTypes.replaceChildren();


    // ========================================================
    // SIN EJECUCIÓN
    // ========================================================

    if (!execution) {

        completedPhotos.replaceChildren();

        completedPhotosEmpty.classList.remove(
            'hidden'
        );


        completedDescription.textContent =
            'No se encontró información de la ejecución.';


        completedWorkPanel.classList.remove(
            'hidden'
        );


        return;

    }



    // ========================================================
    // TIPOS DE TRABAJO
    // ========================================================

    if (
        execution.work_types.length === 0
    ) {

        const empty =
            document.createElement(
                'span'
            );


        empty.className =
            'worker-completed-muted';


        empty.textContent =
            'Sin clasificación registrada';


        completedWorkTypes.append(
            empty
        );

    } else {

        for (
            const workType of
            execution.work_types
        ) {

            const chip =
                document.createElement(
                    'span'
                );


            chip.className =
                'worker-completed-work-chip';


            chip.textContent =
                workType.nombre;


            completedWorkTypes.append(
                chip
            );

        }

    }



    // ========================================================
    // DESCRIPCIÓN
    // ========================================================

    completedDescription.textContent =

        execution.descripcion

        ||

        'Sin descripción escrita.';



    // ========================================================
    // FECHAS
    // ========================================================

    completedStart.textContent =
        formatExecutionDateTime(
            execution.inicio
        );


    completedEnd.textContent =
        formatExecutionDateTime(
            execution.fin
        );


    completedDuration.textContent =
        formatExecutionDuration(
            execution.inicio,
            execution.fin
        );



    // ========================================================
    // AUDIO
    // ========================================================

    completedAudio.replaceChildren();


    if (
        !execution.audio_path
    ) {

        const noAudio =
            document.createElement(
                'span'
            );


        noAudio.className =
            'worker-completed-muted';


        noAudio.textContent =
            'Sin audio registrado';


        completedAudio.append(
            noAudio
        );

    } else {

        const button =
            document.createElement(
                'button'
            );


        button.type =
            'button';


        button.className =
            'worker-completed-audio-button';


        button.textContent =
            '▶ Escuchar informe';



        button.addEventListener(

            'click',

            async () => {

                button.disabled =
                    true;


                button.textContent =
                    'Preparando audio...';


                try {

                    const signedUrl =
                        await createExecutionAudioSignedUrl(
                            execution.audio_path
                        );


                    if (!signedUrl) {

                        throw new Error(
                            'No se pudo obtener el audio.'
                        );

                    }


                    const audio =
                        document.createElement(
                            'audio'
                        );


                    audio.controls =
                        true;


                    audio.preload =
                        'metadata';


                    audio.src =
                        signedUrl;


                    audio.className =
                        'worker-completed-audio-player';


                    button.replaceWith(
                        audio
                    );


                    try {

                        await audio.play();

                    } catch {

                        // En algunos celulares el usuario
                        // deberá pulsar Play manualmente.

                    }


                } catch (error) {

                    console.error(
                        'Error cargando audio:',
                        error
                    );


                    button.disabled =
                        false;


                    button.textContent =
                        'No fue posible cargar el audio';

                }

            }

        );


        completedAudio.append(
            button
        );

    }

    // ========================================================
    // TRANSCRIPCIÓN AUTOMÁTICA
    // ========================================================

    if (
        execution.transcripcion
        &&
        execution.transcripcion.trim()
    ) {

        completedTranscription.textContent =
            execution.transcripcion.trim();


        completedTranscriptionSection.classList.remove(
            'hidden'
        );

    } else {

        completedTranscription.textContent =
            '';


        completedTranscriptionSection.classList.add(
            'hidden'
        );

    }


    await renderCompletedPhotos(
        execution.id
    );


    completedWorkPanel.classList.remove(
        'hidden'
    );

}

// ============================================================
// INICIALIZAR
// ============================================================

async function initialize() {

    const profile =
        await requireRole(

            [
                'trabajador'
            ],

            '../'

        );


    if (!profile) {

        return;

    }


    if (
        !Number.isInteger(taskId)
        ||
        taskId <= 0
    ) {

        window.location.replace(
            './inicio.html'
        );

        return;

    }



    document.getElementById(
        'topbarUserName'
    ).textContent =

        `${profile.nombre ?? ''

            } ${profile.apellido ?? ''

            }`.trim();



    try {

        const [

            task,

            assignment,

            locations,

            shifts,

            maintenanceTypes,

            workTypes

        ] = await Promise.all([

            getTaskMulti(
                taskId
            ),

            getMyTaskAssignment(
                taskId
            ),

            getLocations(),

            getShifts(),

            getMaintenanceTypes(),

            getWorkTypes()

        ]);

        currentTask =
            task;

        currentAssignment =
            assignment;

        availableWorkTypes =
            workTypes;


        renderWorkTypes();

        if (
            currentAssignment.estado ===
            'en_progreso'
        ) {

            const execution =
                await getTaskOpenExecution(
                    taskId
                );


            currentExecutionId =
                execution?.id
                ?? null;


            await refreshWorkPhotos();


            await loadExecutionReports(
                currentExecutionId
            );

        }

        // ============================================================
        // EJECUCIÓN COMPLETADA
        // ============================================================

        if (
            currentAssignment.estado ===
            'completada'
        ) {

            const completedExecution =
                await getTaskCompletedExecution(
                    taskId
                );


            await renderCompletedWork(
                completedExecution
            );


            await loadExecutionReports(
                completedExecution?.id
                ??
                null
            );

        }



        // ====================================================
        // DATOS
        // ====================================================

        document.getElementById(
            'taskNumber'
        ).textContent =
            `Tarea #${task.id}`;


        document.getElementById(
            'taskTitle'
        ).textContent =
            task.titulo;


        document.getElementById(
            'taskDescription'
        ).textContent =

            task.descripcion

            ||

            'Sin descripción.';


        document.getElementById(
            'taskLocation'
        ).textContent =

            catalogName(
                locations,
                task.location_id,
                'Sin lugar'
            );


        document.getElementById(
            'taskShift'
        ).textContent =

            catalogName(
                shifts,
                task.shift_id,
                'Sin turno'
            );


        document.getElementById(
            'taskMaintenance'
        ).textContent =

            catalogName(
                maintenanceTypes,
                task.maintenance_type_id,
                'Sin tipo'
            );


        document.getElementById(
            'taskTicket'
        ).textContent =

            task.ticket_number

            ||

            'Sin ticket';


        document.getElementById(
            'taskPriority'
        ).textContent =

            priorityLabel(
                task.prioridad
            );


        document.getElementById(
            'taskDue'
        ).textContent =

            task.fecha_limite

                ? formatDate(
                    task.fecha_limite
                )

                : 'Sin vencimiento';



        updatePhotoControls();


        updateSaveReportButton();


        renderState();

        renderActionState();


        loading.classList.add(
            'hidden'
        );


        content.classList.remove(
            'hidden'
        );


    } catch (error) {

        console.error(
            'Error cargando tarea:',
            error
        );


        loading.textContent =
            'No fue posible cargar la tarea.';

    }

}


initialize();
