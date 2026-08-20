import {
    createClient
} from 'npm:@supabase/supabase-js@2'


// ============================================================
// TASKVOICE
// Edge Function: create-user
//
// Crea usuarios de forma segura con soporte multirol compatible.
//
// SOLO administradores activos pueden utilizarla.
// ============================================================


const corsHeaders = {

    'Access-Control-Allow-Origin': '*',

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

        JSON.stringify(body),

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
// NORMALIZAR TEXTO
// ============================================================

function normalizeText(
    value: unknown
) {

    if (
        typeof value !== 'string'
    ) {

        return '';

    }


    return value.trim();

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
// FUNCIÓN PRINCIPAL
// ============================================================

Deno.serve(
    async request => {


        // ====================================================
        // CORS
        // ====================================================

        if (
            request.method === 'OPTIONS'
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
            request.method !== 'POST'
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
            // VARIABLES SUPABASE
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
            // AUTORIZACIÓN DEL USUARIO QUE LLAMA
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
            //
            // Usa su JWT y respeta RLS.
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
            // VALIDAR JWT CONTRA AUTH
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
            // OBTENER PROFILE DEL ADMIN
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



            // =================================================
            // SOLO ADMINISTRADORES
            // =================================================

            if (
                adminProfile.activo !== true
                ||
                adminProfile.rol !== 'admin'
            ) {

                return jsonResponse(
                    {
                        error:
                            'No tiene permisos para crear usuarios.'
                    },
                    403
                );

            }



            // =================================================
            // DATOS RECIBIDOS
            // =================================================

            let body;


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
                    body
                );


            const password =
                typeof body.password ===
                    'string'

                    ? body.password

                    : '';



            // =================================================
            // VALIDACIONES
            // =================================================

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


            const roles =
                [
                    ...roleConfiguration
                        .roles
                ];


            if (
                password.length < 10
            ) {

                return jsonResponse(
                    {
                        error:
                            'La contraseña debe tener al menos 10 caracteres.'
                    },
                    400
                );

            }



            // =================================================
            // CLIENTE ADMINISTRATIVO
            //
            // SERVICE_ROLE:
            // SOLO EXISTE EN EL SERVIDOR.
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
            // CREAR USUARIO AUTH
            //
            // El trigger 03_auth.sql todavía NO creará
            // profile porque no enviamos organization_id
            // durante este primer paso.
            // =================================================

            const {

                data:
                    createData,

                error:
                    createError

            } =
                await adminClient
                    .auth
                    .admin
                    .createUser({

                        email,

                        password,

                        email_confirm:
                            true,

                        user_metadata: {

                            nombre,

                            apellido

                        }

                    });



            if (
                createError
                ||
                !createData.user
            ) {

                console.error(
                    'Auth createUser:',
                    createError
                );


                return jsonResponse(
                    {
                        error:
                            createError?.message
                            ??
                            'No fue posible crear el usuario.'
                    },
                    400
                );

            }



            const newUserId =
                createData.user.id;



            // =================================================
            // ACTUALIZAR APP_METADATA
            //
            // Información de autorización.
            // =================================================

            const {

                error:
                    metadataError

            } =
                await adminClient
                    .auth
                    .admin
                    .updateUserById(

                        newUserId,

                        {

                            app_metadata: {

                                organization_id:
                                    adminProfile
                                        .organization_id,

                                role:
                                    primaryRole,

                                // La contraseña definida por el administrador
                                // es temporal. El usuario deberá reemplazarla
                                // en su primer ingreso.
                                must_change_password:
                                    true

                            }

                        }

                    );



            if (metadataError) {


                console.error(
                    'Error app_metadata:',
                    metadataError
                );


                // ---------------------------------------------
                // ROLLBACK
                // ---------------------------------------------

                await adminClient
                    .auth
                    .admin
                    .deleteUser(
                        newUserId
                    );


                return jsonResponse(
                    {
                        error:
                            'No fue posible configurar los permisos del usuario.'
                    },
                    500
                );

            }



            // =================================================
            // CREAR PROFILE
            // =================================================

            const {

                error:
                    insertError

            } =
                await adminClient

                    .from(
                        'profiles'
                    )

                    .insert({

                        id:
                            newUserId,

                        organization_id:
                            adminProfile
                                .organization_id,

                        nombre,

                        apellido,

                        email,

                        telefono:
                            telefono || null,

                        rol:
                            primaryRole,

                        activo:
                            true

                    });



            if (insertError) {


                console.error(
                    'Error creando profile:',
                    insertError
                );


                // ---------------------------------------------
                // ROLLBACK
                // ---------------------------------------------

                await adminClient
                    .auth
                    .admin
                    .deleteUser(
                        newUserId
                    );


                return jsonResponse(
                    {
                        error:
                            'No fue posible crear el perfil del usuario.'
                    },
                    500
                );

            }



            // =================================================
            // CREAR ROLES DEL USUARIO
            // =================================================

            const {
                error:
                    rolesInsertError
            } =
                await adminClient

                    .from(
                        'user_roles'
                    )

                    .insert(
                        roles.map(
                            role => ({

                                user_id:
                                    newUserId,

                                role,

                                is_primary:
                                    role ===
                                    primaryRole

                            })
                        )
                    );


            if (rolesInsertError) {

                console.error(
                    'Error creando user_roles:',
                    rolesInsertError
                );


                // ---------------------------------------------
                // ROLLBACK COMPLETO
                // ---------------------------------------------

                await adminClient
                    .from(
                        'profiles'
                    )
                    .delete()
                    .eq(
                        'id',
                        newUserId
                    );


                await adminClient
                    .auth
                    .admin
                    .deleteUser(
                        newUserId
                    );


                return jsonResponse(
                    {
                        error:
                            'No fue posible configurar los perfiles del usuario.'
                    },
                    500
                );

            }


            // =================================================
            // RESPUESTA
            // =================================================

            return jsonResponse(

                {

                    ok:
                        true,

                    user: {

                        id:
                            newUserId,

                        nombre,

                        apellido,

                        email,

                        telefono:
                            telefono || null,

                        rol:
                            primaryRole,

                        roles,

                        profile_type:
                            roleConfiguration
                                .profile_type,

                        profile_label:
                            roleConfiguration
                                .label,

                        activo:
                            true

                    }

                },

                201

            );


        } catch (error) {


            console.error(
                'create-user:',
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