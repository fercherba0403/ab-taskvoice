// ============================================================
// TASKVOICE
// execution-photos.js
//
// Fotografías compartidas de una ejecución.
// Máximo 3 fotos por intervención (validado también en backend).
// ============================================================

import {
    supabase
} from '../core/supabase.js';


const MAX_PHOTO_BYTES =
    10 * 1024 * 1024;

const ALLOWED_PHOTO_TYPES =
    new Set([
        'image/jpeg',
        'image/png',
        'image/webp'
    ]);


// ============================================================
// VALIDAR ARCHIVO
// ============================================================

export function validateExecutionPhotoFile(
    file
) {

    if (!file) {

        throw new Error(
            'No se seleccionó ninguna fotografía.'
        );

    }


    if (
        !ALLOWED_PHOTO_TYPES.has(
            file.type
        )
    ) {

        throw new Error(
            'Formato no permitido. Usá JPG, PNG o WebP.'
        );

    }


    if (
        file.size >
        MAX_PHOTO_BYTES
    ) {

        throw new Error(
            'La fotografía supera el máximo de 10 MB.'
        );

    }

}


// ============================================================
// EXTENSIÓN
// ============================================================

function getPhotoExtension(
    mimeType
) {

    const extensions = {

        'image/jpeg':
            'jpg',

        'image/png':
            'png',

        'image/webp':
            'webp'

    };


    return extensions[mimeType]
        ?? 'jpg';

}


// ============================================================
// NOMBRE ÚNICO
// ============================================================

function createPhotoFileName(
    file
) {

    const extension =
        getPhotoExtension(
            file.type
        );


    const uniquePart =
        globalThis.crypto?.randomUUID

            ? globalThis.crypto.randomUUID()

            : `${Date.now()}-${Math.random()
                .toString(16)
                .slice(2)}`;


    return `${uniquePart}.${extension}`;

}


// ============================================================
// LISTAR FOTOS
// ============================================================

export async function getExecutionPhotos(
    executionId
) {

    const {
        data,
        error
    } =
        await supabase.rpc(

            'get_execution_photos',

            {
                p_execution_id:
                    executionId
            }

        );


    if (error) {

        throw error;

    }


    return data ?? [];

}


// ============================================================
// URL FIRMADA
// ============================================================

export async function createExecutionPhotoSignedUrl(
    storagePath
) {

    if (!storagePath) {

        return null;

    }


    const {
        data,
        error
    } =
        await supabase
            .storage
            .from('fotos')
            .createSignedUrl(
                storagePath,
                3600
            );


    if (error) {

        throw error;

    }


    return (
        data?.signedUrl
        ??
        data?.signedURL
        ??
        null
    );

}


// ============================================================
// SUBIR + REGISTRAR FOTO
// ============================================================

export async function uploadExecutionPhoto(
    task,
    executionId,
    file
) {

    validateExecutionPhotoFile(
        file
    );


    if (
        !task?.organization_id
        ||
        !task?.id
        ||
        !executionId
    ) {

        throw new Error(
            'No se pudo determinar la ejecución de la fotografía.'
        );

    }


    const fileName =
        createPhotoFileName(
            file
        );


    const storagePath =
        `${task.organization_id}`
        +
        `/${task.id}`
        +
        `/${executionId}`
        +
        `/${fileName}`;


    const {
        error: uploadError
    } =
        await supabase
            .storage
            .from('fotos')
            .upload(

                storagePath,

                file,

                {
                    contentType:
                        file.type,

                    cacheControl:
                        '3600',

                    upsert:
                        false
                }

            );


    if (uploadError) {

        throw uploadError;

    }


    try {

        const {
            data,
            error
        } =
            await supabase.rpc(

                'add_execution_photo',

                {
                    p_execution_id:
                        executionId,

                    p_storage_path:
                        storagePath,

                    p_descripcion:
                        null
                }

            );


        if (error) {

            throw error;

        }


        return {
            id:
                data,

            execution_id:
                executionId,

            storage_path:
                storagePath,

            descripcion:
                null
        };


    } catch (error) {

        // Si el backend rechaza el registro (por ejemplo, porque
        // otro técnico cargó simultáneamente la tercera foto),
        // limpiamos el archivo recién subido para no dejar huérfanos.

        try {

            await supabase
                .storage
                .from('fotos')
                .remove([
                    storagePath
                ]);

        } catch {

            // La limpieza secundaria no debe ocultar el error real.

        }


        throw error;

    }

}


// ============================================================
// ELIMINAR FOTO
// ============================================================

export async function removeExecutionPhoto(
    photo
) {

    if (
        !photo?.id
        ||
        !photo?.storage_path
    ) {

        throw new Error(
            'Fotografía inválida.'
        );

    }


    // Primero eliminamos la metadata mediante RPC. Esa RPC valida
    // que la ejecución siga abierta y que el usuario pertenezca
    // al equipo activo.

    const {
        error: rpcError
    } =
        await supabase.rpc(

            'remove_execution_photo',

            {
                p_photo_id:
                    photo.id
            }

        );


    if (rpcError) {

        throw rpcError;

    }


    // Luego limpiamos el archivo privado de Storage.

    const {
        error: storageError
    } =
        await supabase
            .storage
            .from('fotos')
            .remove([
                photo.storage_path
            ]);


    if (storageError) {

        console.warn(
            'La fotografía se quitó del registro, pero no pudo eliminarse el archivo de Storage:',
            storageError
        );

    }

}
