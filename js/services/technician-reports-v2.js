// ============================================================
// AB TASKVOICE
// technician-reports-v2.js
//
// Reporte operativo de equipo visible para Técnicos.
// Todas las RPC limitan los datos a la empresa del usuario.
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


function optionalUuid(
    value
) {

    const text =
        optionalText(
            value
        );


    return text;
}


export async function getTechnicianReportTeammates() {

    const {
        data,
        error
    } =
        await supabase.rpc(
            'get_technician_report_teammates'
        );


    if (error) {

        throw error;

    }


    return data ?? [];

}


export async function getTechnicianTeamOperationalReport(
    filters = {}
) {

    const {
        data,
        error
    } =
        await supabase.rpc(
            'get_technician_team_operational_report',
            {
                p_date_from:
                    optionalText(
                        filters.dateFrom
                    ),

                p_date_to:
                    optionalText(
                        filters.dateTo
                    ),

                p_technician_id:
                    optionalUuid(
                        filters.technicianId
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
