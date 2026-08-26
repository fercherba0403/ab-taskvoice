// ============================================================
// TASKVOICE
// users.js
// ============================================================

import { supabase } from "../core/supabase.js";

async function getFunctionErrorMessage(error, fallback) {
    try {
        const response = error?.context;

        if (response?.clone) {
            const cloned = response.clone();

            const contentType = cloned.headers?.get("content-type") ?? "";

            if (contentType.includes("application/json")) {
                const body = await cloned.json();

                if (body?.error) {
                    return String(body.error);
                }
            } else {
                const text = await cloned.text();

                if (text?.trim()) {
                    try {
                        const body = JSON.parse(text);

                        if (body?.error) {
                            return String(body.error);
                        }
                    } catch {
                        return text.trim();
                    }
                }
            }
        }
    } catch (parseError) {
        console.warn(
            "No fue posible interpretar el error de Edge Function:",
            parseError,
        );
    }

    return error?.message || fallback;
}

async function invokeFunction(functionName, body, fallback) {
    const { data, error } = await supabase.functions.invoke(functionName, {
        body,
    });

    if (error) {
        throw new Error(await getFunctionErrorMessage(error, fallback));
    }

    if (data?.error) {
        throw new Error(String(data.error));
    }

    return data;
}

export async function getUsers() {
    const data = await invokeFunction(
        "manage-user",
        {
            action: "list",
        },
        "No fue posible obtener los usuarios.",
    );

    return data?.users ?? [];
}

export async function getUser(userId) {
    const data = await invokeFunction(
        "manage-user",
        {
            action: "get",

            user_id: userId,
        },
        "No fue posible obtener el usuario.",
    );

    return data?.user ?? null;
}

export async function createUser({
    nombre,
    apellido,
    email,
    telefono = "",
    rol,
    password,
}) {
    const data = await invokeFunction(
        "create-user",
        {
            nombre,
            apellido,
            email,
            telefono,
            rol,
            password,
        },
        "No fue posible crear el usuario.",
    );

    return data?.user ?? null;
}

export async function updateUser(
    userId,
    { nombre, apellido, email, telefono = "", rol },
) {
    const data = await invokeFunction(
        "manage-user",
        {
            action: "update",

            user_id: userId,

            nombre,
            apellido,
            email,
            telefono,
            rol,
        },
        "No fue posible actualizar el usuario.",
    );

    return data?.user ?? null;
}

export async function deactivateUser(userId) {
    const data = await invokeFunction(
        "manage-user",
        {
            action: "deactivate",

            user_id: userId,
        },
        "No fue posible desactivar el usuario.",
    );

    return data?.user ?? null;
}

export async function reactivateUser(userId) {
    const data = await invokeFunction(
        "manage-user",
        {
            action: "reactivate",

            user_id: userId,
        },
        "No fue posible reactivar el usuario.",
    );

    return data?.user ?? null;
}

export async function resetUserPassword(userId, password) {
    await invokeFunction(
        "manage-user",
        {
            action: "reset-password",

            user_id: userId,

            password,
        },
        "No fue posible actualizar la contraseña.",
    );
}
