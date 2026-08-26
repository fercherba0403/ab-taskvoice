// ============================================================
// TASKVOICE
// admin-users-v1.js
// ============================================================

import { initAdminLayout } from "../components/admin-layout-v3.js";

import { getUsers } from "../services/users.js";

const searchInput = document.getElementById("usersSearch");

const roleFilter = document.getElementById("usersRoleFilter");

const statusFilter = document.getElementById("usersStatusFilter");

const clearFiltersButton = document.getElementById("usersClearFilters");

const countElement = document.getElementById("usersCount");

const loadingElement = document.getElementById("usersLoading");

const errorElement = document.getElementById("usersError");

const emptyElement = document.getElementById("usersEmpty");

const tableWrapper = document.getElementById("usersTableWrapper");

const tableBody = document.getElementById("usersTableBody");

let currentUsers = [];

function roleLabel(role) {
    const labels = {
        admin: "Administrador",
        supervisor: "Supervisor",
        trabajador: "Trabajador",
    };

    return labels[role] ?? role ?? "-";
}

function getInitials(user) {
    const first = user.nombre?.charAt(0)?.toUpperCase() ?? "";

    const last = user.apellido?.charAt(0)?.toUpperCase() ?? "";

    return `${first}${last}` || "U";
}

function createUserCell(user) {
    const cell = document.createElement("td");

    const container = document.createElement("div");

    container.className = "users-person";

    const avatar = document.createElement("span");

    avatar.className = "users-avatar";

    avatar.textContent = getInitials(user);

    const text = document.createElement("div");

    const name = document.createElement("strong");

    name.textContent =
        `${user.nombre ?? ""} ${user.apellido ?? ""}`.trim() || "Usuario";

    const id = document.createElement("small");

    id.textContent = user.id;

    text.append(name, id);

    container.append(avatar, text);

    cell.append(container);

    return cell;
}

function createContactCell(user) {
    const cell = document.createElement("td");

    const container = document.createElement("div");

    container.className = "users-contact";

    const email = document.createElement("strong");

    email.textContent = user.email || "-";

    const phone = document.createElement("small");

    phone.textContent = user.telefono ? user.telefono : "Sin teléfono";

    container.append(email, phone);

    cell.append(container);

    return cell;
}

function createRoleCell(user) {
    const cell = document.createElement("td");

    const badge = document.createElement("span");

    badge.className = `users-role users-role-${user.rol ?? "neutral"}`;

    badge.textContent = roleLabel(user.rol);

    cell.append(badge);

    return cell;
}

function createStatusCell(user) {
    const cell = document.createElement("td");

    const badge = document.createElement("span");

    badge.className = user.activo
        ? "users-status users-status-active"
        : "users-status users-status-inactive";

    badge.textContent = user.activo ? "Activo" : "Inactivo";

    cell.append(badge);

    return cell;
}

function createActionCell(user) {
    const cell = document.createElement("td");

    const link = document.createElement("a");

    link.className = "users-detail-link";

    link.href = `./usuario-detalle.html?id=${encodeURIComponent(user.id)}`;

    link.textContent = "Gestionar";

    cell.append(link);

    return cell;
}

function getFilteredUsers() {
    const query = searchInput.value.trim().toLowerCase();

    const role = roleFilter.value;

    const status = statusFilter.value;

    return currentUsers.filter((user) => {
        if (role && user.rol !== role) {
            return false;
        }

        if (status === "active" && user.activo !== true) {
            return false;
        }

        if (status === "inactive" && user.activo !== false) {
            return false;
        }

        if (!query) {
            return true;
        }

        const haystack = [user.nombre, user.apellido, user.email, user.telefono]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return haystack.includes(query);
    });
}

function renderUsers() {
    const users = getFilteredUsers();

    tableBody.replaceChildren();

    loadingElement.classList.add("hidden");

    errorElement.classList.add("hidden");

    const total = currentUsers.length;

    const filtered = users.length;

    countElement.textContent =
        filtered === total
            ? total === 1
                ? "1 usuario"
                : `${total} usuarios`
            : `${filtered} de ${total} usuarios`;

    if (users.length === 0) {
        tableWrapper.classList.add("hidden");

        emptyElement.classList.remove("hidden");

        return;
    }

    emptyElement.classList.add("hidden");

    tableWrapper.classList.remove("hidden");

    for (const user of users) {
        const row = document.createElement("tr");

        row.append(
            createUserCell(user),
            createContactCell(user),
            createRoleCell(user),
            createStatusCell(user),
            createActionCell(user),
        );

        tableBody.append(row);
    }
}

async function loadUsers() {
    loadingElement.classList.remove("hidden");

    errorElement.classList.add("hidden");

    emptyElement.classList.add("hidden");

    tableWrapper.classList.add("hidden");

    try {
        currentUsers = await getUsers();

        renderUsers();
    } catch (error) {
        console.error("Error cargando usuarios:", error);

        loadingElement.classList.add("hidden");

        errorElement.textContent =
            error?.message || "No fue posible cargar los usuarios.";

        errorElement.classList.remove("hidden");

        countElement.textContent = "Sin datos";
    }
}

searchInput.addEventListener("input", renderUsers);

roleFilter.addEventListener("change", renderUsers);

statusFilter.addEventListener("change", renderUsers);

clearFiltersButton.addEventListener("click", () => {
    searchInput.value = "";

    roleFilter.value = "";

    statusFilter.value = "";

    renderUsers();
});

async function initialize() {
    const profile = await initAdminLayout({
        activePage: "usuarios",

        title: "Usuarios",

        subtitle: "Administración de cuentas y accesos",

        action: {
            href: "./usuario-nuevo.html",
            label: "Nuevo usuario",
            icon: "+",
        },
    });

    if (!profile) {
        return;
    }

    if (profile.rol !== "admin") {
        window.location.replace("./dashboard.html");

        return;
    }

    await loadUsers();
}

initialize();
