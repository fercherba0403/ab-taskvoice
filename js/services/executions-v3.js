// ============================================================
// TASKVOICE
// executions-v2.js
//
// Ejecuciones compartidas por tarea.
// Compatible con el flujo grupal implementado en 13_team_task_flow.sql.
// ============================================================

import {

    supabase

} from '../core/supabase.js';



// ============================================================
// OBTENER EJECUCIÓN ABIERTA COMPARTIDA DE LA TAREA
// ============================================================

export async function getTaskOpenExecution(
    taskId
) {

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
// ALIAS DE COMPATIBILIDAD
//
// Se conserva el nombre anterior para no romper otros módulos
// que todavía puedan importarlo.
// ============================================================

export const getMyOpenExecution =
    getTaskOpenExecution;



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
// SUBIR AUDIO DE REPORTE PARCIAL
//
// Ruta obligatoria validada por add_execution_report():
// organization_id/task_id/execution_id/reports/archivo.ext
// ============================================================

export async function uploadExecutionReportAudio(

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


    if (
        !Number.isSafeInteger(
            Number(executionId)
        )
        ||
        Number(executionId) <= 0
    ) {

        throw new Error(
            'No se encontró una ejecución válida para el reporte.'
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


    const uniqueId =
        globalThis.crypto
            ?.randomUUID
            ?.();


    if (!uniqueId) {

        throw new Error(
            'El navegador no puede generar un identificador seguro para el audio.'
        );

    }


    const audioPath =

        `${task.organization_id}`

        +

        `/${task.id}`

        +

        `/${executionId}`

        +

        `/reports/report-${Date.now()}-${uniqueId}.${extension}`;


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
                        false

                }

            );


    if (error) {

        throw error;

    }


    return audioPath;

}



// ============================================================
// ELIMINAR AUDIO HUÉRFANO DE REPORTE
//
// Se usa únicamente como compensación si el archivo se subió,
// pero la RPC no pudo registrar el reporte.
// ============================================================

export async function removeExecutionReportAudio(
    audioPath
) {

    if (!audioPath) {

        return;

    }


    const {
        error
    } =
        await supabase

            .storage

            .from(
                'audios'
            )

            .remove([
                audioPath
            ]);


    if (error) {

        throw error;

    }

}



// ============================================================
// REGISTRAR REPORTE PARCIAL
//
// Esta RPC no completa la ejecución ni cambia el estado.
// ============================================================

export async function addExecutionReport(

    executionId,

    audioPath,

    description = null

) {

    const {
        data,
        error
    } =
        await supabase.rpc(

            'add_execution_report',

            {

                p_execution_id:
                    executionId,

                p_audio_path:
                    audioPath,

                p_descripcion:
                    description || null

            }

        );


    if (error) {

        throw error;

    }


    const reportId =
        Number(data);


    if (
        !Number.isSafeInteger(reportId)
        ||
        reportId <= 0
    ) {

        throw new Error(
            'Supabase no devolvió un reporte válido.'
        );

    }


    return reportId;

}



// ============================================================
// LISTAR REPORTES PARCIALES DE LA EJECUCIÓN
// ============================================================

export async function getExecutionReports(
    executionId
) {

    if (!executionId) {

        return [];

    }


    const {
        data,
        error
    } =
        await supabase.rpc(

            'get_execution_reports',

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
// URL FIRMADA PARA AUDIO PRIVADO DE REPORTE
// ============================================================

export async function createExecutionReportAudioSignedUrl(
    audioPath
) {

    return createExecutionAudioSignedUrl(
        audioPath
    );

}



// ============================================================
// TRANSCRIBIR REPORTE PARCIAL
// ============================================================

export async function transcribeExecutionReport(
    reportId
) {

    const {
        data,
        error
    } =
        await supabase
            .functions
            .invoke(

                'transcribe-execution-report',

                {

                    body: {

                        report_id:
                            reportId

                    }

                }

            );


    if (error) {

        throw error;

    }


    if (data?.error) {

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
// OBTENER EJECUCIÓN COMPLETADA COMPARTIDA
//
// Devuelve la última ejecución completada de la tarea,
// incluyendo los tipos de trabajo realizados.
// ============================================================

export async function getTaskCompletedExecution(
    taskId
) {

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
// ALIAS DE COMPATIBILIDAD
//
// Se conserva el nombre anterior para no romper otros módulos.
// ============================================================

export const getMyCompletedExecution =
    getTaskCompletedExecution;


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
