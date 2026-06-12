const fallbackServices = [
  { id: "medicine", title: "Medicine Store", icon: "pill", accent: "purple", summary: "Medicine delivery, prescription upload, and nearby pharmacy connection.", features: ["Medicine delivery", "Prescription upload", "Nearby pharmacy connection"] },
  { id: "medical-tests", title: "Medical Tests", icon: "test-tube-2", accent: "blue", summary: "Home blood test, lab test booking, and report download.", features: ["Home blood test", "Lab test booking", "Report download"] },
  { id: "health-records", title: "Health Records", icon: "folder-heart", accent: "green", summary: "Online prescriptions, report history, and digital health profile.", features: ["Online prescriptions", "Reports history", "Digital health profile"] },
  { id: "subscriptions", title: "Subscription Plans", icon: "badge-percent", accent: "orange", summary: "Monthly healthcare membership and discounted services.", features: ["Monthly membership", "Discounted services", "Priority booking"] },
  { id: "fitness", title: "Fitness & Wellness", icon: "dumbbell", accent: "green", summary: "Diet plans, fitness consultation, and weight management.", features: ["Diet plans", "Fitness consultation", "Weight management"] },
  { id: "mental-health", title: "Mental Health", icon: "brain", accent: "purple", summary: "Online counselor and stress/anxiety consultation.", features: ["Online counselor", "Stress consultation", "Anxiety consultation"] },
  { id: "women-child", title: "Women & Child Care", icon: "baby", accent: "pink", summary: "Pregnancy support, vaccination reminders, and child specialist booking.", features: ["Pregnancy support", "Vaccination reminders", "Child specialist booking"] },
  { id: "elderly-care", title: "Elderly Care", icon: "hand-heart", accent: "blue", summary: "Home nurse booking and senior citizen care plans.", features: ["Home nurse booking", "Senior care plans", "Vitals follow-up"] },
  { id: "notifications", title: "Smart Notifications", icon: "bell-ring", accent: "orange", summary: "Medicine reminders and appointment reminders.", features: ["Medicine reminders", "Appointment reminders", "Follow-up alerts"] },
  { id: "languages", title: "Multi-language Support", icon: "languages", accent: "purple", summary: "Hindi, English, and regional language assistance.", features: ["Hindi", "English", "Regional languages"] },
  { id: "student-plans", title: "Student Health Plans", icon: "graduation-cap", accent: "green", summary: "Affordable healthcare plans for students.", features: ["Low-cost consults", "Campus health plans", "Student discounts"] },
  { id: "blood-services", title: "Blood Services", icon: "droplets", accent: "pink", summary: "Blood donor network and emergency blood request.", features: ["Blood donor network", "Emergency blood request", "Blood group matching"] },
  { id: "nearby", title: "Nearby Services", icon: "radar", accent: "blue", summary: "Nearby hospitals, labs, and pharmacies tracking.", features: ["Nearby hospitals", "Nearby labs", "Nearby pharmacies"] }
];

const fallbackProviders = [
  { id: "h-1", type: "hospital", name: "Guwahati Care Hospital", area: "GS Road", distanceKm: 2.4, open: true, tags: ["Bed Support Preview", "ICU Desk", "Emergency Alert"] },
  { id: "h-2", type: "hospital", name: "Disha HealthQ Multi Speciality", area: "Dispur", distanceKm: 4.1, open: true, tags: ["ICU Preview", "Trauma Desk", "Bed Alerts"] },
  { id: "l-1", type: "lab", name: "City Diagnostics Lab", area: "Beltola", distanceKm: 1.8, open: true, tags: ["Blood Test", "Home Sample", "Reports"] },
  { id: "l-2", type: "lab", name: "North East Lab Care", area: "Ganeshguri", distanceKm: 3.2, open: true, tags: ["Lab Booking", "CBC", "Thyroid"] },
  { id: "p-1", type: "pharmacy", name: "Apollo Pharmacy", area: "Six Mile", distanceKm: 1.2, open: true, tags: ["Delivery", "Prescription", "24/7"] },
  { id: "b-1", type: "blood", name: "Emergency Blood Donor Network", area: "Guwahati", distanceKm: 2.9, open: true, tags: ["A+", "O-", "Urgent"] }
];

const state = {
  services: fallbackServices,
  providers: fallbackProviders,
  filteredType: "all",
  location: null
};

const serviceGrid = document.querySelector("#serviceGrid");
const serviceRequestType = document.querySelector("#serviceRequestType");
const nearbyProviderGrid = document.querySelector("#nearbyProviderGrid");
const locationStatus = document.querySelector("[data-location-status]");
const locationLabel = document.querySelector("[data-location-label]");
const toast = document.querySelector("#toast");

function initServicesPage() {
  loadServices();
  bindEvents();
  window.setTimeout(() => requestLocation(true), 900);

  if (window.lucide) {
    window.lucide.createIcons();
  } else {
    window.addEventListener("load", () => window.lucide && window.lucide.createIcons());
  }
}

async function loadServices() {
  try {
    const response = await fetch("/api/services");
    if (response.ok) {
      const payload = await response.json();
      state.services = payload.services || fallbackServices;
      state.providers = payload.nearbyProviders || fallbackProviders;
    }
  } catch {
    state.services = fallbackServices;
    state.providers = fallbackProviders;
  }

  renderServices();
  renderServiceOptions();
  renderNearby();
}

function renderServices() {
  serviceGrid.innerHTML = state.services.map((service) => `
    <article class="mega-service-card">
      <span class="hospital-icon ${service.accent}"><i data-lucide="${service.icon}"></i></span>
      <div>
        <h3>${escapeHtml(service.title)}</h3>
        <p>${escapeHtml(service.summary)}</p>
      </div>
      <ul>
        ${service.features.map((feature) => `<li><i data-lucide="check-circle-2"></i>${escapeHtml(feature)}</li>`).join("")}
      </ul>
      <button type="button" data-service-pick="${service.id}" data-service-title="${escapeHtml(service.title)}">Request Service <i data-lucide="arrow-right"></i></button>
    </article>
  `).join("");

  serviceGrid.querySelectorAll("[data-service-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      serviceRequestType.value = button.dataset.servicePick;
      showServiceLaunchMessage(button.dataset.serviceTitle || "This service");
    });
  });

  refreshIcons();
}

function renderServiceOptions() {
  serviceRequestType.innerHTML = state.services.map((service) => (
    `<option value="${service.id}">${escapeHtml(service.title)}</option>`
  )).join("");
}

function renderNearby() {
  const providers = state.providers.filter((provider) => state.filteredType === "all" || provider.type === state.filteredType);
  nearbyProviderGrid.innerHTML = providers.map((provider) => `
    <article class="nearby-provider-card">
      <div class="nearby-provider-head">
        <span class="hospital-logo ${providerColor(provider.type)}"><i data-lucide="${providerIcon(provider.type)}"></i></span>
        <div>
          <strong>${escapeHtml(provider.name)}</strong>
          <small>${escapeHtml(provider.area)} - ${provider.distanceKm} km away</small>
        </div>
        <em class="${provider.open ? "open" : ""}">${provider.open ? "Open" : "Closed"}</em>
      </div>
      <div class="provider-tags">
        ${provider.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
      </div>
      <button type="button" data-provider-request="${provider.name}">Connect Now</button>
    </article>
  `).join("");

  nearbyProviderGrid.querySelectorAll("[data-provider-request]").forEach((button) => {
    button.addEventListener("click", () => {
      showServiceLaunchMessage(button.dataset.providerRequest || "Nearby service");
    });
  });

  refreshIcons();
}

function bindEvents() {
  document.querySelectorAll("[data-location-request]").forEach((button) => {
    button.addEventListener("click", () => requestLocation(false));
  });

  document.querySelectorAll("[data-nearby-filter] button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-nearby-filter] button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filteredType = button.dataset.type || "all";
      renderNearby();
    });
  });

  document.querySelectorAll("[data-language-options] button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-language-options] button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      showToast(`${button.dataset.lang} selected.`);
    });
  });

  document.querySelector("[data-service-login]")?.addEventListener("click", () => {
    const patient = window.confirm("Patient login stays on the patient website. Press Cancel to open Doctor Login.");
    if (patient) {
      window.location.href = "index.html#home";
    } else {
      window.location.href = "doctor-login.html";
    }
  });

  document.querySelector("#prescriptionUpload")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    document.querySelector("#prescriptionFileName").textContent = file ? file.name : "Choose prescription file";
    if (file) showServiceLaunchMessage("Prescription upload");
  });

  document.querySelector("#serviceRequestForm")?.addEventListener("submit", submitServiceRequest);
}

function requestLocation(isAutomatic) {
  if (!navigator.geolocation) {
    updateLocationUi("Location is not supported in this browser.", false);
    return;
  }

  updateLocationUi(isAutomatic ? "Requesting location permission..." : "Waiting for location permission...", false);

  navigator.geolocation.getCurrentPosition(async (position) => {
    state.location = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
    updateLocationUi("Location allowed. Nearby services updated.", true);

    try {
      const response = await fetch("/api/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.location)
      });
      if (response.ok) {
        const payload = await response.json();
        state.providers = payload.nearby || state.providers;
        renderNearby();
      }
    } catch {
      renderNearby();
    }
  }, () => {
    updateLocationUi("Location permission not allowed. Showing Guwahati defaults.", false);
  }, {
    enableHighAccuracy: true,
    timeout: 8000,
    maximumAge: 60000
  });
}

async function submitServiceRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const selectedService = state.services.find((service) => service.id === serviceRequestType.value) || state.services[0];
  const payload = {
    serviceId: selectedService.id,
    serviceTitle: `${selectedService.title} Interest`,
    name: document.querySelector("#serviceUserName").value.trim() || "Guest User",
    phone: document.querySelector("#serviceUserPhone").value.trim(),
    note: [
      "Service interest captured. Full booking is opening soon.",
      document.querySelector("#serviceNote").value.trim()
    ].filter(Boolean).join(" | "),
    location: state.location
  };

  try {
    const response = await fetch("/api/service-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Request failed");
    const result = await response.json().catch(() => null);
    showServiceLaunchMessage(selectedService.title, `We saved your interest. Tracking ID: ${result?.request?.trackingId || "created"}`);
    try {
      form.reset();
      renderServiceOptions();
    } catch {
      // The request has already been accepted by the backend.
    }
  } catch {
    showServiceLaunchMessage(selectedService.title);
  }
}

function showServiceLaunchMessage(serviceTitle, extra = "") {
  const title = String(serviceTitle || "This service").replace(/\s+/g, " ").trim();
  const message = extra || `${title} booking is opening soon. Doctor appointments are live right now.`;
  showToast(message);
  document.querySelector("#service-request")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateLocationUi(message, allowed) {
  if (locationStatus) locationStatus.textContent = message;
  if (locationLabel) locationLabel.textContent = allowed ? "Location Allowed" : "Allow Location";
  if (allowed) showToast("Location allowed. Nearby tracking updated.");
}

function providerIcon(type) {
  return {
    hospital: "hospital",
    lab: "test-tube-2",
    pharmacy: "pill",
    blood: "droplets"
  }[type] || "map-pin";
}

function providerColor(type) {
  return {
    hospital: "blue",
    lab: "green",
    pharmacy: "purple",
    blood: "pink"
  }[type] || "purple";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

initServicesPage();
