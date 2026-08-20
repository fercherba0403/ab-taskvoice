// ============================================================
// TASKVOICE
// services/tasks.js
// ============================================================

import {
    supabase
} from '../core/supabase.js';



// ============================================================
// OBTENER TRABAJADORES / USUARIOS ACTIVOS
// ============================================================

export async function getAssignableUsers() {

    const {
        data,
        error
    } = await supabase

        .from('profiles')

        .select(`
            id,
            nombre,
            apellido,
            email,
            rol
        `)

        .eq(
            'activo',
            true
        )

        .order(
            'nombre',
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
// OBTENER TÉCNICOS ACTIVOS
//
// La lista se obtiene desde una RPC segura porque user_roles
// solo permite lectura directa del propio usuario.
//
// Incluye:
// - Técnico
// - Jefatura + Técnico
// ============================================================

export async function getTechnicians() {

    const {
        data,
        error
    } = await supabase.rpc(
        'get_assignable_technicians'
    );


    if (error) {

        throw error;

    }


    return data ?? [];

}


// ============================================================
// LUGARES
// ============================================================

export async function getLocations() {

    const {
        data,
        error
    } = await supabase

        .from('locations')

        .select(`
            id,
            nombre
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
        )

        .order(
            'nombre',
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
// TURNOS
// ============================================================

export async function getShifts() {

    const {
        data,
        error
    } = await supabase

        .from('shifts')

        .select(`
            id,
            nombre
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
        )

        .order(
            'nombre',
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
// TIPOS DE MANTENIMIENTO
// ============================================================

export async function getMaintenanceTypes() {

    const {
        data,
        error
    } = await supabase

        .from('maintenance_types')

        .select(`
            id,
            nombre
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
        )

        .order(
            'nombre',
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
// OBTENER PLANTILLAS ACTIVAS
// ============================================================

export async function getTaskTemplates() {

    const {
        data,
        error
    } = await supabase

        .from('task_templates')

        .select(`
            id,
            nombre,
            descripcion
        `)

        .eq(
            'activa',
            true
        )

        .order(
            'nombre',
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
// LISTAR TAREAS
// ============================================================

// ============================================================
// LISTAR TAREAS
//
// Compatible con:
// - asignación múltiple
// - lugares
// - ticket
// - filtros por técnico real
// ============================================================

export async function getTasks(
    filters = {}
) {

    let allowedTaskIds = null;


    // ========================================================
    // FILTRO POR TÉCNICO
    //
    // La relación real ahora está en task_assignees.
    // ========================================================

    if (
        filters.userId &&
        filters.userId !== 'todos'
    ) {

        const {
            data: assignments,
            error: assignmentsError
        } = await supabase

            .from('task_assignees')

            .select('task_id')

            .eq(
                'user_id',
                filters.userId
            );


        if (assignmentsError) {

            throw assignmentsError;

        }


        allowedTaskIds = [

            ...new Set(

                (assignments ?? [])
                    .map(
                        item =>
                            item.task_id
                    )

            )

        ];


        if (
            allowedTaskIds.length === 0
        ) {

            return [];

        }

    }



    // ========================================================
    // CONSULTA PRINCIPAL
    // ========================================================

    let query =
        supabase

            .from('tasks')

            .select(`
                id,
                titulo,
                descripcion,
                asignado_a,
                creado_por,
                prioridad,
                estado,
                fecha_asignacion,
                fecha_limite,
                hora_limite,
                location_id,
                shift_id,
                ticket_number,
                maintenance_type_id,
                created_at,
                updated_at
            `);



    // ========================================================
    // BUSCADOR
    // ========================================================

    if (
        filters.search &&
        filters.search.trim()
    ) {

        query =
            query.ilike(
                'titulo',
                `%${filters.search.trim()}%`
            );

    }



    // ========================================================
    // ESTADO
    // ========================================================

    if (
        filters.status &&
        filters.status !== 'todos'
    ) {

        query =
            query.eq(
                'estado',
                filters.status
            );

    }



    // ========================================================
    // PRIORIDAD
    // ========================================================

    if (
        filters.priority &&
        filters.priority !== 'todas'
    ) {

        query =
            query.eq(
                'prioridad',
                filters.priority
            );

    }

    // ========================================================
    // LUGAR
    // ========================================================

    if (
        filters.locationId &&
        filters.locationId !== 'todos'
    ) {

        query =
            query.eq(
                'location_id',
                Number(
                    filters.locationId
                )
            );

    }



    // ========================================================
    // TÉCNICO
    // ========================================================

    if (
        allowedTaskIds !== null
    ) {

        query =
            query.in(
                'id',
                allowedTaskIds
            );

    }



    // ========================================================
    // FECHAS
    // ========================================================

    if (filters.dateFrom) {

        query =
            query.gte(
                'fecha_limite',
                filters.dateFrom
            );

    }


    if (filters.dateTo) {

        query =
            query.lte(
                'fecha_limite',
                filters.dateTo
            );

    }



    // ========================================================
    // ORDEN
    // ========================================================

    query =
        query.order(
            'created_at',
            {
                ascending: false
            }
        );



    const {
        data,
        error
    } = await query;


    if (error) {

        throw error;

    }



    const tasks =
        data ?? [];


    if (
        tasks.length === 0
    ) {

        return [];

    }



    // ========================================================
    // IDS DE TAREAS
    // ========================================================

    const taskIds =
        tasks.map(
            task =>
                task.id
        );



    // ========================================================
    // ASIGNACIONES
    // ========================================================

    const {
        data: assignments,
        error: assignmentError
    } = await supabase

        .from('task_assignees')

        .select(`
            task_id,
            user_id,
            estado
        `)

        .in(
            'task_id',
            taskIds
        );


    if (assignmentError) {

        throw assignmentError;

    }



    // ========================================================
    // IDS DE TÉCNICOS
    // ========================================================

    const technicianIds = [

        ...new Set(

            (assignments ?? [])

                .map(
                    assignment =>
                        assignment.user_id
                )

                .filter(Boolean)

        )

    ];



    // ========================================================
    // TÉCNICOS
    // ========================================================

    const techniciansMap =
        new Map();


    if (
        technicianIds.length > 0
    ) {

        const {
            data: technicians,
            error: technicianError
        } = await supabase

            .from('profiles')

            .select(`
                id,
                nombre,
                apellido
            `)

            .in(
                'id',
                technicianIds
            );


        if (technicianError) {

            throw technicianError;

        }


        for (
            const technician of
            technicians ?? []
        ) {

            techniciansMap.set(

                technician.id,

                {

                    id:
                        technician.id,

                    nombre:
                        `${technician.nombre} ${technician.apellido}`
                            .trim()

                }

            );

        }

    }



    // ========================================================
    // MAP DE ASIGNACIONES POR TAREA
    // ========================================================

    const assignmentsMap =
        new Map();


    for (
        const assignment of
        assignments ?? []
    ) {

        if (
            !assignmentsMap.has(
                assignment.task_id
            )
        ) {

            assignmentsMap.set(
                assignment.task_id,
                []
            );

        }


        const technician =
            techniciansMap.get(
                assignment.user_id
            );


        assignmentsMap
            .get(
                assignment.task_id
            )
            .push({

                id:
                    assignment.user_id,

                nombre:
                    technician?.nombre
                    ?? 'Usuario',

                estado:
                    assignment.estado

            });

    }



    // ========================================================
    // LUGARES
    // ========================================================

    const locationIds = [

        ...new Set(

            tasks

                .map(
                    task =>
                        task.location_id
                )

                .filter(Boolean)

        )

    ];


    const locationsMap =
        new Map();


    if (
        locationIds.length > 0
    ) {

        const {
            data: locations,
            error: locationError
        } = await supabase

            .from('locations')

            .select(`
                id,
                nombre
            `)

            .in(
                'id',
                locationIds
            );


        if (locationError) {

            throw locationError;

        }


        for (
            const location of
            locations ?? []
        ) {

            locationsMap.set(
                location.id,
                location.nombre
            );

        }

    }



    // ========================================================
    // TURNOS
    // ========================================================

    const shiftIds = [

        ...new Set(

            tasks

                .map(
                    task =>
                        task.shift_id
                )

                .filter(Boolean)

        )

    ];


    const shiftsMap =
        new Map();


    if (
        shiftIds.length > 0
    ) {

        const {
            data: shifts,
            error: shiftError
        } = await supabase

            .from('shifts')

            .select(`
                id,
                nombre
            `)

            .in(
                'id',
                shiftIds
            );


        if (shiftError) {

            throw shiftError;

        }


        for (
            const shift of
            shifts ?? []
        ) {

            shiftsMap.set(
                shift.id,
                shift.nombre
            );

        }

    }



    // ========================================================
    // TIPOS DE MANTENIMIENTO
    // ========================================================

    const maintenanceIds = [

        ...new Set(

            tasks

                .map(
                    task =>
                        task.maintenance_type_id
                )

                .filter(Boolean)

        )

    ];


    const maintenanceMap =
        new Map();


    if (
        maintenanceIds.length > 0
    ) {

        const {
            data: maintenanceTypes,
            error: maintenanceError
        } = await supabase

            .from(
                'maintenance_types'
            )

            .select(`
                id,
                nombre
            `)

            .in(
                'id',
                maintenanceIds
            );


        if (maintenanceError) {

            throw maintenanceError;

        }


        for (
            const type of
            maintenanceTypes ?? []
        ) {

            maintenanceMap.set(
                type.id,
                type.nombre
            );

        }

    }



    // ========================================================
    // RESULTADO ENRIQUECIDO
    // ========================================================

    return tasks.map(

        task => {

            const assignedUsers =
                assignmentsMap.get(
                    task.id
                ) ?? [];


            return {

                ...task,


                assigned_users:
                    assignedUsers,


                assigned_count:
                    assignedUsers.length,


                location_name:

                    locationsMap.get(
                        task.location_id
                    )

                    ?? 'Sin lugar',


                shift_name:

                    shiftsMap.get(
                        task.shift_id
                    )

                    ?? 'Sin turno',


                maintenance_type_name:

                    maintenanceMap.get(
                        task.maintenance_type_id
                    )

                    ?? 'Sin tipo'

            };

        }

    );

}



// ============================================================
// OBTENER UNA TAREA
// ============================================================

export async function getTask(
    taskId
) {

    const {
        data,
        error
    } = await supabase

        .from('tasks')

        .select('*')

        .eq(
            'id',
            taskId
        )

        .single();


    if (error) {

        throw error;

    }


    let assignedUser = null;


    if (data.asignado_a) {

        const {
            data: user,
            error: userError
        } = await supabase

            .from('profiles')

            .select(`
                id,
                nombre,
                apellido,
                email
            `)

            .eq(
                'id',
                data.asignado_a
            )

            .single();


        if (!userError) {

            assignedUser =
                user;

        }

    }


    return {

        ...data,

        assignedUser

    };

}



// ============================================================
// HISTORIAL
// ============================================================

export async function getTaskHistory(
    taskId
) {

    const {
        data,
        error
    } = await supabase

        .from('task_history')

        .select('*')

        .eq(
            'task_id',
            taskId
        )

        .order(
            'created_at',
            {
                ascending: false
            }
        );


    if (error) {

        throw error;

    }


    return data ?? [];

}



// ============================================================
// EJECUCIONES
// ============================================================

export async function getTaskExecutions(
    taskId
) {

    const {
        data,
        error
    } = await supabase

        .from('task_executions')

        .select(`
            id,
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
            'created_at',
            {
                ascending: false
            }
        );


    if (error) {

        throw error;

    }


    return data ?? [];

}



// ============================================================
// CREAR TAREA
// ============================================================

export async function createTask(
    task
) {

    const {
        data,
        error
    } = await supabase.rpc(

        'create_task',

        {

            p_titulo:
                task.titulo,

            p_asignado_a:
                task.asignado_a,

            p_descripcion:
                task.descripcion || null,

            p_prioridad:
                task.prioridad,

            p_fecha_limite:
                task.fecha_limite || null,

            p_hora_limite:
                task.hora_limite || null,

            p_template_id:
                task.template_id || null

        }

    );


    if (error) {

        throw error;

    }


    return data;

}

// ============================================================
// CREAR TAREA MULTI-TÉCNICO
// ============================================================

export async function createTaskMulti(
    task
) {

    const {
        data,
        error
    } = await supabase.rpc(

        'create_task_multi',

        {

            p_titulo:
                task.titulo,

            p_asignados:
                task.asignados,

            p_descripcion:
                task.descripcion || null,

            p_prioridad:
                task.prioridad,

            p_fecha_limite:
                task.fecha_limite || null,

            p_hora_limite:
                task.hora_limite || null,

            p_template_id:
                task.template_id || null,

            p_location_id:
                task.location_id || null,

            p_shift_id:
                task.shift_id || null,

            p_ticket_number:
                task.ticket_number || null,

            p_maintenance_type_id:
                task.maintenance_type_id || null

        }

    );


    if (error) {

        throw error;

    }


    return data;

}

// ============================================================
// EDITAR TAREA
// ============================================================

export async function updateTask(
    taskId,
    task
) {

    const {
        error
    } = await supabase.rpc(

        'update_task',

        {

            p_task_id:
                taskId,

            p_titulo:
                task.titulo,

            p_asignado_a:
                task.asignado_a,

            p_descripcion:
                task.descripcion || null,

            p_prioridad:
                task.prioridad,

            p_fecha_limite:
                task.fecha_limite || null,

            p_hora_limite:
                task.hora_limite || null,

            p_template_id:
                task.template_id || null

        }

    );


    if (error) {

        throw error;

    }

}



// ============================================================
// CANCELAR TAREA
// ============================================================

export async function cancelTask(
    taskId,
    comment
) {

    const {
        error
    } = await supabase.rpc(

        'cancel_task',

        {

            p_task_id:
                taskId,

            p_comentario:
                comment || null

        }

    );


    if (error) {

        throw error;

    }

}

// ============================================================
// OBTENER TAREA - MODELO MULTI-TÉCNICO
// ============================================================

export async function getTaskMulti(
    taskId
) {

    const {
        data,
        error
    } = await supabase

        .from('tasks')

        .select(`
            id,
            organization_id,
            template_id,
            titulo,
            descripcion,
            creado_por,
            asignado_a,
            prioridad,
            estado,
            fecha_asignacion,
            fecha_limite,
            hora_limite,
            location_id,
            shift_id,
            ticket_number,
            maintenance_type_id,
            created_at,
            updated_at
        `)

        .eq(
            'id',
            taskId
        )

        .single();


    if (error) {

        throw error;

    }


    return data;

}

// ============================================================
// OBTENER TÉCNICOS ASIGNADOS A UNA TAREA
// ============================================================

export async function getTaskAssignees(
    taskId
) {

    const {
        data: assignments,
        error: assignmentsError
    } = await supabase

        .from('task_assignees')

        .select(`
            task_id,
            user_id,
            estado,
            assigned_at,
            accepted_at,
            started_at,
            completed_at
        `)

        .eq(
            'task_id',
            taskId
        );


    if (assignmentsError) {

        throw assignmentsError;

    }


    if (
        !assignments
        ||
        assignments.length === 0
    ) {

        return [];

    }


    const userIds =
        assignments.map(
            assignment =>
                assignment.user_id
        );


    const {
        data: users,
        error: usersError
    } = await supabase

        .from('profiles')

        .select(`
            id,
            nombre,
            apellido,
            email,
            rol,
            activo
        `)

        .in(
            'id',
            userIds
        );


    if (usersError) {

        throw usersError;

    }


    const usersMap =
        new Map();


    for (
        const user of users ?? []
    ) {

        usersMap.set(
            user.id,
            user
        );

    }


    return assignments

        .map(
            assignment => {

                const user =
                    usersMap.get(
                        assignment.user_id
                    );


                return {

                    ...assignment,

                    nombre:
                        user
                            ? `${user.nombre} ${user.apellido}`.trim()
                            : 'Usuario',

                    email:
                        user?.email ?? '',

                    activo:
                        user?.activo ?? false,

                    rol:
                        user?.rol ?? null

                };

            }
        )

        .sort(
            (a, b) =>
                a.nombre.localeCompare(
                    b.nombre,
                    'es'
                )
        );

}

// ============================================================
// ACTUALIZAR TAREA MULTI-TÉCNICO
// ============================================================

export async function updateTaskMulti(
    taskId,
    task
) {

    const {
        error
    } = await supabase.rpc(

        'update_task_multi',

        {

            p_task_id:
                taskId,

            p_titulo:
                task.titulo,

            p_asignados:
                task.asignados,

            p_descripcion:
                task.descripcion || null,

            p_prioridad:
                task.prioridad,

            p_fecha_limite:
                task.fecha_limite || null,

            p_hora_limite:
                task.hora_limite || null,

            p_template_id:
                task.template_id || null,

            p_location_id:
                task.location_id || null,

            p_shift_id:
                task.shift_id || null,

            p_ticket_number:
                task.ticket_number || null,

            p_maintenance_type_id:
                task.maintenance_type_id || null

        }

    );


    if (error) {

        throw error;

    }

}

// ============================================================
// TASKVOICE
// MIS TAREAS - TRABAJADOR
//
// Obtiene únicamente las tareas asignadas al usuario actual
// mediante task_assignees.
//
// IMPORTANTE:
// Ya no utilizamos tasks.asignado_a para determinar
// las tareas del trabajador.
// ============================================================

export async function getMyWorkerTasks() {


    // ========================================================
    // USUARIO AUTENTICADO
    // ========================================================

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
            'No fue posible identificar al usuario.'
        );

    }



    // ========================================================
    // ASIGNACIONES DEL TÉCNICO
    // ========================================================

    const {
        data: assignments,
        error: assignmentsError
    } =
        await supabase

            .from(
                'task_assignees'
            )

            .select(`
                task_id,
                user_id,
                estado,
                assigned_at,
                accepted_at,
                started_at,
                completed_at
            `)

            .eq(
                'user_id',
                user.id
            )

            .order(
                'assigned_at',
                {
                    ascending: false
                }
            );


    if (assignmentsError) {

        throw assignmentsError;

    }



    if (
        !assignments
        ||
        assignments.length === 0
    ) {

        return [];

    }



    // ========================================================
    // IDS DE TAREAS
    // ========================================================

    const taskIds = [

        ...new Set(

            assignments.map(
                assignment =>
                    assignment.task_id
            )

        )

    ];



    // ========================================================
    // TAREAS
    // ========================================================

    const {
        data: tasks,
        error: tasksError
    } =
        await supabase

            .from(
                'tasks'
            )

            .select(`
                id,
                titulo,
                descripcion,
                prioridad,
                estado,
                fecha_asignacion,
                fecha_limite,
                hora_limite,
                location_id,
                shift_id,
                ticket_number,
                maintenance_type_id,
                created_at,
                updated_at
            `)

            .in(
                'id',
                taskIds
            );


    if (tasksError) {

        throw tasksError;

    }



    // ========================================================
    // MAP DE ASIGNACIONES
    // ========================================================

    const assignmentsMap =
        new Map();


    for (
        const assignment of assignments
    ) {

        assignmentsMap.set(
            assignment.task_id,
            assignment
        );

    }



    // ========================================================
    // LUGARES
    // ========================================================

    const locationIds = [

        ...new Set(

            (tasks ?? [])

                .map(
                    task =>
                        task.location_id
                )

                .filter(Boolean)

        )

    ];


    const locationsMap =
        new Map();


    if (
        locationIds.length > 0
    ) {

        const {
            data: locations,
            error: locationsError
        } =
            await supabase

                .from(
                    'locations'
                )

                .select(`
                    id,
                    nombre
                `)

                .in(
                    'id',
                    locationIds
                );


        if (locationsError) {

            throw locationsError;

        }


        for (
            const location of
            locations ?? []
        ) {

            locationsMap.set(
                location.id,
                location.nombre
            );

        }

    }



    // ========================================================
    // TURNOS
    // ========================================================

    const shiftIds = [

        ...new Set(

            (tasks ?? [])

                .map(
                    task =>
                        task.shift_id
                )

                .filter(Boolean)

        )

    ];


    const shiftsMap =
        new Map();


    if (
        shiftIds.length > 0
    ) {

        const {
            data: shifts,
            error: shiftsError
        } =
            await supabase

                .from(
                    'shifts'
                )

                .select(`
                    id,
                    nombre
                `)

                .in(
                    'id',
                    shiftIds
                );


        if (shiftsError) {

            throw shiftsError;

        }


        for (
            const shift of
            shifts ?? []
        ) {

            shiftsMap.set(
                shift.id,
                shift.nombre
            );

        }

    }



    // ========================================================
    // TIPOS DE MANTENIMIENTO
    // ========================================================

    const maintenanceIds = [

        ...new Set(

            (tasks ?? [])

                .map(
                    task =>
                        task.maintenance_type_id
                )

                .filter(Boolean)

        )

    ];


    const maintenanceMap =
        new Map();


    if (
        maintenanceIds.length > 0
    ) {

        const {
            data: maintenanceTypes,
            error: maintenanceError
        } =
            await supabase

                .from(
                    'maintenance_types'
                )

                .select(`
                    id,
                    nombre
                `)

                .in(
                    'id',
                    maintenanceIds
                );


        if (maintenanceError) {

            throw maintenanceError;

        }


        for (
            const type of
            maintenanceTypes ?? []
        ) {

            maintenanceMap.set(
                type.id,
                type.nombre
            );

        }

    }



    // ========================================================
    // RESULTADO FINAL
    // ========================================================

    const result =
        (tasks ?? [])

            .map(
                task => {

                    const assignment =
                        assignmentsMap.get(
                            task.id
                        );


                    return {

                        ...task,


                        // -------------------------------------
                        // ESTADO PERSONAL DEL TÉCNICO
                        // -------------------------------------

                        assignment_state:
                            assignment?.estado
                            ?? 'pendiente',


                        assigned_at:
                            assignment?.assigned_at
                            ?? null,


                        accepted_at:
                            assignment?.accepted_at
                            ?? null,


                        started_at:
                            assignment?.started_at
                            ?? null,


                        completed_at:
                            assignment?.completed_at
                            ?? null,


                        // -------------------------------------
                        // CATÁLOGOS
                        // -------------------------------------

                        location_name:

                            locationsMap.get(
                                task.location_id
                            )

                            ?? 'Sin lugar',


                        shift_name:

                            shiftsMap.get(
                                task.shift_id
                            )

                            ?? 'Sin turno',


                        maintenance_type_name:

                            maintenanceMap.get(
                                task.maintenance_type_id
                            )

                            ?? 'Sin tipo'

                    };

                }
            );



    // ========================================================
    // ORDEN OPERATIVO
    //
    // 1. En progreso
    // 2. Aceptadas
    // 3. Pendientes
    // 4. Completadas
    // 5. Canceladas
    // ========================================================

    const stateOrder = {

        en_progreso: 1,

        aceptada: 2,

        pendiente: 3,

        completada: 4,

        cancelada: 5

    };


    result.sort(

        (a, b) => {

            const orderA =
                stateOrder[
                a.assignment_state
                ] ?? 99;


            const orderB =
                stateOrder[
                b.assignment_state
                ] ?? 99;


            if (
                orderA !== orderB
            ) {

                return orderA - orderB;

            }


            // -----------------------------------------------
            // Dentro del mismo estado:
            // primero la fecha límite más próxima.
            // -----------------------------------------------

            if (
                a.fecha_limite
                &&
                b.fecha_limite
            ) {

                return a.fecha_limite.localeCompare(
                    b.fecha_limite
                );

            }


            return (
                b.id - a.id
            );

        }

    );


    return result;

}

// ============================================================
// OBTENER MI ASIGNACIÓN DE UNA TAREA
// ============================================================

export async function getMyTaskAssignment(
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
                'task_assignees'
            )

            .select(`
                task_id,
                user_id,
                estado,
                assigned_at,
                accepted_at,
                started_at,
                completed_at,
                rejected_at,
                rejection_reason
            `)

            .eq(
                'task_id',
                taskId
            )

            .eq(
                'user_id',
                user.id
            )

            .single();


    if (error) {

        throw error;

    }


    return data;

}



// ============================================================
// RECHAZAR TAREA
// ============================================================

export async function rejectTask(
    taskId,
    reason
) {

    const {
        error
    } =
        await supabase.rpc(

            'reject_task',

            {

                p_task_id:
                    taskId,

                p_motivo:
                    reason

            }

        );


    if (error) {

        throw error;

    }

}

// ============================================================
// ACEPTAR TAREA
//
// El técnico acepta SU asignación individual.
// La lógica real se ejecuta en PostgreSQL mediante accept_task.
// ============================================================

export async function acceptTask(
    taskId
) {

    const {
        error
    } = await supabase.rpc(

        'accept_task',

        {

            p_task_id:
                taskId

        }

    );


    if (error) {

        throw error;

    }

}

// ============================================================
// INICIAR TAREA
//
// Inicia la participación individual del técnico.
// Devuelve el ID de su ejecución.
// ============================================================

export async function startTask(
    taskId
) {

    const {
        data,
        error
    } = await supabase.rpc(

        'start_task',

        {
            p_task_id:
                taskId
        }

    );


    if (error) {

        throw error;

    }


    return data;

}