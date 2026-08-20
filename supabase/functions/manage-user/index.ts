import {
    createClient
} from 'npm:@supabase/supabase-js@2';


// ============================================================
// TASKVOICE
// Edge Function: manage-user
//
// Gestión administrativa de usuarios con soporte multirol compatible.
//
// SOLO administradores activos.
//
// Acciones:
// - list
// - get
// - update
// - deactivate
// - reactivate
// - reset-password
//
// IMPORTANTE:
// - NO elimina usuarios físicamente.
// - La organización siempre sale del admin autenticado.
// - SUPABASE_SERVICE_ROLE_KEY existe solamente en servidor.
// ============================================================


const corsHeaders = {

    'Access-Control-Allow-Origin':
        '*',

    'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',

    'Access-Control-Allow-Methods':
        'POST, OPTIONS'

};


// ============================================================
// RESPUESTA JSON
// ============================================================

function jsonResponse(
    body: unknown,
    status = 200
) {

    return new Response(

        JSON.stringify(
            body
        ),

        {

            status,

            headers: {

                ...corsHeaders,

                'Content-Type':
                    'application/json'

            }

        }

    );

}


// ============================================================
// TEXTO
// ============================================================

function normalizeText(
    value: unknown
) {

    if (
        typeof value !==
        'string'
    ) {

        return '';

    }


    return value.trim();

}


// ============================================================
// UUID BÁSICO
// ============================================================

function isUuid(
    value: string
) {

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(
            value
        );

}



// ============================================================
// CONFIGURACIONES DE PERFIL
//
// Nombres visibles:
// - Administrador
// - Jefatura
// - Jefatura + Técnico
// - Técnico
//
// Códigos internos legacy (compatibilidad):
// - admin
// - supervisor
// - trabajador
// ============================================================

const PROFILE_CONFIGURATIONS = {

    admin: {
        profile_type: 'admin',
        label: 'Administrador',
        primary_role: 'admin',
        roles: [
            'admin'
        ]
    },

    jefatura: {
        profile_type: 'jefatura',
        label: 'Jefatura',
        primary_role: 'supervisor',
        roles: [
            'supervisor'
        ]
    },

    jefatura_tecnico: {
        profile_type: 'jefatura_tecnico',
        label: 'Jefatura + Técnico',
        primary_role: 'supervisor',
        roles: [
            'supervisor',
            'trabajador'
        ]
    },

    tecnico: {
        profile_type: 'tecnico',
        label: 'Técnico',
        primary_role: 'trabajador',
        roles: [
            'trabajador'
        ]
    }

} as const;


type ProfileConfiguration =
    typeof PROFILE_CONFIGURATIONS[
        keyof typeof PROFILE_CONFIGURATIONS
    ];


function resolveProfileConfiguration(
    body: Record<string, unknown>,
    fallbackRole = ''
): ProfileConfiguration | null {

    const profileType =
        normalizeText(
            body.profile_type
        )
            .toLowerCase();


    if (
        profileType
        &&
        profileType in
            PROFILE_CONFIGURATIONS
    ) {

        return PROFILE_CONFIGURATIONS[
            profileType as keyof typeof PROFILE_CONFIGURATIONS
        ];

    }


    const legacyRole =
        normalizeText(
            body.rol
        )
        ||
        fallbackRole;


    switch (legacyRole) {

        case 'admin':
            return PROFILE_CONFIGURATIONS.admin;

        case 'supervisor':
            return PROFILE_CONFIGURATIONS.jefatura;

        case 'trabajador':
            return PROFILE_CONFIGURATIONS.tecnico;

        default:
            return null;

    }
}


function profileConfigurationFromRoles(
    roles: string[],
    primaryRole: string
): ProfileConfiguration | null {

    const normalized = [
        ...new Set(
            roles
        )
    ]
        .sort();


    if (
        normalized.length === 1
        &&
        normalized[0] === 'admin'
        &&
        primaryRole === 'admin'
    ) {
        return PROFILE_CONFIGURATIONS.admin;
    }


    if (
        normalized.length === 1
        &&
        normalized[0] === 'supervisor'
        &&
        primaryRole === 'supervisor'
    ) {
        return PROFILE_CONFIGURATIONS.jefatura;
    }


    if (
        normalized.length === 2
        &&
        normalized[0] === 'supervisor'
        &&
        normalized[1] === 'trabajador'
        &&
        primaryRole === 'supervisor'
    ) {
        return PROFILE_CONFIGURATIONS.jefatura_tecnico;
    }


    if (
        normalized.length === 1
        &&
        normalized[0] === 'trabajador'
        &&
        primaryRole === 'trabajador'
    ) {
        return PROFILE_CONFIGURATIONS.tecnico;
    }


    return null;
}


function sameRoles(
    a: string[],
    b: string[]
) {

    const left = [
        ...new Set(a)
    ].sort();

    const right = [
        ...new Set(b)
    ].sort();


    return (
        left.length === right.length
        &&
        left.every(
            (value, index) =>
                value === right[index]
        )
    );
}


// ============================================================
// BAN MUY PROLONGADO
//
// Supabase permite ban_duration en updateUserById().
// Se utiliza junto con profiles.activo = false.
//
// La aplicación sigue tomando profiles.activo como estado
// funcional principal.
// ============================================================

const disabledBanDuration =
    '876000h';


// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================

Deno.serve(

    async request => {


        // ====================================================
        // CORS
        // ====================================================

        if (
            request.method ===
            'OPTIONS'
        ) {

            return new Response(
                'ok',
                {
                    headers:
                        corsHeaders
                }
            );

        }



        // ====================================================
        // SOLO POST
        // ====================================================

        if (
            request.method !==
            'POST'
        ) {

            return jsonResponse(
                {
                    error:
                        'Método no permitido.'
                },
                405
            );

        }



        try {


            // =================================================
            // VARIABLES
            // =================================================

            const supabaseUrl =
                Deno.env.get(
                    'SUPABASE_URL'
                );


            const anonKey =
                Deno.env.get(
                    'SUPABASE_ANON_KEY'
                );


            const serviceRoleKey =
                Deno.env.get(
                    'SUPABASE_SERVICE_ROLE_KEY'
                );


            if (
                !supabaseUrl
                ||
                !anonKey
                ||
                !serviceRoleKey
            ) {

                console.error(
                    'Faltan variables de entorno Supabase.'
                );


                return jsonResponse(
                    {
                        error:
                            'Configuración del servidor incompleta.'
                    },
                    500
                );

            }



            // =================================================
            // AUTORIZACIÓN
            // =================================================

            const authHeader =
                request.headers.get(
                    'Authorization'
                );


            if (
                !authHeader
                ||
                !authHeader.startsWith(
                    'Bearer '
                )
            ) {

                return jsonResponse(
                    {
                        error:
                            'Usuario no autenticado.'
                    },
                    401
                );

            }



            // =================================================
            // CLIENTE DEL USUARIO
            // =================================================

            const userClient =
                createClient(

                    supabaseUrl,

                    anonKey,

                    {

                        global: {

                            headers: {

                                Authorization:
                                    authHeader

                            }

                        },

                        auth: {

                            persistSession:
                                false,

                            autoRefreshToken:
                                false

                        }

                    }

                );



            // =================================================
            // JWT
            // =================================================

            const {

                data:
                    {
                        user
                    },

                error:
                    userError

            } =
                await userClient
                    .auth
                    .getUser();



            if (
                userError
                ||
                !user
            ) {

                return jsonResponse(
                    {
                        error:
                            'Sesión inválida o vencida.'
                    },
                    401
                );

            }



            // =================================================
            // ADMIN AUTENTICADO
            // =================================================

            const {

                data:
                    adminProfile,

                error:
                    profileError

            } =
                await userClient

                    .from(
                        'profiles'
                    )

                    .select(`
                        id,
                        organization_id,
                        nombre,
                        apellido,
                        email,
                        rol,
                        activo
                    `)

                    .eq(
                        'id',
                        user.id
                    )

                    .single();



            if (
                profileError
                ||
                !adminProfile
            ) {

                return jsonResponse(
                    {
                        error:
                            'No se encontró el perfil del usuario.'
                    },
                    403
                );

            }



            if (
                adminProfile.activo !==
                    true
                ||
                adminProfile.rol !==
                    'admin'
            ) {

                return jsonResponse(
                    {
                        error:
                            'No tiene permisos para administrar usuarios.'
                    },
                    403
                );

            }



            if (
                !adminProfile.organization_id
            ) {

                return jsonResponse(
                    {
                        error:
                            'El administrador no tiene una organización válida.'
                    },
                    403
                );

            }



            // =================================================
            // CLIENTE ADMINISTRATIVO
            // =================================================

            const adminClient =
                createClient(

                    supabaseUrl,

                    serviceRoleKey,

                    {

                        auth: {

                            persistSession:
                                false,

                            autoRefreshToken:
                                false

                        }

                    }

                );



            // =================================================
            // BODY
            // =================================================

            let body:
                Record<string, unknown>;


            try {

                body =
                    await request.json();

            } catch {

                return jsonResponse(
                    {
                        error:
                            'Datos de solicitud inválidos.'
                    },
                    400
                );

            }



            const action =
                normalizeText(
                    body.action
                )
                    .toLowerCase();



            if (!action) {

                return jsonResponse(
                    {
                        error:
                            'Debe indicar una acción.'
                    },
                    400
                );

            }



            // =================================================
            // LISTAR
            // =================================================

            if (
                action ===
                'list'
            ) {

                const {
                    data:
                        profiles,
                    error:
                        profilesError
                } =
                    await adminClient

                        .from(
                            'profiles'
                        )

                        .select(`
                            id,
                            organization_id,
                            nombre,
                            apellido,
                            email,
                            telefono,
                            rol,
                            activo
                        `)

                        .eq(
                            'organization_id',
                            adminProfile
                                .organization_id
                        )

                        .order(
                            'activo',
                            {
                                ascending:
                                    false
                            }
                        )

                        .order(
                            'nombre',
                            {
                                ascending:
                                    true
                            }
                        )

                        .order(
                            'apellido',
                            {
                                ascending:
                                    true
                            }
                        );


                if (profilesError) {

                    console.error(
                        'manage-user list profiles:',
                        profilesError
                    );


                    return jsonResponse(
                        {
                            error:
                                'No fue posible obtener los usuarios.'
                        },
                        500
                    );

                }


                const userIds =
                    (profiles ?? [])
                        .map(
                            profile =>
                                profile.id
                        );


                let roleRows: {
                    user_id: string;
                    role: string;
                    is_primary: boolean;
                }[] = [];


                if (
                    userIds.length > 0
                ) {

                    const {
                        data,
                        error
                    } =
                        await adminClient

                            .from(
                                'user_roles'
                            )

                            .select(`
                                user_id,
                                role,
                                is_primary
                            `)

                            .in(
                                'user_id',
                                userIds
                            );


                    if (error) {

                        console.error(
                            'manage-user list roles:',
                            error
                        );


                        return jsonResponse(
                            {
                                error:
                                    'No fue posible obtener los perfiles habilitados.'
                            },
                            500
                        );

                    }


                    roleRows =
                        data ?? [];

                }


                const users =
                    (profiles ?? [])
                        .map(profile => {

                            const rows =
                                roleRows
                                    .filter(
                                        row =>
                                            row.user_id ===
                                            profile.id
                                    );


                            const roles =
                                rows.length > 0

                                    ? rows
                                        .map(
                                            row =>
                                                row.role
                                        )

                                    : [
                                        profile.rol
                                    ];


                            const configuration =
                                profileConfigurationFromRoles(
                                    roles,
                                    profile.rol
                                );


                            return {

                                ...profile,

                                roles,

                                profile_type:
                                    configuration
                                        ?.profile_type
                                    ?? null,

                                profile_label:
                                    configuration
                                        ?.label
                                    ?? profile.rol

                            };

                        });


                return jsonResponse({

                    ok:
                        true,

                    users

                });

            }


            // =================================================
            // DESDE AQUÍ SE REQUIERE USER_ID
            // =================================================

            const targetUserId =
                normalizeText(
                    body.user_id
                );


            if (
                !targetUserId
                ||
                !isUuid(
                    targetUserId
                )
            ) {

                return jsonResponse(
                    {
                        error:
                            'user_id inválido.'
                    },
                    400
                );

            }



            // =================================================
            // PERFIL OBJETIVO
            //
            // Siempre misma empresa.
            // =================================================

            const {

                data:
                    targetProfile,

                error:
                    targetProfileError

            } =
                await adminClient

                    .from(
                        'profiles'
                    )

                    .select(`
                        id,
                        organization_id,
                        nombre,
                        apellido,
                        email,
                        telefono,
                        rol,
                        activo
                    `)

                    .eq(
                        'id',
                        targetUserId
                    )

                    .eq(
                        'organization_id',
                        adminProfile
                            .organization_id
                    )

                    .maybeSingle();



            if (
                targetProfileError
            ) {

                console.error(
                    'manage-user target profile:',
                    targetProfileError
                );


                return jsonResponse(
                    {
                        error:
                            'No fue posible consultar el usuario.'
                    },
                    500
                );

            }



            if (
                !targetProfile
            ) {

                return jsonResponse(
                    {
                        error:
                            'Usuario inexistente o perteneciente a otra empresa.'
                    },
                    404
                );

            }



            // =================================================
            // OBTENER AUTH DEL OBJETIVO
            // =================================================

            const {

                data:
                    targetAuthData,

                error:
                    targetAuthError

            } =
                await adminClient
                    .auth
                    .admin
                    .getUserById(
                        targetUserId
                    );



            if (
                targetAuthError
                ||
                !targetAuthData?.user
            ) {

                console.error(
                    'manage-user getUserById:',
                    targetAuthError
                );


                return jsonResponse(
                    {
                        error:
                            'No se encontró la cuenta de autenticación del usuario.'
                    },
                    404
                );

            }



            const targetAuthUser =
                targetAuthData.user;


            // =================================================
            // ROLES ACTUALES DEL OBJETIVO
            // =================================================

            const {
                data:
                    targetRoleRows,
                error:
                    targetRolesError
            } =
                await adminClient

                    .from(
                        'user_roles'
                    )

                    .select(`
                        role,
                        is_primary
                    `)

                    .eq(
                        'user_id',
                        targetUserId
                    );


            if (targetRolesError) {

                console.error(
                    'manage-user target roles:',
                    targetRolesError
                );


                return jsonResponse(
                    {
                        error:
                            'No fue posible consultar los perfiles habilitados.'
                    },
                    500
                );

            }


            const currentRoles =
                (targetRoleRows ?? [])
                    .length > 0

                    ? (targetRoleRows ?? [])
                        .map(
                            row =>
                                row.role
                        )

                    : [
                        targetProfile.rol
                    ];


            const currentConfiguration =
                profileConfigurationFromRoles(
                    currentRoles,
                    targetProfile.rol
                );



            // =================================================
            // OBTENER UNO
            // =================================================

            if (
                action ===
                'get'
            ) {

                return jsonResponse({

                    ok:
                        true,

                    user: {

                        ...targetProfile,

                        roles:
                            currentRoles,

                        profile_type:
                            currentConfiguration
                                ?.profile_type
                            ?? null,

                        profile_label:
                            currentConfiguration
                                ?.label
                            ?? targetProfile.rol,

                        auth_email:
                            targetAuthUser.email
                            ?? null,

                        banned_until:
                            targetAuthUser.banned_until
                            ?? null

                    }

                });

            }


            // =================================================
            // ACTUALIZAR
            // =================================================

            if (
                action ===
                'update'
            ) {

                const nombre =
                    normalizeText(
                        body.nombre
                    );


                const apellido =
                    normalizeText(
                        body.apellido
                    );


                const email =
                    normalizeText(
                        body.email
                    )
                        .toLowerCase();


                const telefono =
                    normalizeText(
                        body.telefono
                    );


                const roleConfiguration =
                    resolveProfileConfiguration(
                        body,
                        targetProfile.rol
                    );


                // ---------------------------------------------
                // VALIDACIONES
                // ---------------------------------------------

                if (!nombre) {

                    return jsonResponse(
                        {
                            error:
                                'El nombre es obligatorio.'
                        },
                        400
                    );

                }


                if (!apellido) {

                    return jsonResponse(
                        {
                            error:
                                'El apellido es obligatorio.'
                        },
                        400
                    );

                }


                if (!email) {

                    return jsonResponse(
                        {
                            error:
                                'El email es obligatorio.'
                        },
                        400
                    );

                }


                const emailPattern =
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


                if (
                    !emailPattern.test(
                        email
                    )
                ) {

                    return jsonResponse(
                        {
                            error:
                                'El email no tiene un formato válido.'
                        },
                        400
                    );

                }


                if (!roleConfiguration) {

                    return jsonResponse(
                        {
                            error:
                                'Configuración de perfil inválida.'
                        },
                        400
                    );

                }


                const primaryRole =
                    roleConfiguration
                        .primary_role;


                const desiredRoles =
                    [
                        ...roleConfiguration
                            .roles
                    ];


                // ---------------------------------------------
                // EL ADMIN NO PUEDE CAMBIAR SUS PROPIOS
                // PERFILES HABILITADOS
                // ---------------------------------------------

                if (
                    targetUserId ===
                        user.id
                    &&
                    (
                        primaryRole !==
                            targetProfile.rol
                        ||
                        !sameRoles(
                            desiredRoles,
                            currentRoles
                        )
                    )
                ) {

                    return jsonResponse(
                        {
                            error:
                                'No puede cambiar sus propios perfiles habilitados.'
                        },
                        400
                    );

                }


                // ---------------------------------------------
                // NO DEJAR EMPRESA SIN ADMIN ACTIVO
                // ---------------------------------------------

                if (
                    targetProfile.rol ===
                        'admin'
                    &&
                    primaryRole !==
                        'admin'
                    &&
                    targetProfile.activo ===
                        true
                ) {

                    const {
                        count,
                        error:
                            countError
                    } =
                        await adminClient

                            .from(
                                'profiles'
                            )

                            .select(
                                'id',
                                {
                                    count:
                                        'exact',

                                    head:
                                        true
                                }
                            )

                            .eq(
                                'organization_id',
                                adminProfile
                                    .organization_id
                            )

                            .eq(
                                'rol',
                                'admin'
                            )

                            .eq(
                                'activo',
                                true
                            )

                            .neq(
                                'id',
                                targetUserId
                            );


                    if (countError) {

                        console.error(
                            'manage-user admin count:',
                            countError
                        );


                        return jsonResponse(
                            {
                                error:
                                    'No fue posible validar los administradores activos.'
                            },
                            500
                        );

                    }


                    if (
                        (count ?? 0) <
                        1
                    ) {

                        return jsonResponse(
                            {
                                error:
                                    'No puede cambiar el perfil del último administrador activo.'
                            },
                            400
                        );

                    }

                }


                // ---------------------------------------------
                // SNAPSHOT PARA ROLLBACK
                // ---------------------------------------------

                const previousEmail =
                    targetAuthUser.email
                    ?? targetProfile.email;


                const previousUserMetadata =
                    targetAuthUser.user_metadata
                    ?? {};


                const previousAppMetadata =
                    targetAuthUser.app_metadata
                    ?? {};


                const previousProfile = {

                    nombre:
                        targetProfile.nombre,

                    apellido:
                        targetProfile.apellido,

                    email:
                        targetProfile.email,

                    telefono:
                        targetProfile.telefono,

                    rol:
                        targetProfile.rol

                };


                const previousRoleRows =
                    (targetRoleRows ?? [])
                        .length > 0

                        ? (targetRoleRows ?? [])
                            .map(row => ({

                                user_id:
                                    targetUserId,

                                role:
                                    row.role,

                                is_primary:
                                    row.is_primary

                            }))

                        : [
                            {
                                user_id:
                                    targetUserId,

                                role:
                                    targetProfile.rol,

                                is_primary:
                                    true
                            }
                        ];


                // ---------------------------------------------
                // AUTH PRIMERO
                // ---------------------------------------------

                const {
                    error:
                        authUpdateError
                } =
                    await adminClient
                        .auth
                        .admin
                        .updateUserById(

                            targetUserId,

                            {

                                email,

                                user_metadata: {

                                    ...previousUserMetadata,

                                    nombre,

                                    apellido

                                },

                                app_metadata: {

                                    ...previousAppMetadata,

                                    organization_id:
                                        adminProfile
                                            .organization_id,

                                    role:
                                        primaryRole

                                }

                            }

                        );


                if (authUpdateError) {

                    console.error(
                        'manage-user auth update:',
                        authUpdateError
                    );


                    return jsonResponse(
                        {
                            error:
                                authUpdateError.message
                                ||
                                'No fue posible actualizar la cuenta de autenticación.'
                        },
                        400
                    );

                }


                // ---------------------------------------------
                // PROFILE LEGACY COMPATIBLE
                // ---------------------------------------------

                const {
                    data:
                        updatedProfile,

                    error:
                        profileUpdateError
                } =
                    await adminClient

                        .from(
                            'profiles'
                        )

                        .update({

                            nombre,

                            apellido,

                            email,

                            telefono:
                                telefono
                                || null,

                            rol:
                                primaryRole

                        })

                        .eq(
                            'id',
                            targetUserId
                        )

                        .eq(
                            'organization_id',
                            adminProfile
                                .organization_id
                        )

                        .select(`
                            id,
                            organization_id,
                            nombre,
                            apellido,
                            email,
                            telefono,
                            rol,
                            activo
                        `)

                        .single();


                if (
                    profileUpdateError
                    ||
                    !updatedProfile
                ) {

                    console.error(
                        'manage-user profile update:',
                        profileUpdateError
                    );


                    await adminClient
                        .auth
                        .admin
                        .updateUserById(
                            targetUserId,
                            {
                                email:
                                    previousEmail,

                                user_metadata:
                                    previousUserMetadata,

                                app_metadata:
                                    previousAppMetadata
                            }
                        );


                    return jsonResponse(
                        {
                            error:
                                'No fue posible actualizar el perfil del usuario.'
                        },
                        500
                    );

                }


                // ---------------------------------------------
                // USER_ROLES
                // ---------------------------------------------

                const {
                    error:
                        deleteRolesError
                } =
                    await adminClient

                        .from(
                            'user_roles'
                        )

                        .delete()

                        .eq(
                            'user_id',
                            targetUserId
                        );


                let rolesUpdateError =
                    deleteRolesError;


                if (!rolesUpdateError) {

                    const {
                        error
                    } =
                        await adminClient

                            .from(
                                'user_roles'
                            )

                            .insert(
                                desiredRoles.map(
                                    role => ({

                                        user_id:
                                            targetUserId,

                                        role,

                                        is_primary:
                                            role ===
                                            primaryRole

                                    })
                                )
                            );


                    rolesUpdateError =
                        error;

                }


                if (rolesUpdateError) {

                    console.error(
                        'manage-user roles update:',
                        rolesUpdateError
                    );


                    // -----------------------------------------
                    // ROLLBACK DB + AUTH - MEJOR ESFUERZO
                    // -----------------------------------------

                    await adminClient
                        .from(
                            'user_roles'
                        )
                        .delete()
                        .eq(
                            'user_id',
                            targetUserId
                        );


                    await adminClient
                        .from(
                            'user_roles'
                        )
                        .insert(
                            previousRoleRows
                        );


                    await adminClient
                        .from(
                            'profiles'
                        )
                        .update(
                            previousProfile
                        )
                        .eq(
                            'id',
                            targetUserId
                        );


                    await adminClient
                        .auth
                        .admin
                        .updateUserById(
                            targetUserId,
                            {
                                email:
                                    previousEmail,

                                user_metadata:
                                    previousUserMetadata,

                                app_metadata:
                                    previousAppMetadata
                            }
                        );


                    return jsonResponse(
                        {
                            error:
                                'No fue posible actualizar los perfiles habilitados.'
                        },
                        500
                    );

                }


                return jsonResponse({

                    ok:
                        true,

                    user: {

                        ...updatedProfile,

                        roles:
                            desiredRoles,

                        profile_type:
                            roleConfiguration
                                .profile_type,

                        profile_label:
                            roleConfiguration
                                .label

                    }

                });

            }


            // =================================================
            // DESACTIVAR
            // =================================================

            if (
                action ===
                'deactivate'
            ) {

                if (
                    targetUserId ===
                    user.id
                ) {

                    return jsonResponse(
                        {
                            error:
                                'No puede desactivar su propia cuenta.'
                        },
                        400
                    );

                }



                if (
                    targetProfile.activo !==
                    true
                ) {

                    return jsonResponse({

                        ok:
                            true,

                        user:
                            targetProfile,

                        already_inactive:
                            true

                    });

                }



                // ---------------------------------------------
                // ÚLTIMO ADMIN ACTIVO
                // ---------------------------------------------

                if (
                    targetProfile.rol ===
                    'admin'
                ) {

                    const {
                        count,
                        error:
                            countError
                    } =
                        await adminClient

                            .from(
                                'profiles'
                            )

                            .select(
                                'id',
                                {
                                    count:
                                        'exact',

                                    head:
                                        true
                                }
                            )

                            .eq(
                                'organization_id',
                                adminProfile
                                    .organization_id
                            )

                            .eq(
                                'rol',
                                'admin'
                            )

                            .eq(
                                'activo',
                                true
                            )

                            .neq(
                                'id',
                                targetUserId
                            );



                    if (countError) {

                        console.error(
                            'manage-user deactivate admin count:',
                            countError
                        );


                        return jsonResponse(
                            {
                                error:
                                    'No fue posible validar los administradores activos.'
                            },
                            500
                        );

                    }



                    if (
                        (count ?? 0) <
                        1
                    ) {

                        return jsonResponse(
                            {
                                error:
                                    'No puede desactivar el último administrador activo.'
                            },
                            400
                        );

                    }

                }



                // ---------------------------------------------
                // PROFILE INACTIVO
                // ---------------------------------------------

                const {
                    data:
                        inactiveProfile,

                    error:
                        inactiveError
                } =
                    await adminClient

                        .from(
                            'profiles'
                        )

                        .update({
                            activo:
                                false
                        })

                        .eq(
                            'id',
                            targetUserId
                        )

                        .eq(
                            'organization_id',
                            adminProfile
                                .organization_id
                        )

                        .select(`
                            id,
                            organization_id,
                            nombre,
                            apellido,
                            email,
                            telefono,
                            rol,
                            activo
                        `)

                        .single();



                if (
                    inactiveError
                    ||
                    !inactiveProfile
                ) {

                    console.error(
                        'manage-user deactivate profile:',
                        inactiveError
                    );


                    return jsonResponse(
                        {
                            error:
                                'No fue posible desactivar el usuario.'
                        },
                        500
                    );

                }



                // ---------------------------------------------
                // BLOQUEAR LOGIN EN AUTH
                // ---------------------------------------------

                const {
                    error:
                        banError
                } =
                    await adminClient
                        .auth
                        .admin
                        .updateUserById(

                            targetUserId,

                            {
                                ban_duration:
                                    disabledBanDuration
                            }

                        );



                if (banError) {

                    console.error(
                        'manage-user ban:',
                        banError
                    );


                    // -----------------------------------------
                    // ROLLBACK PROFILE
                    // -----------------------------------------

                    await adminClient

                        .from(
                            'profiles'
                        )

                        .update({
                            activo:
                                true
                        })

                        .eq(
                            'id',
                            targetUserId
                        );


                    return jsonResponse(
                        {
                            error:
                                'No fue posible bloquear el acceso del usuario.'
                        },
                        500
                    );

                }



                return jsonResponse({

                    ok:
                        true,

                    user:
                        inactiveProfile

                });

            }



            // =================================================
            // REACTIVAR
            // =================================================

            if (
                action ===
                'reactivate'
            ) {

                if (
                    targetProfile.activo ===
                    true
                ) {

                    // Aseguramos que Auth no quede baneado.
                    const {
                        error:
                            unbanAlreadyActiveError
                    } =
                        await adminClient
                            .auth
                            .admin
                            .updateUserById(

                                targetUserId,

                                {
                                    ban_duration:
                                        'none'
                                }

                            );


                    if (
                        unbanAlreadyActiveError
                    ) {

                        console.error(
                            'manage-user unban active user:',
                            unbanAlreadyActiveError
                        );


                        return jsonResponse(
                            {
                                error:
                                    'El perfil está activo pero no fue posible habilitar su acceso.'
                            },
                            500
                        );

                    }


                    return jsonResponse({

                        ok:
                            true,

                        user:
                            targetProfile,

                        already_active:
                            true

                    });

                }



                // ---------------------------------------------
                // DESBLOQUEAR AUTH
                // ---------------------------------------------

                const {
                    error:
                        unbanError
                } =
                    await adminClient
                        .auth
                        .admin
                        .updateUserById(

                            targetUserId,

                            {
                                ban_duration:
                                    'none'
                            }

                        );



                if (unbanError) {

                    console.error(
                        'manage-user unban:',
                        unbanError
                    );


                    return jsonResponse(
                        {
                            error:
                                'No fue posible habilitar el acceso del usuario.'
                        },
                        500
                    );

                }



                // ---------------------------------------------
                // PROFILE ACTIVO
                // ---------------------------------------------

                const {
                    data:
                        activeProfile,

                    error:
                        activeError
                } =
                    await adminClient

                        .from(
                            'profiles'
                        )

                        .update({
                            activo:
                                true
                        })

                        .eq(
                            'id',
                            targetUserId
                        )

                        .eq(
                            'organization_id',
                            adminProfile
                                .organization_id
                        )

                        .select(`
                            id,
                            organization_id,
                            nombre,
                            apellido,
                            email,
                            telefono,
                            rol,
                            activo
                        `)

                        .single();



                if (
                    activeError
                    ||
                    !activeProfile
                ) {

                    console.error(
                        'manage-user reactivate profile:',
                        activeError
                    );


                    // -----------------------------------------
                    // ROLLBACK AUTH - MEJOR ESFUERZO
                    // -----------------------------------------

                    const {
                        error:
                            rebanError
                    } =
                        await adminClient
                            .auth
                            .admin
                            .updateUserById(

                                targetUserId,

                                {
                                    ban_duration:
                                        disabledBanDuration
                                }

                            );


                    if (rebanError) {

                        console.error(
                            'manage-user rollback reban:',
                            rebanError
                        );

                    }


                    return jsonResponse(
                        {
                            error:
                                'No fue posible reactivar el perfil del usuario.'
                        },
                        500
                    );

                }



                return jsonResponse({

                    ok:
                        true,

                    user:
                        activeProfile

                });

            }



            // =================================================
            // RESTABLECER CONTRASEÑA
            // =================================================

            if (
                action ===
                'reset-password'
            ) {

                const password =
                    typeof body.password ===
                        'string'

                        ? body.password

                        : '';


                if (
                    password.length <
                    10
                ) {

                    return jsonResponse(
                        {
                            error:
                                'La contraseña debe tener al menos 10 caracteres.'
                        },
                        400
                    );

                }



                const {
                    error:
                        passwordError
                } =
                    await adminClient
                        .auth
                        .admin
                        .updateUserById(

                            targetUserId,

                            {
                                password
                            }

                        );



                if (passwordError) {

                    console.error(
                        'manage-user reset-password:',
                        passwordError
                    );


                    return jsonResponse(
                        {
                            error:
                                passwordError.message
                                ||
                                'No fue posible actualizar la contraseña.'
                        },
                        400
                    );

                }



                return jsonResponse({

                    ok:
                        true,

                    user_id:
                        targetUserId

                });

            }



            // =================================================
            // ACCIÓN DESCONOCIDA
            // =================================================

            return jsonResponse(
                {
                    error:
                        'Acción no soportada.'
                },
                400
            );


        } catch (error) {


            console.error(
                'manage-user:',
                error
            );


            return jsonResponse(
                {
                    error:
                        'Error interno del servidor.'
                },
                500
            );

        }

    }

);
