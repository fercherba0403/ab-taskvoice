// ============================================================
// TASKVOICE
// supabase.js
//
// Cliente único de Supabase para toda la aplicación.
// ============================================================

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

if (!window.supabase) {
    throw new Error("TaskVoice: no se pudo cargar la librería Supabase.");
}

export const supabase = window.supabase.createClient(
    SUPABASE_URL,

    SUPABASE_PUBLISHABLE_KEY,

    {
        auth: {
            persistSession: true,

            autoRefreshToken: true,

            detectSessionInUrl: true,

            experimental: {
                passkey: true,
            },
        },
    },
);
