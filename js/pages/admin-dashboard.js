// ============================================================
// TASKVOICE
// admin-dashboard.js
// ============================================================

import {
    logout,
    requireRole
} from '../core/auth.js';


import {
    getDashboardData
} from '../services/dashboard.js';



// ============================================================
// ELEMENTOS
// ============================================================

const organizationName =
    document.getElementById(
        'organizationName'
    );


const welcomeMessage =
    document.getElementById(
        'welcomeMessage'
    );


const sidebarUserName =
    document.getElementById(
        'sidebarUserName'
    );


const sidebarUserRole =
    document.getElementById(
        'sidebarUserRole'
    );


const sidebarAvatar =
    document.getElementById(
        'sidebarAvatar'
    );


const pendingCount =
    document.getElementById(
        'pendingCount'
    );


const progressCount =
    document.getElementById(
        'progressCount'
    );


const completedCount =
    document.getElementById(
        'completedCount'
    );


const overdueCount =
    document.getElementById(
        'overdueCount'
    );


const tasksLoading =
    document.getElementById(
        'tasksLoading'
    );


const tasksEmpty =
    document.getElementById(
        'tasksEmpty'
    );


const tasksTableWrapper =
    document.getElementById(
        'tasksTableWrapper'
    );


const recentTasksBody =
    document.getElementById(
        'recentTasksBody'
    );


const logoutButton =
    document.getElementById(
        'logoutButton'
    );


const menuButton =
    document.getElementById(
        'menuButton'
    );


const sidebarOverlay =
    document.getElementById(
        'sidebarOverlay'
    );


const newTaskButton =
    document.getElementById(
        'newTaskButton'
    );


const viewTasksButton =
    document.getElementById(
        'viewTasksButton'
    );


const toast =
    document.getElementById(
        'toast'
    );



// ============================================================
// TOAST
// ============================================================

let toastTimer = null;


function showToast(
    message
) {

    toast.textContent =
        message;


    toast.classList.add(
        'show'
    );


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    'show'
                );

            },
            2500
        );

}



// ============================================================
// ROL
// ============================================================

function formatRole(
    role
) {

    switch (role) {

        case 'admin':
            return 'Administrador';

        case 'supervisor':
            return 'Supervisor';

        case 'trabajador':
            return 'Trabajador';

        default:
            return role;

    }

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


    const [
        year,
        month,
        day
    ] = parts;


    return `${day}/${month}/${year}`;

}



// ============================================================
// BADGE
// ============================================================

function createBadge(
    text,
    type
) {

    const badge =
        document.createElement(
            'span'
        );


    badge.className =
        `badge ${type}`;


    badge.textContent =
        text;


    return badge;

}



// ============================================================
// ESTADOS
// ============================================================

function getStatusConfig(
    status
) {

    const config = {

        pendiente: {
            label: 'Pendiente',
            className: 'pending'
        },

        aceptada: {
            label: 'Aceptada',
            className: 'accepted'
        },

        en_progreso: {
            label: 'En progreso',
            className: 'progress'
        },

        completada: {
            label: 'Completada',
            className: 'completed'
        },

        cancelada: {
            label: 'Cancelada',
            className: 'cancelled'
        },

        vencida: {
            label: 'Vencida',
            className: 'overdue'
        }

    };


    return config[status] ?? {

        label: status,

        className: 'neutral'

    };

}



// ============================================================
// PRIORIDAD
// ============================================================

function getPriorityConfig(
    priority
) {

    const config = {

        baja: {
            label: 'Baja',
            className: 'low'
        },

        normal: {
            label: 'Normal',
            className: 'normal'
        },

        alta: {
            label: 'Alta',
            className: 'high'
        },

        urgente: {
            label: 'Urgente',
            className: 'urgent'
        }

    };


    return config[priority] ?? {

        label: priority,

        className: 'normal'

    };

}



// ============================================================
// RENDER TAREAS
// ============================================================

function renderRecentTasks(
    tasks
) {

    recentTasksBody.replaceChildren();


    tasksLoading.classList.add(
        'hidden'
    );


    if (
        tasks.length === 0
    ) {

        tasksEmpty.classList.remove(
            'hidden'
        );


        tasksTableWrapper.classList.add(
            'hidden'
        );


        return;

    }


    tasksEmpty.classList.add(
        'hidden'
    );


    tasksTableWrapper.classList.remove(
        'hidden'
    );



    for (
        const task of tasks
    ) {


        const row =
            document.createElement(
                'tr'
            );


        // TAREA

        const taskCell =
            document.createElement(
                'td'
            );


        const taskTitle =
            document.createElement(
                'strong'
            );


        taskTitle.className =
            'task-title';


        taskTitle.textContent =
            task.titulo;


        const taskId =
            document.createElement(
                'small'
            );


        taskId.className =
            'task-id';


        taskId.textContent =
            `#${task.id}`;


        taskCell.append(
            taskTitle,
            taskId
        );


        // USUARIO

        const userCell =
            document.createElement(
                'td'
            );


        userCell.textContent =
            task.assigned_user_name;


        // PRIORIDAD

        const priorityCell =
            document.createElement(
                'td'
            );


        const priority =
            getPriorityConfig(
                task.prioridad
            );


        priorityCell.append(

            createBadge(
                priority.label,
                `priority-${priority.className}`
            )

        );


        // ESTADO

        const statusCell =
            document.createElement(
                'td'
            );


        const status =
            getStatusConfig(
                task.estado
            );


        statusCell.append(

            createBadge(
                status.label,
                `status-${status.className}`
            )

        );


        // FECHA

        const dateCell =
            document.createElement(
                'td'
            );


        dateCell.textContent =
            formatDate(
                task.fecha_limite
            );


        row.append(

            taskCell,

            userCell,

            priorityCell,

            statusCell,

            dateCell

        );


        recentTasksBody.append(
            row
        );

    }

}



// ============================================================
// MOBILE
// ============================================================

function openSidebar() {

    document.body.classList.add(
        'sidebar-open'
    );

}


function closeSidebar() {

    document.body.classList.remove(
        'sidebar-open'
    );

}


menuButton.addEventListener(
    'click',
    openSidebar
);


sidebarOverlay.addEventListener(
    'click',
    closeSidebar
);



// ============================================================
// MÓDULOS PENDIENTES
// ============================================================

document
    .querySelectorAll(
        '[data-coming-soon]'
    )
    .forEach(

        item => {

            item.addEventListener(

                'click',

                event => {

                    event.preventDefault();


                    showToast(
                        `${item.dataset.comingSoon}: módulo pendiente.`
                    );

                }

            );

        }

    );



// ============================================================
// NAVEGACIÓN REAL
// ============================================================

newTaskButton.addEventListener(
    'click',
    () => {

        window.location.href =
            './tarea-nueva.html';

    }
);


viewTasksButton.addEventListener(
    'click',
    () => {

        window.location.href =
            './tareas.html';

    }
);



// ============================================================
// LOGOUT
// ============================================================

logoutButton.addEventListener(

    'click',

    async () => {

        logoutButton.disabled =
            true;


        logoutButton.textContent =
            'Cerrando...';


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
                'admin',
                'supervisor'
            ],

            '../'

        );


    if (!profile) {

        return;

    }


    const fullName =

        `${profile.nombre} ${profile.apellido}`
            .trim();


    sidebarUserName.textContent =
        fullName;


    sidebarUserRole.textContent =
        formatRole(
            profile.rol
        );


    sidebarAvatar.textContent =

        profile.nombre
            ?.charAt(0)
            ?.toUpperCase()

        ?? 'U';


    welcomeMessage.textContent =
        `Hola ${profile.nombre}, este es el resumen de actividad.`;



    try {


        const dashboard =
            await getDashboardData(
                profile.organization_id
            );


        organizationName.textContent =
            dashboard.organizationName;


        pendingCount.textContent =
            dashboard.stats.pending;


        progressCount.textContent =
            dashboard.stats.progress;


        completedCount.textContent =
            dashboard.stats.completed;


        overdueCount.textContent =
            dashboard.stats.overdue;


        renderRecentTasks(
            dashboard.recentTasks
        );


    } catch (error) {


        console.error(
            'Error cargando Dashboard:',
            error
        );


        tasksLoading.textContent =
            'No fue posible cargar la información.';


        showToast(
            'Error al cargar el Dashboard.'
        );

    }

}



initialize();