// ============================================================
// AB TASKVOICE
// technician-layout-v1.js
//
// Layout compartido del Panel Técnico.
// Replica la estructura visual del Panel Admin sin compartir
// navegación, permisos ni decisiones de autorización.
// ============================================================

import {
    logout
} from '../core/auth.js';


const ICONS = {

    tasks: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="2"></rect>
            <path d="m8 12 2.5 2.5L16 9"></path>
        </svg>
    `,

    reports: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 19V9"></path>
            <path d="M10 19V5"></path>
            <path d="M16 19v-7"></path>
            <path d="M22 19V3"></path>
        </svg>
    `

};


const NAV_ITEMS = [

    {
        key: 'tasks',
        label: 'Tareas',
        href: './inicio.html',
        icon: 'tasks'
    },

    {
        key: 'reports',
        label: 'Reportes',
        href: './reportes.html',
        icon: 'reports'
    }

];


function getActivePage() {

    return (
        document.body.dataset.technicianPage
        ||
        'tasks'
    );

}


function renderSidebar() {

    const sidebar =
        document.getElementById(
            'technicianSidebar'
        );


    if (!sidebar) {

        return;

    }


    const activePage =
        getActivePage();


    const navigation =
        NAV_ITEMS
            .map(
                item => {

                    const active =
                        item.key ===
                        activePage;


                    return `
                        <a
                            href="${item.href}"
                            class="technician-nav-item ${active ? 'active' : ''}"
                            ${active ? 'aria-current="page"' : ''}
                        >
                            <span class="technician-nav-icon">
                                ${ICONS[item.icon]}
                            </span>

                            <span>
                                ${item.label}
                            </span>
                        </a>
                    `;

                }
            )
            .join('');


    sidebar.className =
        'technician-sidebar';


    sidebar.innerHTML = `
        <div class="technician-sidebar-header">
            <div class="technician-sidebar-logo">
                <img
                    src="../img/icon-512.png"
                    alt=""
                    width="40"
                    height="40"
                >
            </div>

            <div class="technician-sidebar-brand">
                <strong>AB TaskVoice</strong>
                <span>TaskVoice AUBASA</span>
            </div>

            <button
                id="technicianSidebarClose"
                class="technician-sidebar-close"
                type="button"
                aria-label="Cerrar menú"
            >
                ×
            </button>
        </div>

        <nav
            class="technician-nav"
            aria-label="Navegación del Técnico"
        >
            ${navigation}
        </nav>

        <div class="technician-sidebar-footer">
            <div class="technician-sidebar-user">
                <span
                    id="technicianUserAvatar"
                    class="technician-user-avatar"
                    aria-hidden="true"
                >
                    --
                </span>

                <div class="technician-user-info">
                    <strong id="topbarUserName">...</strong>
                    <span>Técnico</span>
                </div>
            </div>

            <button
                id="logoutButton"
                class="technician-logout-button"
                type="button"
            >
                Cerrar sesión
            </button>
        </div>
    `;

}


function getInitials(
    fullName
) {

    const words =
        fullName
            .trim()
            .split(/\s+/)
            .filter(
                word =>
                    word
                    &&
                    word !== '...'
            );


    if (words.length === 0) {

        return '--';

    }


    const firstInitial =
        words[0][0] ?? '';

    const lastInitial =
        words.length > 1
            ? words[words.length - 1][0] ?? ''
            : '';


    return `${firstInitial}${lastInitial}`
        .toLocaleUpperCase('es-AR');

}


function bindUserPresentation() {

    const userName =
        document.getElementById(
            'topbarUserName'
        );

    const avatar =
        document.getElementById(
            'technicianUserAvatar'
        );


    if (!userName || !avatar) {

        return;

    }


    const updateAvatar = () => {

        avatar.textContent =
            getInitials(
                userName.textContent ?? ''
            );

    };


    updateAvatar();


    const observer =
        new MutationObserver(
            updateAvatar
        );


    observer.observe(
        userName,
        {
            childList: true,
            characterData: true,
            subtree: true
        }
    );

}


function ensureOverlay() {

    let overlay =
        document.getElementById(
            'technicianSidebarOverlay'
        );


    if (overlay) {

        return overlay;

    }


    overlay =
        document.createElement(
            'button'
        );


    overlay.id =
        'technicianSidebarOverlay';

    overlay.className =
        'technician-sidebar-overlay';

    overlay.type =
        'button';

    overlay.setAttribute(
        'aria-label',
        'Cerrar menú'
    );


    document.body.append(
        overlay
    );


    return overlay;

}


function ensureMenuButton() {

    const topbarLeft =
        document.querySelector(
            '.technician-topbar-left'
        );


    if (!topbarLeft) {

        return null;

    }


    let button =
        document.getElementById(
            'technicianMenuButton'
        );


    if (button) {

        return button;

    }


    button =
        document.createElement(
            'button'
        );


    button.id =
        'technicianMenuButton';

    button.className =
        'technician-menu-button';

    button.type =
        'button';

    button.setAttribute(
        'aria-label',
        'Abrir menú'
    );

    button.setAttribute(
        'aria-controls',
        'technicianSidebar'
    );

    button.setAttribute(
        'aria-expanded',
        'false'
    );

    button.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;


    topbarLeft.prepend(
        button
    );


    return button;

}


function setSidebarState(
    open
) {

    document.body.classList.toggle(
        'technician-sidebar-open',
        open
    );


    document
        .getElementById(
            'technicianMenuButton'
        )
        ?.setAttribute(
            'aria-expanded',
            String(open)
        );

}


function closeSidebar() {

    setSidebarState(false);

}


function openSidebar() {

    setSidebarState(true);

}


async function handleLogout(
    event
) {

    const button =
        event.currentTarget;


    if (!(button instanceof HTMLButtonElement)) {

        return;

    }


    const originalText =
        button.textContent;


    button.disabled = true;
    button.textContent = 'Cerrando...';


    try {

        await logout();

        window.location.href =
            '../index.html';

    } catch (error) {

        console.error(
            'Error cerrando la sesión:',
            error
        );

        button.disabled = false;
        button.textContent =
            originalText;

        window.alert(
            'No fue posible cerrar la sesión. Intentá nuevamente.'
        );

    }

}


function bindEvents() {

    const overlay =
        ensureOverlay();

    const menuButton =
        ensureMenuButton();

    const closeButton =
        document.getElementById(
            'technicianSidebarClose'
        );

    const logoutButton =
        document.getElementById(
            'logoutButton'
        );


    menuButton?.addEventListener(
        'click',
        openSidebar
    );

    closeButton?.addEventListener(
        'click',
        closeSidebar
    );

    if (
        document.body.dataset.technicianLayoutLogout ===
        'true'
    ) {

        logoutButton?.addEventListener(
            'click',
            handleLogout
        );

    }

    overlay.addEventListener(
        'click',
        closeSidebar
    );


    document.addEventListener(
        'keydown',
        event => {

            if (
                event.key ===
                'Escape'
            ) {

                closeSidebar();

            }

        }
    );


    document
        .querySelectorAll(
            '.technician-nav-item'
        )
        .forEach(
            item => {

                item.addEventListener(
                    'click',
                    closeSidebar
                );

            }
        );

}


function initializeTechnicianLayout() {

    document.body.classList.add(
        'technician-layout-enabled'
    );

    renderSidebar();
    bindUserPresentation();
    bindEvents();

}


initializeTechnicianLayout();
