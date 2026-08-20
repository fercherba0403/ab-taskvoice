// ============================================================
// TASKVOICE
// admin-tasks.js
//
// Listado administrativo compatible con:
// - múltiples técnicos
// - lugares
// - ticket
// ============================================================

import {

    initAdminLayout

} from '../components/admin-layout-v2.js';

import {
    getLocations,
    getTasks,

    getTechnicians
} from '../services/tasks.js';



// ============================================================
// ELEMENTOS
// ============================================================

const body =
    document.getElementById(
        'tasksBody'
    );


const loading =
    document.getElementById(
        'loading'
    );


const emptyState =
    document.getElementById(
        'emptyState'
    );


const tableWrapper =
    document.getElementById(
        'tableWrapper'
    );


const taskCount =
    document.getElementById(
        'taskCount'
    );


const searchInput =
    document.getElementById(
        'searchInput'
    );


const statusFilter =
    document.getElementById(
        'statusFilter'
    );


const priorityFilter =
    document.getElementById(
        'priorityFilter'
    );

const userFilter =
    document.getElementById(
        'userFilter'
    );


const pageMessage =
    document.getElementById(
        'pageMessage'
    );

const locationFilter =
    document.getElementById(
        'locationFilter'
    );



// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(
    value
) {

    const div =
        document.createElement(
            'div'
        );


    div.textContent =
        value ?? '';


    return div.innerHTML;

}



// ============================================================
// FECHA
// ============================================================

function formatDate(
    value
) {

    if (!value) {

        return '-';

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
// ESTADO
// ============================================================

function labelStatus(
    status
) {

    const map = {

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

        vencida:
            'Vencida'

    };


    return map[status]
        ?? status;

}



function statusClass(
    status
) {

    const map = {

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

        vencida:
            'overdue'

    };


    return map[status]
        ?? 'neutral';

}



// ============================================================
// PRIORIDAD
// ============================================================

function labelPriority(
    priority
) {

    const map = {

        baja:
            'Baja',

        normal:
            'Normal',

        alta:
            'Alta',

        urgente:
            'Urgente'

    };


    return map[priority]
        ?? priority;

}



// ============================================================
// MOSTRAR TÉCNICOS
// ============================================================

function formatTechnicians(
    technicians
) {

    if (
        !Array.isArray(technicians)
        ||
        technicians.length === 0
    ) {

        return 'Sin técnicos';

    }


    const names =
        technicians.map(
            technician =>
                technician.nombre
        );


    if (
        names.length === 1
    ) {

        return names[0];

    }


    if (
        names.length === 2
    ) {

        return `${names[0]} · ${names[1]}`;

    }


    return (

        `${names[0]} · ${names[1]}`

        +

        ` +${names.length - 2}`

    );

}



// ============================================================
// MENSAJES DE REDIRECCIÓN
// ============================================================

function showPageMessage() {

    if (!pageMessage) {

        return;

    }


    const params =
        new URLSearchParams(
            window.location.search
        );


    let text = '';


    if (
        params.get('created') === '1'
    ) {

        text =
            'Tarea creada correctamente.';

    }


    if (
        params.get('updated') === '1'
    ) {

        text =
            'Cambios guardados correctamente.';

    }


    if (
        params.get('cancelled') === '1'
    ) {

        text =
            'Tarea cancelada correctamente.';

    }


    if (!text) {

        return;

    }


    pageMessage.textContent =
        text;


    pageMessage.classList.remove(
        'hidden'
    );


    window.history.replaceState(
        {},
        '',
        './tareas.html'
    );


    setTimeout(
        () => {

            pageMessage.classList.add(
                'hidden'
            );

        },
        4000
    );

}



// ============================================================
// RENDER
// ============================================================

function renderTasks(
    tasks
) {

    body.replaceChildren();


    loading.classList.add(
        'hidden'
    );


    taskCount.textContent =

        `${tasks.length} tarea${tasks.length === 1 ? '' : 's'}`;


    if (
        tasks.length === 0
    ) {

        emptyState.classList.remove(
            'hidden'
        );


        tableWrapper.classList.add(
            'hidden'
        );


        return;

    }


    emptyState.classList.add(
        'hidden'
    );


    tableWrapper.classList.remove(
        'hidden'
    );



    for (
        const task of tasks
    ) {


        const row =
            document.createElement(
                'tr'
            );


        const technicians =
            formatTechnicians(
                task.assigned_users
            );


        const ticket =
            task.ticket_number
            || '-';


        row.innerHTML = `

            <td>
                #${task.id}
            </td>


            <td>

                <strong>
                    ${escapeHtml(task.titulo)}
                </strong>

            </td>


            <td>
                ${escapeHtml(
            task.location_name
        )}
            </td>


            <td class="task-technicians">

                ${escapeHtml(
            technicians
        )}

            </td>


            <td>

                <span
                    class="
                        badge
                        priority-${task.prioridad}
                    "
                >

                    ${labelPriority(
            task.prioridad
        )}

                </span>

            </td>


            <td>

                <span
                    class="
                        badge
                        status-${statusClass(
            task.estado
        )}
                    "
                >

                    ${labelStatus(
            task.estado
        )}

                </span>

            </td>


            <td class="task-ticket">

                ${escapeHtml(
            ticket
        )}

            </td>


            <td>

                ${formatDate(
            task.fecha_limite
        )}

            </td>


            <td>

                <a
                    class="detail-link"
                    href="./tarea-detalle.html?id=${task.id}"
                >
                    Ver
                </a>

            </td>

        `;


        body.append(
            row
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


    loading.textContent =
        'Cargando tareas...';


    try {


        const tasks =
            await getTasks({

                search:
                    searchInput.value,

                status:
                    statusFilter.value,

                priority:
                    priorityFilter.value,

                locationId:
                    locationFilter.value,

                userId:
                    userFilter.value

            });


        renderTasks(
            tasks
        );


    } catch (error) {


        console.error(
            'Error cargando tareas:',
            error
        );


        loading.textContent =
            'Error al cargar tareas.';

    }

}



// ============================================================
// TÉCNICOS PARA EL FILTRO
// ============================================================

async function loadUsers() {

    const users =
        await getTechnicians();


    for (
        const user of users
    ) {


        const option =
            document.createElement(
                'option'
            );


        option.value =
            user.id;


        option.textContent =

            `${user.nombre} ${user.apellido}`
                .trim();


        userFilter.append(
            option
        );

    }

}

// ============================================================
// LUGARES PARA EL FILTRO
// ============================================================

async function loadLocations() {

    const locations =
        await getLocations();


    for (
        const location of locations
    ) {

        const option =
            document.createElement(
                'option'
            );


        option.value =
            String(
                location.id
            );


        option.textContent =
            location.nombre;


        locationFilter.append(
            option
        );

    }

}



// ============================================================
// FILTROS
// ============================================================

let searchTimer = null;


searchInput.addEventListener(

    'input',

    () => {

        clearTimeout(
            searchTimer
        );


        searchTimer =
            setTimeout(
                loadTasks,
                350
            );

    }

);


statusFilter.addEventListener(
    'change',
    loadTasks
);


priorityFilter.addEventListener(
    'change',
    loadTasks
);


userFilter.addEventListener(
    'change',
    loadTasks
);

locationFilter.addEventListener(
    'change',
    loadTasks
);



document
    .getElementById(
        'clearFiltersButton'
    )
    .addEventListener(

        'click',

        () => {

            searchInput.value =
                '';

            statusFilter.value =
                'todos';


            priorityFilter.value =
                'todas';

            locationFilter.value =
                'todos';

            userFilter.value =
                'todos';

            loadTasks();

        }

    );


// ============================================================
// INICIALIZAR
// ============================================================

async function initialize() {

    const profile =
        await initAdminLayout({

            activePage:
                'tareas',

            title:
                'Tareas',

            subtitle:
                'Gestión y seguimiento de tareas'

        });

    if (!profile) {

        return;

    }

    showPageMessage();

    try {

        await Promise.all([

            loadUsers(),

            loadLocations()

        ]);

        await loadTasks();

    } catch (error) {

        console.error(
            'Error inicializando Tareas:',
            error
        );


        loading.textContent =
            'No fue posible inicializar el módulo.';

    }

}


initialize();