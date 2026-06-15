const seedDoctors = [];
const PUBLIC_WEBSITE_HOSTS = new Set(["dishahealthq.in", "www.dishahealthq.in"]);
const IS_PUBLIC_WEBSITE_ADMIN = PUBLIC_WEBSITE_HOSTS.has(window.location.hostname);
const API_BASE = "";

const state = {
  doctors: [],
  audit: [],
  loading: true,
  authenticated: false,
  csrfToken: null
};

let adminEvents = null;

const loginSection = document.querySelector("#adminLogin");
const appEl = document.querySelector("#adminApp");
const loginForm = document.querySelector("#adminLoginForm");
const loginMessage = document.querySelector("#adminLoginMessage");
const listEl = document.querySelector("#adminDoctorList");
const auditEl = document.querySelector("#auditLog");
const searchInput = document.querySelector("#searchInput");
const statusFilter = document.querySelector("#statusFilter");
const specialtyFilter = document.querySelector("#specialtyFilter");
const resultCount = document.querySelector("#resultCount");
const toast = document.querySelector("#toast");
const adminUserButton = document.querySelector(".admin-user");

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path}`;
}

function apiCredentials() {
  return API_BASE ? "include" : "same-origin";
}

function init() {
  if (IS_PUBLIC_WEBSITE_ADMIN) {
    blockPublicAdminHost();
    return;
  }

  bindEvents();
  checkSession();

  if (window.lucide) {
    window.lucide.createIcons();
  } else {
    window.addEventListener("load", () => window.lucide && window.lucide.createIcons());
  }
}

function blockPublicAdminHost() {
  if (appEl) appEl.hidden = true;
  if (loginSection) loginSection.hidden = false;
  if (adminUserButton) {
    adminUserButton.disabled = true;
    adminUserButton.innerHTML = `<i data-lucide="shield-check"></i> Render Admin Only`;
  }
  if (loginForm) {
    loginForm.innerHTML = `
      <span class="eyebrow">Admin access disabled here</span>
      <h1>Admin moved to backend</h1>
      <p>This public website copy does not connect to admin APIs. Keep admin files only on the Render backend deployment.</p>
      <small id="adminLoginMessage" role="status" aria-live="polite">Delete admin.html, admin.css and admin.js from Hostinger public_html.</small>
    `;
  }
  refreshIcons();
}

async function checkSession() {
  try {
    const response = await fetch(apiUrl("/api/admin/session"), { credentials: apiCredentials() });
    const payload = await response.json();
    if (payload.authenticated) {
      state.authenticated = true;
      state.csrfToken = payload.csrfToken;
      showApp();
      renderLoading();
      await loadAdminData();
      connectLiveEvents();
    } else {
      showLogin();
    }
  } catch {
    showLogin("Backend not connected.");
  }
}

function showLogin(message = "") {
  state.authenticated = false;
  state.csrfToken = null;
  if (adminEvents) {
    adminEvents.close();
    adminEvents = null;
  }
  if (appEl) appEl.hidden = true;
  if (loginSection) loginSection.hidden = false;
  if (loginMessage) loginMessage.textContent = message;
  if (adminUserButton) {
    adminUserButton.disabled = true;
    adminUserButton.innerHTML = `<i data-lucide="shield-check"></i> Admin Panel`;
  }
  refreshIcons();
}

function showApp() {
  if (loginSection) loginSection.hidden = true;
  if (appEl) appEl.hidden = false;
  if (adminUserButton) {
    adminUserButton.disabled = false;
    adminUserButton.innerHTML = `<i data-lucide="log-out"></i> Logout`;
  }
  refreshIcons();
}

async function apiFetch(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!["GET", "HEAD"].includes(method) && state.csrfToken) {
    headers.set("X-CSRF-Token", state.csrfToken);
  }
  const response = await fetch(apiUrl(url), {
    ...options,
    method,
    headers,
    credentials: apiCredentials()
  });
  if (response.status === 401) {
    showLogin("Session expired. Login again.");
    throw new Error("Unauthorized");
  }
  return response;
}

async function loadAdminData(showMessage = false) {
  try {
    const response = await apiFetch("/api/admin/doctors");
    if (!response.ok) throw new Error("Backend unavailable");
    const payload = await response.json();
    applySnapshot(payload);
    if (showMessage) showToast("Live admin data refreshed.");
  } catch {
    state.loading = false;
    if (!state.doctors.length) {
      listEl.innerHTML = `<article class="admin-card"><div><h3>Backend not connected</h3><p>Start the Node backend with <strong>node server.js</strong> and refresh this page.</p></div></article>`;
      auditEl.innerHTML = `<div class="audit-item"><strong>Waiting for backend</strong><span>Start the backend, then open /admin.html on the same host.</span></div>`;
    }
    showToast("Backend not connected.");
  }
}

function applySnapshot(payload) {
  state.doctors = payload.doctors || [];
  state.audit = payload.audit || [];
  state.loading = false;
  populateSpecialties();
  render();
}

function connectLiveEvents() {
  if (!window.EventSource) return;
  if (adminEvents) adminEvents.close();
  adminEvents = new EventSource(apiUrl("/api/admin/events"), { withCredentials: Boolean(API_BASE) });
  adminEvents.addEventListener("connected", (event) => {
    applySnapshot(JSON.parse(event.data));
  });
  adminEvents.addEventListener("doctors-updated", (event) => {
    applySnapshot(JSON.parse(event.data));
    showToast("Live doctor data updated.");
  });
  adminEvents.onerror = () => {
    // Browser reconnects EventSource automatically.
  };
}

function populateSpecialties() {
  const currentValue = specialtyFilter.value || "all";
  const specialties = [...new Set(state.doctors.map((doctor) => doctor.specialty))].sort();
  specialtyFilter.innerHTML = `<option value="all">All specialties</option>${specialties.map((specialty) => `<option value="${specialty}">${specialty}</option>`).join("")}`;
  specialtyFilter.value = specialties.includes(currentValue) ? currentValue : "all";
}

function bindEvents() {
  loginForm?.addEventListener("submit", loginAdmin);

  adminUserButton?.addEventListener("click", () => {
    if (state.authenticated) logoutAdmin();
  });

  [searchInput, statusFilter, specialtyFilter].forEach((input) => {
    input.addEventListener("input", render);
    input.addEventListener("change", render);
  });

  document.querySelector("#approveAllBtn").addEventListener("click", async () => {
    try {
      const response = await apiFetch("/api/admin/doctors/bulk-approve", { method: "POST" });
      if (!response.ok) throw new Error("Approve failed");
      const payload = await response.json();
      applySnapshot(payload);
      showToast(`${payload.changed || 0} pending doctors approved.`);
    } catch {
      showToast("Approve failed. Backend not connected.");
    }
  });

  document.querySelector("#resetBtn").addEventListener("click", async () => {
    try {
      const response = await apiFetch("/api/admin/doctors/reset", { method: "POST" });
      if (!response.ok) throw new Error("Reset failed");
      const payload = await response.json();
      applySnapshot(payload);
      showToast("Backend doctor data reset.");
    } catch {
      showToast("Reset failed. Backend not connected.");
    }
  });
}

async function loginAdmin(event) {
  event.preventDefault();
  if (loginMessage) loginMessage.textContent = "";
  const submitButton = loginForm.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch(apiUrl("/api/admin/session"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: apiCredentials(),
      body: JSON.stringify({
        username: document.querySelector("#adminUsername").value.trim(),
        password: document.querySelector("#adminPassword").value
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.authenticated) {
      throw new Error(payload.message || "Login failed.");
    }
    state.authenticated = true;
    state.csrfToken = payload.csrfToken;
    loginForm.reset();
    showApp();
    renderLoading();
    await loadAdminData();
    connectLiveEvents();
    showToast("Admin login successful.");
  } catch (error) {
    if (loginMessage) loginMessage.textContent = error.message || "Login failed.";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function logoutAdmin() {
  try {
    await apiFetch("/api/admin/session", { method: "DELETE" });
  } catch {
    // The local UI still needs to clear the session state.
  }
  showLogin("Logged out.");
  showToast("Logged out.");
}

function renderLoading() {
  listEl.innerHTML = `<article class="admin-card"><div><h3>Loading live doctor data</h3><p>Connecting to Disha HealthQ backend...</p></div></article>`;
  auditEl.innerHTML = `<div class="audit-item"><strong>Connecting</strong><span>Live backend sync starting</span></div>`;
}

function render() {
  renderMetrics();
  renderDoctors();
  renderAudit();
  refreshIcons();
}

function renderMetrics() {
  document.querySelector("#pendingCount").textContent = countByStatus("pending");
  document.querySelector("#approvedCount").textContent = countByStatus("approved");
  document.querySelector("#rejectedCount").textContent = countByStatus("rejected");
  document.querySelector("#liveCount").textContent = countByStatus("approved");
}

function countByStatus(status) {
  return state.doctors.filter((doctor) => doctor.status === status).length;
}

function getFilteredDoctors() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const specialty = specialtyFilter.value;

  return state.doctors.filter((doctor) => {
    const haystack = `${doctor.name} ${doctor.specialty} ${doctor.city} ${doctor.license}`.toLowerCase();
    const queryOk = !query || haystack.includes(query);
    const statusOk = status === "all" || doctor.status === status;
    const specialtyOk = specialty === "all" || doctor.specialty === specialty;
    return queryOk && statusOk && specialtyOk;
  });
}

function renderDoctors() {
  if (state.loading) return;
  const doctors = getFilteredDoctors();
  resultCount.textContent = `${doctors.length} result${doctors.length === 1 ? "" : "s"}`;

  if (!doctors.length) {
    listEl.innerHTML = `<article class="admin-card"><div><h3>No doctors found</h3><p>Try another filter or reset backend doctor data.</p></div></article>`;
    return;
  }

  listEl.innerHTML = doctors.map((doctor) => {
    const status = ["pending", "approved", "rejected"].includes(doctor.status) ? doctor.status : "pending";
    const isLive = status === "approved";
    const visibilityLabel = isLive ? "Live on website" : "Hidden from website";
    const visibilityIcon = isLive ? "globe-2" : "eye-off";
    const id = escapeHtml(doctor.id);
    const name = escapeHtml(doctor.name);
    const image = escapeHtml(safeImageUrl(doctor.image));

    return `
    <article class="admin-card status-${status}">
      <img src="${image}" alt="${name}" loading="lazy" />
      <div>
        <div class="doctor-head">
          <h3>${name}</h3>
          <span class="pill ${status}">${status}</span>
          <span class="visibility-note ${isLive ? "live" : "hidden"}"><i data-lucide="${visibilityIcon}"></i>${visibilityLabel}</span>
        </div>
        <div class="doctor-meta">
          <span>${id}</span>
          <span>${escapeHtml(doctor.specialty)}</span>
          <span>${escapeHtml(doctor.city)}</span>
          <span>${escapeHtml(doctor.experience)}</span>
          <span>${escapeHtml(doctor.fee)}</span>
          <span>License: ${escapeHtml(doctor.license)}</span>
        </div>
        <p>Review documents and approve only after license, identity and practice address checks are complete.</p>
        <div class="doctor-docs">
          ${(doctor.docs || []).map((doc) => `<span><i data-lucide="file-check-2"></i>${escapeHtml(doc)}</span>`).join("")}
        </div>
      </div>
      <div class="doctor-actions">
        <button class="approve-btn" type="button" data-action="approved" data-id="${id}" ${status === "approved" ? "disabled" : ""}>${status === "approved" ? "Live Now" : "Approve"}</button>
        <button class="reject-btn" type="button" data-action="rejected" data-id="${id}" ${status === "rejected" ? "disabled" : ""}>${status === "rejected" ? "Rejected" : "Reject"}</button>
        <button class="neutral-btn" type="button" data-action="pending" data-id="${id}" ${status === "pending" ? "disabled" : ""}>${status === "pending" ? "Pending" : "Mark Pending"}</button>
      </div>
    </article>
  `;
  }).join("");

  listEl.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.id, button.dataset.action));
  });
}

async function handleAction(id, action) {
  const doctor = state.doctors.find((item) => item.id === id);
  if (!doctor) return;

  const body = {
    status: action,
    auditMessage: `${capitalize(action)} ${doctor.name}`
  };

  try {
    const response = await apiFetch(`/api/admin/doctors/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error("Update failed");
    const payload = await response.json();
    applySnapshot(payload);
    showToast(statusMessage(doctor.name, action));
  } catch {
    showToast("Update failed. Backend not connected.");
  }
}

function statusMessage(name, action) {
  if (action === "approved") return `${name} approved. Now visible on website.`;
  if (action === "rejected") return `${name} rejected. Hidden from website.`;
  return `${name} moved to pending. Hidden from website.`;
}

function renderAudit() {
  if (!state.audit.length) {
    auditEl.innerHTML = `<div class="audit-item"><strong>No actions yet</strong><span>Start reviewing doctors</span></div>`;
    return;
  }

  auditEl.innerHTML = state.audit.slice(0, 8).map((item) => `
    <div class="audit-item">
      <strong>${escapeHtml(item.message)}</strong>
      <span>${escapeHtml(item.time)}</span>
    </div>
  `).join("");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value), window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

init();
