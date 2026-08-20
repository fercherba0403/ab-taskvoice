// ============================================================
// TASKVOICE
// admin-task-form.js
//
// Creación de tareas con:
//
// - Lugar
// - Turno
// - Ticket
// - Tipo de mantenimiento
// - Múltiples técnicos
// ============================================================

import {
    initAdminLayout
} from '../components/admin-layout-v3.js';


import {
    createTaskMulti,
    getLocations,
    getMaintenanceTypes,
    getShifts,
    getTechnicians
} from '../services/tasks.js';



// ============================================================
// ELEMENTOS
// ============================================================

const form =
    document.getElementById(
        'taskForm'
    );


const saveButton =
    document.getElementById(
        'saveButton'
    );


const message =
    document.getElementById(
        'formMessage'
    );


const techniciansList =
    document.getElementById(
        'techniciansList'
    );


const techniciansSummary =
    document.getElementById(
        'techniciansSummary'
    );


const locationSelect =
    document.getElementById(
        'lugar'
    );


const shiftSelect =
    document.getElementById(
        'turno'
    );


const maintenanceTypeSelect =
    document.getElementById(
        'maintenanceType'
    );



// ============================================================
// MENSAJES
// ============================================================

function clearMessage() {

    message.textContent =
        '';


    message.className =
        'form-message';

}



function showError(
    text
) {

    message.textContent =
        text;


    message.className =
        'form-message error';

}



// ============================================================
// ID BIGINT OPCIONAL
// ============================================================

function optionalId(
    value
) {

    if (!value) {

        return null;

    }


    const id =
        Number(value);


    if (
        !Number.isSafeInteger(id)
        ||
        id <= 0
    ) {

        return null;

    }


    return id;

}



// ============================================================
// CARGAR SELECT
// ============================================================

function populateSelect(
    select,
    items
) {

    for (
        const item of items
    ) {

        const option =
            document.createElement(
                'option'
            );


        option.value =
            String(item.id);


        option.textContent =
            item.nombre;


        select.append(
            option
        );

    }

}



// ============================================================
// TÉCNICOS SELECCIONADOS
// ============================================================

function getSelectedTechnicians() {

    return [

        ...techniciansList
            .querySelectorAll(
                'input[name="technicians"]:checked'
            )

    ].map(
        input =>
            input.value
    );

}



// ============================================================
// RESUMEN TÉCNICOS
// ============================================================

function updateTechniciansSummary() {

    const selected =
        getSelectedTechnicians();


    if (
        selected.length === 0
    ) {

        techniciansSummary.textContent =
            'Ningún técnico seleccionado';

        techniciansSummary.classList.remove(
            'has-selection'
        );

        return;

    }


    techniciansSummary.textContent =

        selected.length === 1

            ? '1 técnico seleccionado'

            : `${selected.length} técnicos seleccionados`;


    techniciansSummary.classList.add(
        'has-selection'
    );

}



// ============================================================
// RENDER TÉCNICOS
// ============================================================

function renderTechnicians(
    technicians
) {

    techniciansList.replaceChildren();


    if (
        technicians.length === 0
    ) {

        const empty =
            document.createElement(
                'div'
            );


        empty.className =
            'technicians-empty';


        empty.textContent =
            'No hay técnicos activos disponibles.';


        techniciansList.append(
            empty
        );


        return;

    }


    for (
        const technician of technicians
    ) {


        const label =
            document.createElement(
                'label'
            );


        label.className =
            'technician-option';



        const checkbox =
            document.createElement(
                'input'
            );


        checkbox.type =
            'checkbox';


        checkbox.name =
            'technicians';


        checkbox.value =
            technician.id;



        const content =
            document.createElement(
                'span'
            );


        content.className =
            'technician-data';



        const name =
            document.createElement(
                'strong'
            );


        name.textContent =

            `${technician.nombre} ${technician.apellido}`
                .trim();



        const email =
            document.createElement(
                'small'
            );


        email.textContent =
            technician.email ?? '';



        content.append(
            name,
            email
        );


        label.append(
            checkbox,
            content
        );


        techniciansList.append(
            label
        );


        checkbox.addEventListener(
            'change',
            updateTechniciansSummary
        );

    }


    updateTechniciansSummary();

}



// ============================================================
// CARGAR DATOS
// ============================================================

async function loadFormData() {

    const [

        technicians,

        locations,

        shifts,

        maintenanceTypes

    ] = await Promise.all([

        getTechnicians(),

        getLocations(),

        getShifts(),

        getMaintenanceTypes()

    ]);


    renderTechnicians(
        technicians
    );


    populateSelect(
        locationSelect,
        locations
    );


    populateSelect(
        shiftSelect,
        shifts
    );


    populateSelect(
        maintenanceTypeSelect,
        maintenanceTypes
    );

}



// ============================================================
// CREAR TAREA
// ============================================================

form.addEventListener(

    'submit',

    async event => {

        event.preventDefault();


        clearMessage();


        if (
            !form.reportValidity()
        ) {

            return;

        }


        const selectedTechnicians =
            getSelectedTechnicians();


        if (
            selectedTechnicians.length === 0
        ) {

            showError(
                'Seleccioná al menos un técnico.'
            );


            techniciansList.scrollIntoView({

                behavior:
                    'smooth',

                block:
                    'center'

            });


            return;

        }


        const title =
            document
                .getElementById(
                    'titulo'
                )
                .value
                .trim();


        if (!title) {

            showError(
                'El título es obligatorio.'
            );

            return;

        }


        saveButton.disabled =
            true;


        saveButton.textContent =
            'Creando...';


        try {


            await createTaskMulti({

                titulo:
                    title,

                descripcion:
                    document
                        .getElementById(
                            'descripcion'
                        )
                        .value
                        .trim(),

                asignados:
                    selectedTechnicians,

                prioridad:
                    document
                        .getElementById(
                            'prioridad'
                        )
                        .value,

                fecha_limite:
                    document
                        .getElementById(
                            'fechaLimite'
                        )
                        .value || null,

                hora_limite:
                    document
                        .getElementById(
                            'horaLimite'
                        )
                        .value || null,

                template_id:
                    null,

                location_id:
                    optionalId(
                        locationSelect.value
                    ),

                shift_id:
                    optionalId(
                        shiftSelect.value
                    ),

                ticket_number:
                    document
                        .getElementById(
                            'ticketNumber'
                        )
                        .value
                        .trim() || null,

                maintenance_type_id:
                    optionalId(
                        maintenanceTypeSelect.value
                    )

            });


            // ------------------------------------------------
            // Volver al listado, igual que antes.
            // ------------------------------------------------

            window.location.href =
                './tareas.html?created=1';


        } catch (error) {


            console.error(
                'Error creando tarea:',
                error
            );


            showError(
                error.message
                ??
                'No fue posible crear la tarea.'
            );


            saveButton.disabled =
                false;


            saveButton.textContent =
                'Crear tarea';

        }

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
                'Nueva tarea',

            subtitle:
                'Creación y asignación de tareas'

        });


    if (!profile) {

        return;

    }


    try {

        await loadFormData();

    } catch (error) {


        console.error(
            'Error cargando Nueva tarea:',
            error
        );


        showError(
            'No fue posible cargar los datos del formulario.'
        );


        saveButton.disabled =
            true;

    }

}


initialize();