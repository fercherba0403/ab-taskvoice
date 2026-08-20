// ============================================================
// TASKVOICE
// worker-self-task.js
//
// Servicio exclusivo para autocreación de tareas por técnico.
// El backend decide obligatoriamente el usuario asignado
// mediante auth.uid().
// ============================================================

import {
    supabase
} from '../core/supabase.js';



// ============================================================
// CREAR MI PROPIA TAREA
// ============================================================

export async function createMyTask(
    task
) {

    const {
        data,
        error
    } = await supabase.rpc(
        'create_my_task',
        {
            p_titulo:
                task.titulo,

            p_descripcion:
                task.descripcion
                ?? null,

            p_prioridad:
                task.prioridad
                ?? 'normal',

            p_fecha_limite:
                task.fecha_limite
                ?? null,

            p_hora_limite:
                task.hora_limite
                ?? null,

            p_template_id:
                task.template_id
                ?? null,

            p_location_id:
                task.location_id
                ?? null,

            p_shift_id:
                task.shift_id
                ?? null,

            p_ticket_number:
                task.ticket_number
                ?? null,

            p_maintenance_type_id:
                task.maintenance_type_id
                ?? null
        }
    );


    if (error) {

        throw error;

    }


    const taskId =
        Number(data);


    if (
        !Number.isSafeInteger(
            taskId
        )
        ||
        taskId <= 0
    ) {

        throw new Error(
            'TASKVOICE: la tarea fue creada, pero no se recibió un identificador válido.'
        );

    }


    return taskId;

}
