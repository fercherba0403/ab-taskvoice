// ============================================================
// TASKVOICE
// admin-execution-photos.js
//
// Lectura de fotografías privadas de una ejecución para
// administradores/supervisores y técnicos con acceso.
// ============================================================

import { supabase } from "../core/supabase.js";

// ============================================================
// LISTAR FOTOS DE LA EJECUCIÓN
// ============================================================

export async function getExecutionPhotosForAdmin(executionId) {
    const { data, error } = await supabase.rpc(
        "get_execution_photos",

        {
            p_execution_id: executionId,
        },
    );

    if (error) {
        throw error;
    }

    return data ?? [];
}

// ============================================================
// CREAR URL FIRMADA
// ============================================================

export async function createExecutionPhotoSignedUrlForAdmin(storagePath) {
    if (!storagePath) {
        return null;
    }

    const { data, error } = await supabase.storage
        .from("fotos")
        .createSignedUrl(storagePath, 3600);

    if (error) {
        throw error;
    }

    return data?.signedUrl ?? data?.signedURL ?? null;
}
