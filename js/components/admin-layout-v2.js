// ============================================================
// TASKVOICE
// components/admin-layout.js
//
// Layout común de todas las páginas administrativas.
// ============================================================

import {
    logout,
    requireRole
} from '../core/auth.js';

import {
    supabase
} from '../core/supabase.js';

// ============================================================
// ICONOS
// ============================================================

const ICONS = {

    dashboard: `
        <svg viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
        </svg>
    `,

    tasks: `
        <svg viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
            <path d="M9 11l3 3L22 4"></path>
            <path d="M21 12v7a2 2 0 0 1-2 2H5
                     a2 2 0 0 1-2-2V5a2 2 0 0 1
                     2-2h11"></path>
        </svg>
    `,

    users: `
        <svg viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6
                     a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
    `,

    records: `
        <svg viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
            <path d="M8 6h13"></path>
            <path d="M8 12h13"></path>
            <path d="M8 18h13"></path>
            <path d="M3 6h.01"></path>
            <path d="M3 12h.01"></path>
            <path d="M3 18h.01"></path>
        </svg>
    `,

    reports: `
        <svg viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
            <path d="M3 3v18h18"></path>
            <path d="M7 16l4-5 4 3 5-7"></path>
        </svg>
    `,

    settings: `
        <svg viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88
                     l.06.06a2 2 0 1 1-2.83 2.83
                     l-.06-.06A1.7 1.7 0 0 0 15 19.4
                     a1.7 1.7 0 0 0-1 .6
                     1.7 1.7 0 0 0-.4 1.1V21
                     a2 2 0 1 1-4 0v-.09
                     A1.7 1.7 0 0 0 8.6 19.4
                     a1.7 1.7 0 0 0-1.88.34
                     l-.06.06a2 2 0 1 1-2.83-2.83
                     l.06-.06A1.7 1.7 0 0 0 4.6 15
                     a1.7 1.7 0 0 0-.6-1
                     1.7 1.7 0 0 0-1.1-.4H3
                     a2 2 0 1 1 0-4h.09
                     A1.7 1.7 0 0 0 4.6 8.6
                     a1.7 1.7 0 0 0-.34-1.88
                     l-.06-.06a2 2 0 1 1 2.83-2.83
                     l.06.06A1.7 1.7 0 0 0 9 4.6
                     a1.7 1.7 0 0 0 1-.6
                     1.7 1.7 0 0 0 .4-1.1V3
                     a2 2 0 1 1 4 0v.09
                     A1.7 1.7 0 0 0 15.4 4.6
                     a1.7 1.7 0 0 0 1.88-.34
                     l.06-.06a2 2 0 1 1 2.83 2.83
                     l-.06.06A1.7 1.7 0 0 0 19.4 9
                     a1.7 1.7 0 0 0 .6 1
                     1.7 1.7 0 0 0 1.1.4H21
                     a2 2 0 1 1 0 4h-.09
                     A1.7 1.7 0 0 0 19.4 15z"></path>
        </svg>
    `

};

// ============================================================
// NAVEGACIÓN
// ============================================================

const NAV_ITEMS = [

    {
        key: 'dashboard',
        label: 'Dashboard',
        icon: 'dashboard',
        href: './dashboard.html',
        enabled: true
    },

    {
        key: 'tareas',
        label: 'Tareas',
        icon: 'tasks',
        href: './tareas.html',
        enabled: true
    },

    {
        key: 'usuarios',
        label: 'Usuarios',
        icon: 'users',
        href: '#',
        enabled: false
    },

    {
        key: 'registros',
        label: 'Registros',
        icon: 'records',
        href: '#',
        enabled: false
    },

    {
        key: 'reportes',
        label: 'Reportes',
        icon: 'reports',
        href: './reportes.html',
        enabled: true
    },

    {
        key: 'configuracion',
        label: 'Configuración',
        icon: 'settings',
        href: '#',
        enabled: false,
        separator: true
    }

];

// ============================================================
// ROL
// ============================================================

function formatRole(role) {

    const roles = {
        admin: 'Administrador',
        supervisor: 'Supervisor',
        trabajador: 'Trabajador'
    };

    return roles[role] ?? role;
}

// ============================================================
// INICIALES
// ============================================================

function getInitials(profile) {

    const first =
        profile.nombre
            ?.charAt(0)
            ?.toUpperCase() ?? '';

    const last =
        profile.apellido
            ?.charAt(0)
            ?.toUpperCase() ?? '';

    return `${first}${last}` || 'U';
}

// ============================================================
// SIDEBAR
// ============================================================

function renderSidebar(activePage) {

    const sidebar =
        document.getElementById(
            'adminSidebar'
        );

    if (!sidebar) {

        throw new Error(
            'TaskVoice: falta #adminSidebar.'
        );
    }

    sidebar.className =
        'sidebar';

    const navigation =
        NAV_ITEMS.map(item => {

            const active =
                item.key === activePage;

            const separator =
                item.separator
                    ? '<div class="nav-divider"></div>'
                    : '';

            const disabledAttribute =
                item.enabled
                    ? ''
                    : `data-coming-soon="${item.label}"`;

            return `

                ${separator}

                <a
                    href="${item.href}"
                    class="nav-item ${active ? 'active' : ''}"
                    ${active ? 'aria-current="page"' : ''}
                    ${disabledAttribute}
                >

                    <span class="nav-icon">
                        ${ICONS[item.icon]}
                    </span>

                    <span>
                        ${item.label}
                    </span>

                </a>
            `;

        }).join('');


    sidebar.innerHTML = `

        <div class="sidebar-brand">

            <div class="sidebar-logo">
                TV
            </div>

            <div class="sidebar-brand-text">
                <strong>
                    TaskVoice
                </strong>
                <span id="layoutOrganizationName">
                    Cargando...
                </span>
            </div>

        </div>

        <nav class="sidebar-nav">
            ${navigation}
        </nav>

        <div class="sidebar-footer">

            <div class="sidebar-user">

                <div id="layoutUserAvatar" class="user-avatar">
                    U
                </div>

                <div class="user-info">
                    <strong id="layoutUserName">
                        ...
                    </strong>
                    <span id="layoutUserRole">
                        ...
                    </span>

                </div>

            </div>

            <button type="button" id="layoutLogoutButton" class="logout-button">
                Cerrar sesión
            </button>

        </div>
    `;
}

// ============================================================
// TOPBAR
// ============================================================

function renderTopbar(
    title,
    subtitle,
    action
)

{
    const topbar =
        document.getElementById(
            'adminTopbar'
        );

    if (!topbar) {

        throw new Error(
            'TaskVoice: falta #adminTopbar.'
        );
    }
 
    topbar.className = 'topbar';

    topbar.innerHTML = `

        <div class="topbar-left">

            <button type="button" id="layoutMenuButton" class="menu-button" aria-label="Abrir menú">
                ☰
            </button>

            <div>

                <h1 id="layoutPageTitle"></h1>

                <p id="layoutPageSubtitle"></p>

            </div>

        </div>

        <div id="layoutTopbarActions"></div>
    `;

    setAdminTopbarTitle(
        title
    );

    setAdminTopbarSubtitle(
        subtitle
    );

    if (action) {

        const container =
            document.getElementById(
                'layoutTopbarActions'
            );

        const link =
            document.createElement(
                'a'
            );

        link.className =
            'new-task-button admin-topbar-action';

        link.href =
            action.href;

        if (action.icon) {

            const icon =
                document.createElement(
                    'span'
                );

            icon.textContent =
                action.icon;

            link.append(
                icon
            );
        }

        const label =
            document.createElement(
                'span'
            );

        label.textContent =
            action.label;

        link.append(
            label
        );

        container.append(
            link
        );
    }
}

// ============================================================
// OVERLAY
// ============================================================

function ensureOverlay() {

    let overlay =
        document.getElementById(
            'adminSidebarOverlay'
        );

    if (!overlay) {

        overlay =
            document.createElement(
                'div'
            );


        overlay.id =
            'adminSidebarOverlay';


        overlay.className =
            'sidebar-overlay';


        document.body.append(
            overlay
        );
    }


    return overlay;
}


// ============================================================
// TOAST
// ============================================================

function ensureToast() {

    let toast =
        document.getElementById(
            'adminToast'
        );


    if (!toast) {

        toast =
            document.createElement(
                'div'
            );


        toast.id =
            'adminToast';


        toast.className =
            'toast';


        toast.setAttribute(
            'role',
            'status'
        );


        toast.setAttribute(
            'aria-live',
            'polite'
        );


        document.body.append(
            toast
        );
    }


    return toast;
}


let toastTimer = null;


export function showAdminToast(
    message,
    type = 'info'
) {

    const toast =
        ensureToast();


    toast.textContent =
        message;


    toast.className =
        `toast toast-${type} show`;


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    'show'
                );

            },
            3000
        );
}


// ============================================================
// TOPBAR API
// ============================================================

export function setAdminTopbarTitle(
    title
) {

    const element =
        document.getElementById(
            'layoutPageTitle'
        );


    if (element) {

        element.textContent =
            title ?? '';
    }
}


export function setAdminTopbarSubtitle(
    subtitle
) {

    const element =
        document.getElementById(
            'layoutPageSubtitle'
        );


    if (element) {

        element.textContent =
            subtitle ?? '';
    }
}


// ============================================================
// EMPRESA
// ============================================================

async function loadOrganizationName(
    profile
) {

    const element =
        document.getElementById(
            'layoutOrganizationName'
        );


    const {
        data,
        error
    } = await supabase

        .from('organizations')

        .select('nombre')

        .eq(
            'id',
            profile.organization_id
        )

        .single();


    if (error) {

        console.error(
            'Error obteniendo organización:',
            error
        );


        element.textContent =
            'Organización';

        return;
    }


    element.textContent =
        data.nombre;
}


// ============================================================
// IDENTIDAD
// ============================================================

async function renderIdentity(
    profile
) {

    document.getElementById(
        'layoutUserName'
    ).textContent =

        `${profile.nombre} ${profile.apellido}`
            .trim();


    document.getElementById(
        'layoutUserRole'
    ).textContent =

        formatRole(
            profile.rol
        );


    document.getElementById(
        'layoutUserAvatar'
    ).textContent =

        getInitials(
            profile
        );


    await loadOrganizationName(
        profile
    );
}


// ============================================================
// EVENTOS
// ============================================================

function bindLayoutEvents() {

    const overlay =
        ensureOverlay();


    const menuButton =
        document.getElementById(
            'layoutMenuButton'
        );


    const logoutButton =
        document.getElementById(
            'layoutLogoutButton'
        );


    menuButton?.addEventListener(
        'click',
        () => {

            document.body.classList.add(
                'sidebar-open'
            );

        }
    );


    overlay.addEventListener(
        'click',
        () => {

            document.body.classList.remove(
                'sidebar-open'
            );

        }
    );


    document.addEventListener(
        'keydown',
        event => {

            if (
                event.key === 'Escape'
            ) {

                document.body.classList.remove(
                    'sidebar-open'
                );
            }

        }
    );


    document
        .querySelectorAll(
            '[data-coming-soon]'
        )
        .forEach(item => {

            item.addEventListener(
                'click',
                event => {

                    event.preventDefault();


                    showAdminToast(
                        `${item.dataset.comingSoon}: módulo pendiente de construcción.`
                    );

                }
            );

        });


    document
        .querySelectorAll(
            '.sidebar .nav-item'
        )
        .forEach(item => {

            item.addEventListener(
                'click',
                () => {

                    if (
                        !item.dataset.comingSoon
                    ) {

                        document.body.classList.remove(
                            'sidebar-open'
                        );
                    }

                }
            );

        });


    logoutButton?.addEventListener(
        'click',
        async () => {

            logoutButton.disabled =
                true;


            logoutButton.textContent =
                'Cerrando...';


            try {

                await logout();

            } finally {

                window.location.replace(
                    '../index.html'
                );
            }

        }
    );
}


// ============================================================
// INICIALIZACIÓN PÚBLICA
// ============================================================

export async function initAdminLayout({

    activePage = 'dashboard',

    title = 'TaskVoice',

    subtitle = '',

    action = null

} = {}) {


    const profile =
        await requireRole(

            [
                'admin',
                'supervisor'
            ],

            '../'

        );


    if (!profile) {

        return null;
    }


    renderSidebar(
        activePage
    );


    renderTopbar(
        title,
        subtitle,
        action
    );


    ensureOverlay();

    ensureToast();


    await renderIdentity(
        profile
    );


    bindLayoutEvents();


    return profile;
}