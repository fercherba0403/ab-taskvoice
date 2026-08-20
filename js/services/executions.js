// ============================================================
// TASKVOICE
// executions.js
//
// Ejecuciones individuales del técnico.
// ============================================================

import {

    supabase

} from '../core/supabase.js';



// ============================================================
// OBTENER EJECUCIÓN ABIERTA DEL TÉCNICO
// ============================================================

export async function getMyOpenExecution(
    taskId
) {

    const {
        data: {
            user
        },
        error: userError
    } =
        await supabase
            .auth
            .getUser();


    if (
        userError
        ||
        !user
    ) {

        throw new Error(
            'Usuario no autenticado.'
        );

    }


    const {
        data,
        error
    } =
        await supabase

            .from(
                'task_executions'
            )

            .select(`
                id,
                task_id,
                user_id,
                inicio,
                fin,
                descripcion,
                transcripcion,
                audio_path
            `)

            .eq(
                'task_id',
                taskId
            )

            .eq(
                'user_id',
                user.id
            )

            .is(
                'fin',
                null
            )

            .order(
                'id',
                {
                    ascending: false
                }
            )

            .limit(1);


    if (error) {

        throw error;

    }


    return data?.[0]
        ?? null;

}



// ============================================================
// NORMALIZAR MIME
// ============================================================

function normalizeMimeType(
    mimeType
) {

    if (!mimeType) {

        return 'audio/webm';

    }


    return mimeType
        .split(';')[0]
        .trim();

}



// ============================================================
// EXTENSIÓN
// ============================================================

function getAudioExtension(
    mimeType
) {

    const type =
        normalizeMimeType(
            mimeType
        );


    const extensions = {

        'audio/webm':
            'webm',

        'audio/ogg':
            'ogg',

        'audio/mpeg':
            'mp3',

        'audio/mp4':
            'mp4',

        'audio/wav':
            'wav',

        'audio/x-wav':
            'wav'

    };


    return extensions[type]
        ?? 'webm';

}



// ============================================================
// SUBIR AUDIO
//
// Ruta:
//
// organization_id/task_id/execution_id/audio.ext
// ============================================================

export async function uploadExecutionAudio(

    task,

    executionId,

    audioBlob

) {

    if (
        !task?.organization_id
        ||
        !task?.id
    ) {

        throw new Error(
            'No se pudo determinar la organización de la tarea.'
        );

    }


    if (!audioBlob) {

        throw new Error(
            'No existe una grabación para subir.'
        );

    }


    const contentType =
        normalizeMimeType(
            audioBlob.type
        );


    const extension =
        getAudioExtension(
            contentType
        );


    const audioPath =

        `${task.organization_id}`

        +

        `/${task.id}`

        +

        `/${executionId}`

        +

        `/audio.${extension}`;



    const {
        error
    } =
        await supabase

            .storage

            .from(
                'audios'
            )

            .upload(

                audioPath,

                audioBlob,

                {

                    contentType,

                    cacheControl:
                        '3600',

                    upsert:
                        true

                }

            );


    if (error) {

        throw error;

    }


    return audioPath;

}



// ============================================================
// COMPLETAR EJECUCIÓN
// ============================================================

export async function completeExecution(

    executionId,

    {

        descripcion = null,

        transcripcion = null,

        audioPath = null

    } = {}

) {

    const {
        error
    } =
        await supabase.rpc(

            'complete_task',

            {

                p_execution_id:
                    executionId,

                p_descripcion:
                    descripcion || null,

                p_transcripcion:
                    transcripcion || null,

                p_audio_path:
                    audioPath || null

            }

        );


    if (error) {

        throw error;

    }

}

// ============================================================
// OBTENER TIPOS DE TRABAJO
// ============================================================

export async function getWorkTypes() {

    const {
        data,
        error
    } =
        await supabase

            .from(
                'work_types'
            )

            .select(`
                id,
                nombre,
                orden
            `)

            .eq(
                'activo',
                true
            )

            .order(
                'orden',
                {
                    ascending: true
                }
            );


    if (error) {

        throw error;

    }


    return data ?? [];

}



// ============================================================
// COMPLETAR EJECUCIÓN CON TIPOS DE TRABAJO
// ============================================================

export async function completeExecutionWithWorkTypes(

    executionId,

    workTypeIds,

    {

        descripcion = null,

        transcripcion = null,

        audioPath = null

    } = {}

) {

    const {
        error
    } =
        await supabase.rpc(

            'complete_task_with_work_types',

            {

                p_execution_id:
                    executionId,

                p_work_type_ids:
                    workTypeIds,

                p_descripcion:
                    descripcion || null,

                p_transcripcion:
                    transcripcion || null,

                p_audio_path:
                    audioPath || null

            }

        );

    if (error) {

        throw error;

    }

}

// ============================================================
// OBTENER EJECUCIONES DE UNA TAREA - ADMIN
// ============================================================

export async function getTaskExecutionsForAdmin(
    taskId
) {

    // ========================================================
    // EJECUCIONES
    // ========================================================

    const {
        data: executions,
        error: executionsError
    } =
        await supabase

            .from(
                'task_executions'
            )

            .select(`
                id,
                task_id,
                user_id,
                inicio,
                fin,
                descripcion,
                transcripcion,
                audio_path,
                created_at
            `)

            .eq(
                'task_id',
                taskId
            )

            .order(
                'inicio',
                {
                    ascending: true
                }
            );


    if (executionsError) {

        throw executionsError;

    }


    if (
        !executions
        ||
        executions.length === 0
    ) {

        return [];

    }



    const executionIds =
        executions.map(
            execution =>
                execution.id
        );


    const userIds = [

        ...new Set(

            executions.map(
                execution =>
                    execution.user_id
            )

        )

    ];



    // ========================================================
    // TÉCNICOS
    // ========================================================

    const {
        data: profiles,
        error: profilesError
    } =
        await supabase

            .from(
                'profiles'
            )

            .select(`
                id,
                nombre,
                apellido,
                email
            `)

            .in(
                'id',
                userIds
            );


    if (profilesError) {

        throw profilesError;

    }



    // ========================================================
    // RELACIÓN EJECUCIÓN / TIPO DE TRABAJO
    // ========================================================

    const {
        data: relations,
        error: relationsError
    } =
        await supabase

            .from(
                'execution_work_types'
            )

            .select(`
                execution_id,
                work_type_id
            `)

            .in(
                'execution_id',
                executionIds
            );


    if (relationsError) {

        throw relationsError;

    }



    const workTypeIds = [

        ...new Set(

            (relations ?? [])

                .map(
                    relation =>
                        relation.work_type_id
                )

        )

    ];



    let workTypes =
        [];


    if (
        workTypeIds.length > 0
    ) {

        const {
            data,
            error
        } =
            await supabase

                .from(
                    'work_types'
                )

                .select(`
                    id,
                    nombre,
                    orden
                `)

                .in(
                    'id',
                    workTypeIds
                )

                .order(
                    'orden',
                    {
                        ascending: true
                    }
                );


        if (error) {

            throw error;

        }


        workTypes =
            data ?? [];

    }



    // ========================================================
    // MAPS
    // ========================================================

    const profilesMap =
        new Map();


    for (
        const profile of profiles ?? []
    ) {

        profilesMap.set(
            profile.id,
            profile
        );

    }



    const workTypesMap =
        new Map();


    for (
        const workType of workTypes
    ) {

        workTypesMap.set(
            workType.id,
            workType
        );

    }



    const executionWorkTypesMap =
        new Map();


    for (
        const relation of relations ?? []
    ) {

        if (
            !executionWorkTypesMap.has(
                relation.execution_id
            )
        ) {

            executionWorkTypesMap.set(
                relation.execution_id,
                []
            );

        }


        const workType =
            workTypesMap.get(
                relation.work_type_id
            );


        if (workType) {

            executionWorkTypesMap
                .get(
                    relation.execution_id
                )
                .push(
                    workType
                );

        }

    }



    // ========================================================
    // RESULTADO
    // ========================================================

    return executions.map(

        execution => {

            const profile =
                profilesMap.get(
                    execution.user_id
                );


            return {

                ...execution,

                technician_name:

                    profile

                        ? `${

                            profile.nombre ?? ''

                        } ${

                            profile.apellido ?? ''

                        }`.trim()

                        : 'Técnico',


                technician_email:
                    profile?.email ?? '',


                work_types:

                    executionWorkTypesMap.get(
                        execution.id
                    )

                    ?? []

            };

        }

    );

}



// ============================================================
// URL FIRMADA PARA AUDIO PRIVADO
// ============================================================

export async function createExecutionAudioSignedUrl(
    audioPath
) {

    if (!audioPath) {

        return null;

    }


    const {
        data,
        error
    } =
        await supabase

            .storage

            .from(
                'audios'
            )

            .createSignedUrl(
                audioPath,
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
// OBTENER MI EJECUCIÓN COMPLETADA
//
// Devuelve la ejecución del técnico actual para una tarea,
// incluyendo los tipos de trabajo realizados.
// ============================================================

export async function getMyCompletedExecution(
    taskId
) {

    const {
        data: {
            user
        },
        error: userError
    } =
        await supabase
            .auth
            .getUser();


    if (
        userError
        ||
        !user
    ) {

        throw new Error(
            'Usuario no autenticado.'
        );

    }



    // ========================================================
    // EJECUCIÓN
    // ========================================================

    const {
        data: executions,
        error: executionError
    } =
        await supabase

            .from(
                'task_executions'
            )

            .select(`
                id,
                task_id,
                user_id,
                inicio,
                fin,
                descripcion,
                transcripcion,
                audio_path,
                created_at
            `)

            .eq(
                'task_id',
                taskId
            )

            .eq(
                'user_id',
                user.id
            )

            .not(
                'fin',
                'is',
                null
            )

            .order(
                'fin',
                {
                    ascending: false
                }
            )

            .limit(1);


    if (executionError) {

        throw executionError;

    }


    const execution =
        executions?.[0]
        ?? null;


    if (!execution) {

        return null;

    }



    // ========================================================
    // RELACIONES CON TIPOS DE TRABAJO
    // ========================================================

    const {
        data: relations,
        error: relationsError
    } =
        await supabase

            .from(
                'execution_work_types'
            )

            .select(`
                work_type_id
            `)

            .eq(
                'execution_id',
                execution.id
            );


    if (relationsError) {

        throw relationsError;

    }



    const workTypeIds =
        (relations ?? [])
            .map(
                relation =>
                    relation.work_type_id
            );



    let workTypes =
        [];


    if (
        workTypeIds.length > 0
    ) {

        const {
            data,
            error
        } =
            await supabase

                .from(
                    'work_types'
                )

                .select(`
                    id,
                    nombre,
                    orden
                `)

                .in(
                    'id',
                    workTypeIds
                )

                .order(
                    'orden',
                    {
                        ascending: true
                    }
                );


        if (error) {

            throw error;

        }


        workTypes =
            data ?? [];

    }



    return {

        ...execution,

        work_types:
            workTypes

    };

}

// ============================================================
// TRANSCRIBIR EJECUCIÓN
// ============================================================

export async function transcribeExecution(
    executionId
) {

    const {
        data,
        error
    } =
        await supabase
            .functions
            .invoke(

                'transcribe-execution',

                {

                    body: {

                        execution_id:
                            executionId

                    }

                }

            );


    if (error) {

        throw error;

    }


    if (
        data?.error
    ) {

        throw new Error(
            data.error
        );

    }


    return (

        data?.transcription

        ??

        null

    );

}