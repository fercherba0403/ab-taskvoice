// ============================================================
// TASKVOICE
// admin-user-create-v1.js
// ============================================================

import {
    initAdminLayout
} from '../components/admin-layout-v3.js';

import {
    createUser
} from '../services/users.js';


const form =
    document.getElementById(
        'createUserForm'
    );

const submitButton =
    document.getElementById(
        'createUserButton'
    );

const message =
    document.getElementById(
        'createUserMessage'
    );


function clearMessage() {

    message.textContent =
        '';

    message.className =
        'users-form-message';

}


function showError(
    text
) {

    message.textContent =
        text;

    message.className =
        'users-form-message error';

}


form.addEventListener(

    'submit',

    async event => {

        event.preventDefault();

        clearMessage();


        if (
            !form.reportValidity()
        ) {

            return;

        }


        const nombre =
            document
                .getElementById(
                    'nombre'
                )
                .value
                .trim();


        const apellido =
            document
                .getElementById(
                    'apellido'
                )
                .value
                .trim();


        const email =
            document
                .getElementById(
                    'email'
                )
                .value
                .trim()
                .toLowerCase();


        const telefono =
            document
                .getElementById(
                    'telefono'
                )
                .value
                .trim();


        const rol =
            document
                .getElementById(
                    'rol'
                )
                .value;


        const password =
            document
                .getElementById(
                    'password'
                )
                .value;


        const passwordConfirm =
            document
                .getElementById(
                    'passwordConfirm'
                )
                .value;


        if (
            password.length <
            10
        ) {

            showError(
                'La contraseña debe tener al menos 10 caracteres.'
            );

            return;

        }


        if (
            password !==
            passwordConfirm
        ) {

            showError(
                'Las contraseñas no coinciden.'
            );

            return;

        }


        submitButton.disabled =
            true;

        submitButton.textContent =
            'Creando...';


        try {

            const user =
                await createUser({
                    nombre,
                    apellido,
                    email,
                    telefono,
                    rol,
                    password
                });


            if (
                !user?.id
            ) {

                throw new Error(
                    'El usuario fue creado pero no se recibió su identificador.'
                );

            }


            window.location.href =
                `./usuario-detalle.html?id=${encodeURIComponent(
                    user.id
                )}&created=1`;


        } catch (error) {

            console.error(
                'Error creando usuario:',
                error
            );


            showError(
                error?.message
                ||
                'No fue posible crear el usuario.'
            );


            submitButton.disabled =
                false;

            submitButton.textContent =
                'Crear usuario';

        }

    }

);


async function initialize() {

    const profile =
        await initAdminLayout({

            activePage:
                'usuarios',

            title:
                'Nuevo usuario',

            subtitle:
                'Crear una cuenta en la organización'

        });


    if (!profile) {

        return;

    }


    if (
        profile.rol !==
        'admin'
    ) {

        window.location.replace(
            './dashboard.html'
        );

    }

}


initialize();
