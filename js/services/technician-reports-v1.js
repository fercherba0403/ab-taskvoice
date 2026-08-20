// ============================================================
// AB TASKVOICE
// technician-reports-v1.js
//
// Servicio exclusivo del reporte personal del Técnico.
// Nunca recibe technician_id.
// ============================================================

import {
    supabase
} from '../core/supabase.js';


function optionalInteger(
    value
) {

    if (
        value === null
        ||
        value === undefined
        ||
        value === ''
    ) {

        return null;

    }


    const number =
        Number(value);


    if (
        !Number.isSafeInteger(
            number
        )
        ||
        number <= 0
    ) {

        return null;

    }


    return number;

}


function optionalText(
    value
) {

    if (
        value === null
        ||
        value === undefined
    ) {

        return null;

    }


    const text =
        String(value)
            .trim();


    return text
        ? text
        : null;

}


export async function getMyOperationalReport(
    filters = {}
) {

    const {
        data,
        error
    } =
        await supabase.rpc(
            'get_my_operational_report',
            {
                p_date_from:
                    optionalText(
                        filters.dateFrom
                    ),

                p_date_to:
                    optionalText(
                        filters.dateTo
                    ),

                p_location_id:
                    optionalInteger(
                        filters.locationId
                    ),

                p_shift_id:
                    optionalInteger(
                        filters.shiftId
                    ),

                p_maintenance_type_id:
                    optionalInteger(
                        filters.maintenanceTypeId
                    ),

                p_work_type_id:
                    optionalInteger(
                        filters.workTypeId
                    ),

                p_task_status:
                    optionalText(
                        filters.taskStatus
                    ),

                p_technician_status:
                    optionalText(
                        filters.technicianStatus
                    ),

                p_ticket:
                    optionalText(
                        filters.ticket
                    )
            }
        );


    if (error) {

        throw error;

    }


    return data ?? [];

}
