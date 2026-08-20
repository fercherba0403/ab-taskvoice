// ============================================================
// TASKVOICE
// admin-user-detail-v2.js
// ============================================================

import {
    initAdminLayout,
    showAdminToast
} from '../components/admin-layout-v3.js';

import {
    getUser,
    updateUser,
    deactivateUser,
    reactivateUser,
    resetUserPassword
} from '../services/users-v2.js';


const params =
    new URLSearchParams(
        window.location.search
    );

const userId =
    params.get(
        'id'
    );


const loading =
    document.getElementById(
        'userDetailLoading'
    );

const content =
    document.getElementById(
        'userDetailContent'
    );

const avatar =
    document.getElementById(
        'userDetailAvatar'
    );

const detailName =
    document.getElementById(
        'userDetailName'
    );

const detailEmail =
    document.getElementById(
        'userDetailEmail'
    );

const detailStatus =
    document.getElementById(
        'userDetailStatus'
    );

const editForm =
    document.getElementById(
        'editUserForm'
    );

const editMessage =
    document.getElementById(
        'editUserMessage'
    );

const saveButton =
    document.getElementById(
        'saveUserButton'
    );

const toggleStatusButton =
    document.getElementById(
        'toggleUserStatusButton'
    );

const accessDescription =
    document.getElementById(
        'accessDescription'
    );

const passwordForm =
    document.getElementById(
        'passwordForm'
    );

const passwordMessage =
    document.getElementById(
        'passwordMessage'
    );

const passwordButton =
    document.getElementById(
        'passwordButton'
    );


let currentUser =
    null;

let currentAdmin =
    null;


function getInitials(
    user
) {

    const first =
        user?.nombre
            ?.charAt(0)
            ?.toUpperCase()
        ?? '';

    const last =
        user?.apellido
            ?.charAt(0)
            ?.toUpperCase()
        ?? '';


    return (
        `${first}${last}`
        ||
        'U'
    );

}


function clearMessage(
    element
) {

    element.textContent =
        '';

    element.className =
        'users-form-message';

}


function showError(
    element,
    text
) {

    element.textContent =
        text;

    element.className =
        'users-form-message error';

}


function showSuccess(
    element,
    text
) {

    element.textContent =
        text;

    element.className =
        'users-form-message success';

}


function renderUser() {

    if (!currentUser) {

        return;

    }


    avatar.textContent =
        getInitials(
            currentUser
        );


    detailName.textContent =
        `${currentUser.nombre ?? ''} ${currentUser.apellido ?? ''}`
            .trim()
        ||
        'Usuario';


    detailEmail.textContent =
        currentUser.email
        ||
        '-';


    detailStatus.className =
        currentUser.activo
            ? 'users-status users-status-active'
            : 'users-status users-status-inactive';


    detailStatus.textContent =
        currentUser.activo
            ? 'Activo'
            : 'Inactivo';


    document.getElementById(
        'nombre'
    ).value =
        currentUser.nombre
        ?? '';


    document.getElementById(
        'apellido'
    ).value =
        currentUser.apellido
        ?? '';


    document.getElementById(
        'email'
    ).value =
        currentUser.email
        ?? '';


    document.getElementById(
        'telefono'
    ).value =
        currentUser.telefono
        ?? '';


    document.getElementById(
        'profileType'
    ).value =
        currentUser.profile_type
        ?? (
            currentUser.rol === 'admin'
                ? 'admin'
                : currentUser.rol === 'supervisor'
                    ? 'jefatura'
                    : 'tecnico'
        );


    const self =
        currentAdmin?.id ===
        currentUser.id;


    if (
        currentUser.activo
    ) {

        toggleStatusButton.textContent =
            self
                ? 'Tu cuenta está activa'
                : 'Desactivar usuario';

        toggleStatusButton.className =
            'users-danger-button';

        toggleStatusButton.disabled =
            self;

        accessDescription.textContent =
            self
                ? 'No podés desactivar tu propia cuenta.'
                : 'Al desactivarlo conservará todo su historial, pero no podrá iniciar sesión.';

    } else {

        toggleStatusButton.textContent =
            'Reactivar usuario';

        toggleStatusButton.className =
            'users-success-button';

        toggleStatusButton.disabled =
            false;

        accessDescription.textContent =
            'El usuario está inactivo. Al reactivarlo podrá volver a iniciar sesión.';

    }


    document.getElementById(
        'profileType'
    ).disabled =
        self;

}


async function loadUser() {

    loading.classList.remove(
        'hidden'
    );

    content.classList.add(
        'hidden'
    );


    try {

        currentUser =
            await getUser(
                userId
            );


        if (!currentUser) {

            throw new Error(
                'Usuario inexistente.'
            );

        }


        renderUser();

        loading.classList.add(
            'hidden'
        );

        content.classList.remove(
            'hidden'
        );


        if (
            params.get(
                'created'
            ) ===
            '1'
        ) {

            showAdminToast(
                'Usuario creado correctamente.',
                'success'
            );

        }


    } catch (error) {

        console.error(
            'Error cargando usuario:',
            error
        );


        loading.textContent =
            error?.message
            ||
            'No fue posible cargar el usuario.';

    }

}


editForm.addEventListener(

    'submit',

    async event => {

        event.preventDefault();

        clearMessage(
            editMessage
        );


        if (
            !editForm.reportValidity()
        ) {

            return;

        }


        saveButton.disabled =
            true;

        saveButton.textContent =
            'Guardando...';


        try {

            currentUser =
                await updateUser(
                    userId,
                    {
                        nombre:
                            document.getElementById('nombre').value.trim(),

                        apellido:
                            document.getElementById('apellido').value.trim(),

                        email:
                            document.getElementById('email').value.trim().toLowerCase(),

                        telefono:
                            document.getElementById('telefono').value.trim(),

                        profileType:
                            document.getElementById('profileType').value
                    }
                );


            renderUser();


            showSuccess(
                editMessage,
                'Cambios guardados correctamente.'
            );


        } catch (error) {

            console.error(
                'Error actualizando usuario:',
                error
            );


            showError(
                editMessage,
                error?.message
                ||
                'No fue posible guardar los cambios.'
            );


        } finally {

            saveButton.disabled =
                false;

            saveButton.textContent =
                'Guardar cambios';

        }

    }

);


toggleStatusButton.addEventListener(

    'click',

    async () => {

        if (
            !currentUser
        ) {

            return;

        }


        const activating =
            currentUser.activo !==
            true;


        const confirmed =
            window.confirm(
                activating
                    ? '¿Querés reactivar este usuario? Podrá volver a iniciar sesión.'
                    : '¿Querés desactivar este usuario? No podrá iniciar sesión, pero conservará todo su historial.'
            );


        if (!confirmed) {

            return;

        }


        toggleStatusButton.disabled =
            true;

        toggleStatusButton.textContent =
            activating
                ? 'Reactivando...'
                : 'Desactivando...';


        try {

            currentUser =
                activating
                    ? await reactivateUser(
                        userId
                    )
                    : await deactivateUser(
                        userId
                    );


            renderUser();


            showAdminToast(
                activating
                    ? 'Usuario reactivado.'
                    : 'Usuario desactivado.',
                'success'
            );


        } catch (error) {

            console.error(
                'Error cambiando estado de usuario:',
                error
            );


            window.alert(
                error?.message
                ||
                'No fue posible cambiar el estado del usuario.'
            );


            renderUser();

        }

    }

);


passwordForm.addEventListener(

    'submit',

    async event => {

        event.preventDefault();

        clearMessage(
            passwordMessage
        );


        if (
            !passwordForm.reportValidity()
        ) {

            return;

        }


        const password =
            document
                .getElementById(
                    'newPassword'
                )
                .value;


        const confirm =
            document
                .getElementById(
                    'newPasswordConfirm'
                )
                .value;


        if (
            password.length <
            10
        ) {

            showError(
                passwordMessage,
                'La contraseña debe tener al menos 10 caracteres.'
            );

            return;

        }


        if (
            password !==
            confirm
        ) {

            showError(
                passwordMessage,
                'Las contraseñas no coinciden.'
            );

            return;

        }


        const confirmed =
            window.confirm(
                '¿Confirmás el cambio de contraseña de este usuario?'
            );


        if (!confirmed) {

            return;

        }


        passwordButton.disabled =
            true;

        passwordButton.textContent =
            'Actualizando...';


        try {

            await resetUserPassword(
                userId,
                password
            );


            passwordForm.reset();


            showSuccess(
                passwordMessage,
                'Contraseña actualizada correctamente.'
            );


        } catch (error) {

            console.error(
                'Error actualizando contraseña:',
                error
            );


            showError(
                passwordMessage,
                error?.message
                ||
                'No fue posible actualizar la contraseña.'
            );


        } finally {

            passwordButton.disabled =
                false;

            passwordButton.textContent =
                'Actualizar contraseña';

        }

    }

);


async function initialize() {

    const profile =
        await initAdminLayout({

            activePage:
                'usuarios',

            title:
                'Detalle de usuario',

            subtitle:
                'Datos, acceso y seguridad'

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

        return;

    }


    currentAdmin =
        profile;


    if (
        !userId
    ) {

        window.location.replace(
            './usuarios.html'
        );

        return;

    }


    await loadUser();

}


initialize();
