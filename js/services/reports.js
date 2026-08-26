// ============================================================
// TASKVOICE
// reports.js
//
// Servicios de reportes operativos.
// ============================================================

import { supabase } from "../core/supabase.js";

// ============================================================
// ID NUMÉRICO OPCIONAL
// ============================================================

function optionalNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const number = Number(value);

    if (!Number.isSafeInteger(number) || number <= 0) {
        return null;
    }

    return number;
}

// ============================================================
// TEXTO OPCIONAL
// ============================================================

function optionalText(value) {
    if (value === null || value === undefined) {
        return null;
    }

    const text = String(value).trim();

    return text || null;
}

// ============================================================
// REPORTE OPERATIVO
// ============================================================

export async function getOperationalReport(filters = {}) {
    const { data, error } = await supabase.rpc(
        "get_operational_report",

        {
            p_date_from: filters.dateFrom || null,

            p_date_to: filters.dateTo || null,

            p_technician_id: optionalText(filters.technicianId),

            p_location_id: optionalNumber(filters.locationId),

            p_shift_id: optionalNumber(filters.shiftId),

            p_maintenance_type_id: optionalNumber(filters.maintenanceTypeId),

            p_work_type_id: optionalNumber(filters.workTypeId),

            p_task_status: optionalText(filters.taskStatus),

            p_technician_status: optionalText(filters.technicianStatus),

            p_ticket: optionalText(filters.ticket),
        },
    );

    if (error) {
        throw error;
    }

    return data ?? [];
}
