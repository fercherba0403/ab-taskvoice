// ============================================================
// TASKVOICE
// worker-home.js
//
// Panel principal del técnico.
//
// Muestra únicamente las tareas asignadas al usuario
// mediante task_assignees.
// ============================================================

import {
    logout,
    requireRole
} from '../core/auth.js';

import {
    getMyWorkerTasks
} from '../services/tasks.js';

// ============================================================
// ELEMENTOS
// ============================================================

const tasksList =
    document.getElementById(
        'tasksList'
    );

const loading =
    document.getElementById(
        'loading'
    );

const emptyState =
    document.getElementById(
        'emptyState'
    );

const taskCount =
    document.getElementById(
        'taskCount'
    );

const openCount =
    document.getElementById(
        'openCount'
    );

const progressCount =
    document.getElementById(
        'progressCount'
    );

const completedCount =
    document.getElementById(
        'completedCount'
    );

const filterButtons = [

    ...document.querySelectorAll(
        '.worker-filter-button'
    )
];

// ============================================================
// ESTADO
// ============================================================

let allTasks = [];
let currentFilter = 'todas';

// ============================================================
// LABEL ESTADO
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

        cancelada:
            'Cancelada',

        rechazada:
            'Rechazada'

    };

    return labels[state]
        ?? state;

}

// ============================================================
// CLASE ESTADO
// ============================================================

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

        cancelada:
            'cancelled',

        rechazada:
            'rejected',



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

    const labels = {

        baja:
            'Baja',

        normal:
            'Normal',

        alta:
            'Alta',

        urgente:
            'Urgente'

    };


    return labels[priority]
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


    const parts =
        value.split('-');


    if (
        parts.length !== 3
    ) {

        return value;

    }


    return (
        `${parts[2]}/`

        +

        `${parts[1]}/`

        +

        `${parts[0]}`
    );

}



// ============================================================
// FECHA LOCAL YYYY-MM-DD
// ============================================================

function getLocalDateString() {

    const date =
        new Date();


    const year =
        date.getFullYear();


    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            '0'
        );


    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            '0'
        );


    return (
        `${year}-${month}-${day}`
    );

}



// ============================================================
// ¿VENCIDA?
// ============================================================

function isOverdue(
    task
) {

    if (
        !task.fecha_limite
    ) {

        return false;

    }


    if (
        task.assignment_state ===
        'completada'

        ||

        task.assignment_state ===
        'cancelada'
    ) {

        return false;

    }


    return (
        task.fecha_limite
        <
        getLocalDateString()
    );

}



// ============================================================
// CREAR META ITEM
// ============================================================

function createMetaItem(
    label,
    value
) {

    const container =
        document.createElement(
            'div'
        );


    container.className =
        'worker-meta-item';



    const labelElement =
        document.createElement(
            'span'
        );


    labelElement.className =
        'worker-meta-label';


    labelElement.textContent =
        label;



    const valueElement =
        document.createElement(
            'span'
        );


    valueElement.className =
        'worker-meta-value';


    valueElement.textContent =
        value || '-';



    container.append(
        labelElement,
        valueElement
    );


    return container;

}



// ============================================================
// CREAR CARD
// ============================================================

function createTaskCard(
    task
) {

    const card =
        document.createElement(
            'article'
        );


    card.className =
        'worker-task-card';



    // ========================================================
    // HEADER
    // ========================================================

    const header =
        document.createElement(
            'div'
        );


    header.className =
        'worker-task-card-header';



    const type =
        document.createElement(
            'span'
        );


    type.className =
        'worker-maintenance-type';


    type.textContent =
        task.maintenance_type_name;



    const state =
        document.createElement(
            'span'
        );


    state.className =

        'worker-state '

        +

        `worker-state-${stateClass(
            task.assignment_state
        )

        }`;


    state.textContent =
        stateLabel(
            task.assignment_state
        );



    header.append(
        type,
        state
    );



    // ========================================================
    // TÍTULO
    // ========================================================

    const title =
        document.createElement(
            'h3'
        );


    title.className =
        'worker-task-title';


    title.textContent =
        task.titulo;



    // ========================================================
    // DESCRIPCIÓN
    // ========================================================

    const description =
        document.createElement(
            'p'
        );


    description.className =
        'worker-task-description';


    description.textContent =

        task.descripcion

        ||

        'Sin descripción.';



    // ========================================================
    // DATOS
    // ========================================================

    const meta =
        document.createElement(
            'div'
        );


    meta.className =
        'worker-task-meta';



    meta.append(

        createMetaItem(
            'Lugar',
            task.location_name
        ),


        createMetaItem(
            'Turno',
            task.shift_name
        ),


        createMetaItem(
            'N° Ticket',
            task.ticket_number
            || 'Sin ticket'
        ),


        createMetaItem(
            'Prioridad',
            priorityLabel(
                task.prioridad
            )
        )

    );



    // ========================================================
    // FOOTER
    // ========================================================

    const footer =
        document.createElement(
            'div'
        );


    footer.className =
        'worker-task-footer';



    const id =
        document.createElement(
            'span'
        );


    id.className =
        'worker-task-id';


    id.textContent =
        `Tarea #${task.id}`;



    const due =
        document.createElement(
            'span'
        );


    due.className =
        'worker-due';


    if (
        isOverdue(task)
    ) {

        due.classList.add(
            'overdue'
        );


        due.textContent =

            `Vencida · ${formatDate(
                task.fecha_limite
            )

            }`;

    } else {

        due.textContent =

            task.fecha_limite

                ? `Vence ${formatDate(
                    task.fecha_limite
                )

                }`

                : 'Sin vencimiento';

    }

    const viewLink =
        document.createElement(
            'a'
        );


    viewLink.className =
        'worker-task-open';


    viewLink.href =
        `./tarea-detalle.html?id=${task.id}`;


    viewLink.textContent =
        'Ver tarea';



    footer.append(
        id,
        due,
        viewLink
    );



    // ========================================================
    // CARD COMPLETA
    // ========================================================

    card.append(

        header,

        title,

        description,

        meta,

        footer

    );


    return card;

}



// ============================================================
// FILTRAR
// ============================================================

function getFilteredTasks() {

    if (
        currentFilter ===
        'todas'
    ) {

        return allTasks;

    }



    // --------------------------------------------------------
    // POR INICIAR:
    // pendiente + aceptada
    // --------------------------------------------------------

    if (
        currentFilter ===
        'inicio'
    ) {

        return allTasks.filter(

            task =>

                task.assignment_state ===
                'pendiente'

                ||

                task.assignment_state ===
                'aceptada'

        );

    }



    return allTasks.filter(

        task =>
            task.assignment_state ===
            currentFilter

    );

}



// ============================================================
// ESTADÍSTICAS
// ============================================================

function renderStats() {

    const open =
        allTasks.filter(

            task =>

                task.assignment_state ===
                'pendiente'

                ||

                task.assignment_state ===
                'aceptada'

        ).length;



    const progress =
        allTasks.filter(

            task =>
                task.assignment_state ===
                'en_progreso'

        ).length;



    const completed =
        allTasks.filter(

            task =>
                task.assignment_state ===
                'completada'

        ).length;



    openCount.textContent =
        String(open);


    progressCount.textContent =
        String(progress);


    completedCount.textContent =
        String(completed);

}



// ============================================================
// RENDER TAREAS
// ============================================================

function renderTasks() {

    const tasks =
        getFilteredTasks();


    tasksList.replaceChildren();


    loading.classList.add(
        'hidden'
    );


    taskCount.textContent =

        `${tasks.length} tarea${tasks.length === 1
            ? ''
            : 's'

        }`;



    if (
        tasks.length === 0
    ) {

        tasksList.classList.add(
            'hidden'
        );


        emptyState.classList.remove(
            'hidden'
        );


        return;

    }



    emptyState.classList.add(
        'hidden'
    );


    tasksList.classList.remove(
        'hidden'
    );



    for (
        const task of tasks
    ) {

        tasksList.append(
            createTaskCard(
                task
            )
        );

    }

}



// ============================================================
// CARGAR TAREAS
// ============================================================

async function loadTasks() {

    loading.classList.remove(
        'hidden'
    );


    emptyState.classList.add(
        'hidden'
    );


    tasksList.classList.add(
        'hidden'
    );


    loading.textContent =
        'Cargando tus tareas...';


    try {

        allTasks =
            await getMyWorkerTasks();


        renderStats();


        renderTasks();


    } catch (error) {

        console.error(
            'Error cargando tareas del técnico:',
            error
        );


        loading.textContent =
            'No fue posible cargar tus tareas.';

    }

}



// ============================================================
// FILTROS
// ============================================================

for (
    const button of filterButtons
) {

    button.addEventListener(

        'click',

        () => {

            currentFilter =
                button.dataset.filter;


            for (
                const item of
                filterButtons
            ) {

                item.classList.remove(
                    'active'
                );

            }


            button.classList.add(
                'active'
            );


            renderTasks();

        }

    );

}



// ============================================================
// LOGOUT
// ============================================================

document
    .getElementById(
        'logoutButton'
    )
    .addEventListener(

        'click',

        async () => {

            try {

                await logout();

            } finally {

                window.location.replace(
                    '../index.html'
                );

            }

        }

    );



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



    // ========================================================
    // NOMBRE
    // ========================================================

    const fullName =

        `${profile.nombre ?? ''} ${profile.apellido ?? ''

            }`.trim();



    document.getElementById(
        'userName'
    ).textContent =

        profile.nombre
        ||
        fullName
        ||
        'Técnico';



    document.getElementById(
        'topbarUserName'
    ).textContent =

        fullName
        ||
        'Técnico';



    // ========================================================
    // TAREAS
    // ========================================================

    await loadTasks();

}


initialize();