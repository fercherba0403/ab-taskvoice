// ============================================================
// AB TASKVOICE
// technician-layout-v1.js
//
// Navegación compartida del Panel Técnico.
//
// IMPORTANTE:
// - No decide permisos.
// - No reemplaza requireRole().
// - Solo administra navegación / sidebar / menú móvil.
// ============================================================

const ICONS = {

    tasks: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5h11M9 12h11M9 19h11"></path>
            <path d="M4 5h.01M4 12h.01M4 19h.01"></path>
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
                AB
            </div>

            <div class="technician-sidebar-brand">

                <strong>
                    AB TaskVoice
                </strong>

                <span>
                    Panel Técnico
                </span>

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


        <div class="technician-sidebar-section-label">
            Operación
        </div>


        <nav
            class="technician-nav"
            aria-label="Navegación del Técnico"
        >
            ${navigation}
        </nav>


        <div class="technician-sidebar-footer">

            <span class="technician-sidebar-role">
                Técnico
            </span>

            <small>
                Acceso personal y operativo
            </small>

        </div>

    `;

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

    const brand =
        document.querySelector(
            '.worker-topbar .worker-brand'
        );


    if (!brand) {

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

    button.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;


    brand.prepend(
        button
    );


    return button;

}


function closeSidebar() {

    document.body.classList.remove(
        'technician-sidebar-open'
    );

}


function openSidebar() {

    document.body.classList.add(
        'technician-sidebar-open'
    );

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


    menuButton?.addEventListener(
        'click',
        openSidebar
    );


    closeButton?.addEventListener(
        'click',
        closeSidebar
    );


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

    bindEvents();

}


initializeTechnicianLayout();
