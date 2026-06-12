let doctors = [];

const state = {
  specialty: "All",
  selectedDoctor: null,
  heroIndex: 0,
  appointment: null,
  micOn: true,
  cameraOn: false,
  localStream: null,
  peerConnection: null,
  remoteStream: null,
  roomEvents: null,
  roomPollTimer: null,
  pendingCandidates: [],
  seenMessages: new Set(),
  processedSignals: new Set(),
  role: "patient"
};

const doctorGrid = document.querySelector("#doctorGrid");
const specialtySelect = document.querySelector("#specialtySelect");
const doctorSearch = document.querySelector("#doctorSearch");
const doctorToolbar = document.querySelector("#doctorToolbar");
const doctorSectionSearch = document.querySelector("#doctorSectionSearch");
const doctorSectionSpecialty = document.querySelector("#doctorSectionSpecialty");
const drawer = document.querySelector("#bookingDrawer");
const drawerDoctor = document.querySelector("#drawerDoctor");
const drawerSubtitle = document.querySelector("#drawerSubtitle");
const toast = document.querySelector("#toast");
const heroArt = document.querySelector(".hero-art");
const heroDoctorButton = document.querySelector("#heroDoctorButton");
const heroDoctorImage = document.querySelector("#heroDoctorImage");
const locationLabel = document.querySelector("[data-location-label]");
const consultRoom = document.querySelector("#consultRoom");
const consultClose = document.querySelector("#consultClose");
const consultDoctorName = document.querySelector("#consultDoctorName");
const consultSummary = document.querySelector("#consultSummary");
const consultDoctorImage = document.querySelector("#consultDoctorImage");
const consultDoctorLabel = document.querySelector("#consultDoctorLabel");
const consultRoomId = document.querySelector("#consultRoomId");
const callStatus = document.querySelector("#callStatus");
const patientVideo = document.querySelector("#patientVideo");
const patientFallback = document.querySelector("#patientFallback");
const patientInitials = document.querySelector("#patientInitials");
const chatMessages = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const joinCallButton = document.querySelector("#joinCallButton");
const toggleMicButton = document.querySelector("#toggleMicButton");
const toggleCameraButton = document.querySelector("#toggleCameraButton");
const endCallButton = document.querySelector("#endCallButton");
const confirmBookingButton = document.querySelector("#confirmBookingButton");

const heroDoctors = [
  {
    src: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=760&q=90",
    alt: "Smiling doctor in white coat"
  },
  {
    src: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=760&q=90",
    alt: "Doctor ready for patient consultation"
  },
  {
    src: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=760&q=90",
    alt: "Smiling woman doctor in scrubs"
  },
  {
    src: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=760&q=90",
    alt: "Friendly doctor with stethoscope"
  }
];

function init() {
  preloadHeroDoctors();
  applyInitialDoctorFilters();
  renderDoctors();
  bindEvents();
  loadDoctorsFromBackend();
  connectDoctorLiveEvents();
  renderLastConsultationShortcut();
  startHeroDoctorRotation();
  window.setTimeout(() => requestUserLocation(true), 1200);

  if (window.lucide) {
    window.lucide.createIcons();
  } else {
    window.addEventListener("load", () => window.lucide && window.lucide.createIcons());
  }
}

function saveLastAppointment(appointment) {
  try {
    localStorage.setItem("dhq:lastAppointment", JSON.stringify(appointment));
  } catch {
    // Local storage can be disabled; live room still opens immediately.
  }
}

function getLastAppointment() {
  try {
    const appointment = JSON.parse(localStorage.getItem("dhq:lastAppointment") || "null");
    return appointment?.roomId && appointment?.consultToken ? appointment : null;
  } catch {
    return null;
  }
}

function consultationUrl(roomId, suffix = "", appointment = state.appointment) {
  const base = `/api/consultations/${encodeURIComponent(roomId)}${suffix}`;
  const token = appointment?.consultToken;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

function consultationHeaders(headers = {}, appointment = state.appointment) {
  const token = appointment?.consultToken;
  return token ? { ...headers, "x-consult-token": token } : headers;
}

function renderLastConsultationShortcut() {
  if (document.querySelector("#lastConsultationShortcut")) return;
  const appointment = getLastAppointment();
  if (!appointment) return;
  const button = document.createElement("button");
  button.className = "last-consultation-shortcut";
  button.id = "lastConsultationShortcut";
  button.type = "button";
  button.innerHTML = `<i data-lucide="messages-square"></i><span>Open VC / Chat</span><small>${escapeHtml(appointment.doctorName || "Doctor")}</small>`;
  button.addEventListener("click", () => openConsultationRoom(appointment));
  document.body.appendChild(button);
  refreshIcons();
}

function applyInitialDoctorFilters() {
  const params = new URLSearchParams(window.location.search);
  const specialty = params.get("specialty");
  const query = params.get("q");
  if (specialty) state.specialty = specialty;
  if (query) {
    if (doctorSearch) doctorSearch.value = query;
    if (doctorSectionSearch) doctorSectionSearch.value = query;
  }
  if (specialtySelect) specialtySelect.value = state.specialty;
  if (doctorSectionSpecialty) doctorSectionSpecialty.value = state.specialty;
}

function preloadHeroDoctors() {
  heroDoctors.forEach((doctor) => {
    const image = new Image();
    image.src = doctor.src;
  });
}

function changeHeroDoctor(direction = 1) {
  if (!heroDoctorImage) return;

  state.heroIndex = (state.heroIndex + direction + heroDoctors.length) % heroDoctors.length;
  const doctor = heroDoctors[state.heroIndex];
  heroDoctorImage.classList.add("is-changing");

  window.setTimeout(() => {
    heroDoctorImage.addEventListener("load", () => {
      heroDoctorImage.classList.remove("is-changing");
    }, { once: true });
    heroDoctorImage.src = doctor.src;
    heroDoctorImage.alt = doctor.alt;
  }, 160);
}

function startHeroDoctorRotation() {
  if (!heroDoctorImage) return;
  window.setInterval(() => changeHeroDoctor(1), 4500);
}

async function loadDoctorsFromBackend(showToastMessage = false) {
  try {
    const response = await fetch("/api/doctors");
    if (!response.ok) throw new Error("Doctors API unavailable");
    const payload = await response.json();
    if (Array.isArray(payload.doctors) && payload.doctors.length) {
      doctors = payload.doctors.map(normalizePublicDoctor);
      state.selectedDoctor = doctors[0] || state.selectedDoctor;
      renderDoctors();
      if (showToastMessage) showToast("Doctor list updated live.");
    }
  } catch {
    doctors = [];
    renderDoctors();
    if (showToastMessage) showToast("Doctors backend unavailable.");
  }
}

function connectDoctorLiveEvents() {
  if (!window.EventSource) return;
  const events = new EventSource("/api/events");
  events.addEventListener("connected", (event) => {
    const payload = JSON.parse(event.data);
    if (Array.isArray(payload.publicDoctors) && payload.publicDoctors.length) {
      doctors = payload.publicDoctors.map(normalizePublicDoctor);
      renderDoctors();
    }
  });
  events.addEventListener("doctors-updated", (event) => {
    const payload = JSON.parse(event.data);
    doctors = (payload.publicDoctors || []).map(normalizePublicDoctor);
    renderDoctors();
    showToast("Doctor list updated live.");
  });
}

function normalizePublicDoctor(doctor) {
  const feeParts = String(doctor.fee || "").split(/\s+/);
  return {
    ...doctor,
    experience: doctor.experience || "8+ Years Experience",
    feeLabel: doctor.feeLabel || "FREE",
    feeAmount: doctor.feeAmount || "",
    originalFeeLabel: doctor.originalFeeLabel || feeParts[0] || "Rs",
    originalFeeAmount: doctor.originalFeeAmount || feeParts.slice(1).join(" ") || "699",
    discountLabel: doctor.discountLabel || "100% discount",
    nextSlot: doctor.nextSlot || "Today, 06:00 PM",
    image: doctor.image || "https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=320&q=85"
  };
}

function renderDoctors() {
  if (!doctorGrid) return;
  const query = (doctorSectionSearch?.value || doctorSearch?.value || "").trim().toLowerCase();
  const filtered = doctors.filter((doctor) => {
    const bySpecialty = state.specialty === "All" || doctor.specialty === state.specialty;
    const content = `${doctor.name} ${doctor.specialty}`.toLowerCase();
    return bySpecialty && (!query || content.includes(query));
  });
  const previewLimit = Number(doctorGrid.dataset.limit || 0);
  const visibleDoctors = previewLimit > 0 ? filtered.slice(0, previewLimit) : filtered;

  doctorGrid.innerHTML = visibleDoctors.map((doctor) => {
    const name = escapeHtml(doctor.name);
    const specialty = escapeHtml(doctor.specialty);
    const image = escapeHtml(safeImageUrl(doctor.image));
    const originalFee = `${doctor.originalFeeLabel || "Rs"} ${doctor.originalFeeAmount || "699"}`.trim();
    const offerFee = `${doctor.feeLabel || "FREE"} ${doctor.feeAmount || ""}`.trim();
    return `
    <article class="doctor-card">
      ${doctor.online ? `<span class="doctor-status"><span></span>Online</span>` : ""}
      <button class="favorite-button" type="button" aria-label="Save ${name}">
        <i data-lucide="heart"></i>
      </button>
      <div class="doctor-photo">
        <img src="${image}" alt="${name}" loading="lazy" />
      </div>
      <div class="doctor-info">
        <h3>${name} <i class="verified-badge" data-lucide="badge-check"></i></h3>
        <span class="specialty-pill"><i data-lucide="stethoscope"></i>${specialty}</span>
        <div class="doctor-assurance">
          <i data-lucide="shield-check"></i>
          <strong>Verified doctor</strong>
          <span>Approved for booking</span>
        </div>
        <small class="experience"><i data-lucide="briefcase-medical"></i>${escapeHtml(doctor.experience)}</small>
        <small class="next-slot"><i data-lucide="calendar-clock"></i>Next: <strong>${escapeHtml(doctor.nextSlot)}</strong></small>
      </div>
      <div class="doctor-bottom">
        <div class="doctor-fee">
          <span>Consultation Fee</span>
          <div class="fee-offer">
            <s>${escapeHtml(originalFee)}</s>
            <strong>${escapeHtml(offerFee)}</strong>
          </div>
          <em>${escapeHtml(doctor.discountLabel || "100% discount")}</em>
        </div>
        <button class="book-now" type="button" data-book="${name}">Book Appointment</button>
      </div>
    </article>
  `;
  }).join("");

  if (!previewLimit && filtered.length === doctors.length && !query && state.specialty === "All") {
    doctorGrid.insertAdjacentHTML("beforeend", `
      <article class="doctor-help-card">
        <span class="help-icon"><i data-lucide="shield-check"></i></span>
        <h3>Can't find the right doctor?</h3>
        <p>We can help you find the best specialist for your condition.</p>
        <button class="outline-purple" type="button" data-consult-help>
          Find My Doctor
          <i data-lucide="arrow-right"></i>
        </button>
      </article>
      <article class="doctor-perks-card">
        <div>
          <i data-lucide="shield-check"></i>
          <strong>100% Verified Doctors</strong>
          <small>All doctors are verified and experienced</small>
        </div>
        <div>
          <i data-lucide="calendar-days"></i>
          <strong>Easy Appointments</strong>
          <small>Book appointments in just a few clicks</small>
        </div>
        <div>
          <i data-lucide="lock-keyhole"></i>
          <strong>Secure & Safe</strong>
          <small>Your data is protected and 100% secure</small>
        </div>
        <div>
          <i data-lucide="headphones"></i>
          <strong>24/7 Support</strong>
          <small>We are here to help you anytime</small>
        </div>
      </article>
    `);
  }

  if (!filtered.length) {
    doctorGrid.innerHTML = `<article class="doctor-empty"><h3>No doctors found</h3><p>Try another specialty or search term.</p></article>`;
  }

  doctorGrid.querySelectorAll("[data-book]").forEach((button) => {
    button.addEventListener("click", () => openBooking(button.dataset.book));
  });

  doctorGrid.querySelector("[data-consult-help]")?.addEventListener("click", () => {
    showToast("Tell us your concern and we will match a specialist.");
  });

  refreshIcons();
}

function setSpecialty(value, shouldScroll = false) {
  state.specialty = value || "All";
  if (specialtySelect) specialtySelect.value = state.specialty;
  if (doctorSectionSpecialty) doctorSectionSpecialty.value = state.specialty;

  if (shouldScroll && doctorGrid?.dataset.limit) {
    const params = new URLSearchParams();
    if (state.specialty !== "All") params.set("specialty", state.specialty);
    const query = (doctorSearch?.value || doctorSectionSearch?.value || "").trim();
    if (query) params.set("q", query);
    window.location.href = `doctors.html${params.toString() ? `?${params}` : ""}`;
    return;
  }

  renderDoctors();

  if (shouldScroll) {
    document.querySelector("#doctors")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function openBooking(doctorName) {
  const found = doctors.find((doctor) => doctor.name === doctorName) || doctors[0];
  if (!found) {
    showToast("Doctor backend data unavailable.");
    return;
  }
  state.selectedDoctor = found;
  drawerDoctor.textContent = found.name;
  if (drawerSubtitle) {
    drawerSubtitle.textContent = `${found.specialty || "Doctor"} - ${found.experience || "8+ Experience"}`;
  }
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
}

function closeBooking() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

async function createAppointment(payload) {
  const response = await fetch("/api/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.appointment) {
    throw new Error(result?.message || "Appointment booking failed.");
  }
  return result.appointment;
}

function openConsultationRoom(appointment) {
  state.appointment = appointment;
  state.micOn = true;
  state.cameraOn = false;
  stopLocalStream();

  consultDoctorName.textContent = appointment.doctorName;
  consultSummary.textContent = `${appointment.patientName}, your ${appointment.slot} appointment is confirmed. You can join VC or continue on chat.`;
  consultDoctorImage.src = safeImageUrl(appointment.doctorImage) || "assets/disha-healthq-logo-new.png?v=2";
  consultDoctorImage.alt = `${appointment.doctorName} video preview`;
  consultDoctorLabel.textContent = appointment.doctorName;
  consultRoomId.textContent = `Room ID: ${appointment.roomId}`;
  patientInitials.textContent = initials(appointment.patientName);
  updateCallStatus("Room ready. Join VC when you are ready.", false);
  updateCallButtons();
  connectConsultationBackend(appointment);

  consultRoom.classList.add("open");
  consultRoom.setAttribute("aria-hidden", "false");
  refreshIcons();
}

function closeConsultationRoom() {
  endCall();
  disconnectConsultationBackend();
  consultRoom.classList.remove("open");
  consultRoom.setAttribute("aria-hidden", "true");
}

function seedChat(appointment) {
  chatMessages.innerHTML = "";
  state.seenMessages.clear();
  fetch(consultationUrl(appointment.roomId, "", appointment), {
    headers: consultationHeaders({}, appointment)
  })
    .then((response) => response.ok ? response.json() : null)
    .then((payload) => {
      if (Array.isArray(payload?.messages)) {
        payload.messages.forEach((message) => addChatMessage(message.senderType, message.senderName, message.text, message.id));
      }
    })
    .catch(() => showToast("Consultation backend unavailable."));
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addChatMessage(type, sender, text, id = cryptoRandomId()) {
  if (state.seenMessages.has(id)) return;
  state.seenMessages.add(id);
  const message = document.createElement("div");
  message.className = `message ${type}`;
  const strong = document.createElement("strong");
  strong.textContent = sender;
  const span = document.createElement("span");
  span.textContent = text;
  message.append(strong, span);
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function connectConsultationBackend(appointment) {
  disconnectConsultationBackend();
  state.processedSignals.clear();
  seedChat(appointment);
  startConsultationPolling(appointment.roomId);
  if (!window.EventSource) return;

  const events = new EventSource(consultationUrl(appointment.roomId, "/events", appointment));
  state.roomEvents = events;
  events.addEventListener("connected", (event) => {
    const payload = JSON.parse(event.data);
    if (Array.isArray(payload.messages)) {
      payload.messages.forEach((message) => addChatMessage(message.senderType, message.senderName, message.text, message.id));
    }
    if (Array.isArray(payload.signals)) {
      payload.signals.forEach(processConsultSignal);
    }
  });
  events.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    addChatMessage(message.senderType, message.senderName, message.text, message.id);
  });
  events.addEventListener("signal", (event) => {
    processConsultSignal(JSON.parse(event.data));
  });
  events.onerror = () => updateCallStatus("Realtime room reconnecting...", Boolean(state.localStream));
}

function disconnectConsultationBackend() {
  stopConsultationPolling();
  if (state.roomEvents) {
    state.roomEvents.close();
    state.roomEvents = null;
  }
}

function startConsultationPolling(roomId) {
  stopConsultationPolling();
  if (!roomId) return;
  const pollRoom = async () => {
    if (state.appointment?.roomId !== roomId) return;
    try {
      const response = await fetch(consultationUrl(roomId), {
        headers: consultationHeaders()
      });
      const payload = response.ok ? await response.json() : null;
      if (!payload) return;
      (payload.messages || []).forEach((message) => addChatMessage(message.senderType, message.senderName, message.text, message.id));
      (payload.signals || []).forEach(processConsultSignal);
    } catch {
      // Polling is a fallback; SSE status already tells the user when realtime reconnects.
    }
  };
  pollRoom();
  state.roomPollTimer = window.setInterval(pollRoom, 1500);
}

function stopConsultationPolling() {
  if (!state.roomPollTimer) return;
  window.clearInterval(state.roomPollTimer);
  state.roomPollTimer = null;
}

async function sendConsultMessage(text) {
  if (!state.appointment?.roomId) return;
  const response = await fetch(`/api/consultations/${encodeURIComponent(state.appointment.roomId)}/messages`, {
    method: "POST",
    headers: consultationHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      senderType: "patient",
      senderName: state.appointment.patientName || "Patient",
      text
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.message) throw new Error(payload?.message || "Message send failed.");
  addChatMessage(payload.message.senderType, payload.message.senderName, payload.message.text, payload.message.id);
}

function cryptoRandomId() {
  return window.crypto?.randomUUID ? window.crypto.randomUUID() : `MSG-${Date.now()}-${Math.random()}`;
}

async function postConsultSignal(type, payload = null) {
  if (!state.appointment?.roomId) return;
  await fetch(`/api/consultations/${encodeURIComponent(state.appointment.roomId)}/signals`, {
    method: "POST",
    headers: consultationHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      type,
      senderType: state.role,
      payload
    })
  });
}

function createPeerConnection() {
  if (state.peerConnection) return state.peerConnection;
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  state.peerConnection = peer;

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      postConsultSignal("candidate", event.candidate).catch(() => {});
    }
  };

  peer.ontrack = (event) => {
    const [stream] = event.streams;
    if (stream) showRemoteStream(stream);
  };

  peer.onconnectionstatechange = () => {
    const stateLabel = peer.connectionState;
    if (stateLabel === "connected") updateCallStatus("Video call connected with doctor.", true);
    if (["failed", "disconnected"].includes(stateLabel)) updateCallStatus("Video call disconnected. Chat remains active.", false);
  };

  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => peer.addTrack(track, state.localStream));
  }
  return peer;
}

async function ensureLocalMedia() {
  if (state.localStream) return state.localStream;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Media devices unavailable");
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  state.localStream = stream;
  state.cameraOn = true;
  state.micOn = true;
  patientVideo.srcObject = stream;
  await patientVideo.play().catch(() => {});
  patientVideo.parentElement.classList.add("has-camera");
  if (state.peerConnection) {
    stream.getTracks().forEach((track) => state.peerConnection.addTrack(track, stream));
  }
  return stream;
}

async function sendOffer() {
  const peer = createPeerConnection();
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await postConsultSignal("offer", peer.localDescription);
}

async function flushPendingCandidates() {
  if (!state.peerConnection?.remoteDescription) return;
  const candidates = state.pendingCandidates.splice(0);
  for (const candidate of candidates) {
    try {
      await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Candidate can expire when the other side reconnects.
    }
  }
}

function processConsultSignal(signal) {
  if (!signal?.id || state.processedSignals.has(signal.id)) return;
  state.processedSignals.add(signal.id);
  handleConsultSignal(signal);
}

async function handleConsultSignal(signal) {
  if (!signal || signal.senderType === state.role) return;

  try {
    if (signal.type === "join" && state.localStream) {
      await sendOffer();
      return;
    }

    if (signal.type === "offer") {
      const peer = createPeerConnection();
      await ensureLocalMedia();
      await peer.setRemoteDescription(new RTCSessionDescription(signal.payload));
      await flushPendingCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await postConsultSignal("answer", peer.localDescription);
      updateCallStatus("Doctor joined. Video call connecting...", true);
      updateCallButtons();
      return;
    }

    if (signal.type === "answer" && state.peerConnection) {
      await state.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.payload));
      await flushPendingCandidates();
      updateCallStatus("Video call connected with doctor.", true);
      return;
    }

    if (signal.type === "candidate" && signal.payload) {
      if (state.peerConnection?.remoteDescription) {
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(signal.payload));
      } else {
        state.pendingCandidates.push(signal.payload);
      }
      return;
    }

    if (signal.type === "call-ended") {
      endCall(false);
      updateCallStatus("Doctor ended the video call. Chat remains active.", false);
    }
  } catch {
    updateCallStatus("Video signaling issue. Chat remains active.", false);
  }
}

function showRemoteStream(stream) {
  state.remoteStream = stream;
  const holder = document.querySelector(".doctor-video");
  if (!holder) return;
  let remoteVideo = holder.querySelector(".remote-video");
  if (!remoteVideo) {
    remoteVideo = document.createElement("video");
    remoteVideo.className = "remote-video";
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    holder.appendChild(remoteVideo);
  }
  remoteVideo.srcObject = stream;
  remoteVideo.play().catch(() => {});
  holder.classList.add("has-remote");
}

function closePeerConnection() {
  if (state.peerConnection) {
    state.peerConnection.close();
    state.peerConnection = null;
  }
  state.pendingCandidates = [];
  state.remoteStream = null;
  document.querySelectorAll(".remote-video").forEach((video) => {
    video.srcObject = null;
    video.remove();
  });
  document.querySelectorAll(".doctor-video.has-remote").forEach((holder) => holder.classList.remove("has-remote"));
}

async function joinCall() {
  if (state.localStream) {
    updateCallStatus("You are already connected with the doctor.", true);
    return;
  }

  updateCallStatus("Requesting camera and microphone permission...", false);

  try {
    await ensureLocalMedia();
    createPeerConnection();
    await postConsultSignal("join");
    await sendOffer();
    updateCallStatus("Waiting for doctor. Doctor must open this appointment and click Join VC.", true);
  } catch {
    state.localStream = null;
    state.cameraOn = false;
    state.micOn = false;
    patientVideo.parentElement.classList.remove("has-camera");
    updateCallStatus("Camera permission unavailable. Chat is active.", false);
  }

  updateCallButtons();
  refreshIcons();
}

function toggleMic() {
  state.micOn = !state.micOn;
  if (state.localStream) {
    state.localStream.getAudioTracks().forEach((track) => {
      track.enabled = state.micOn;
    });
  }
  updateCallStatus(state.micOn ? "Mic enabled." : "Mic muted.", Boolean(state.localStream));
  updateCallButtons();
}

function toggleCamera() {
  state.cameraOn = !state.cameraOn;
  if (state.localStream) {
    state.localStream.getVideoTracks().forEach((track) => {
      track.enabled = state.cameraOn;
    });
    patientVideo.parentElement.classList.toggle("has-camera", state.cameraOn);
  }
  updateCallStatus(state.cameraOn ? "Camera enabled." : "Camera off.", Boolean(state.localStream));
  updateCallButtons();
}

function endCall(shouldSignal = true) {
  if (shouldSignal && state.localStream) {
    postConsultSignal("call-ended").catch(() => {});
  }
  stopLocalStream();
  closePeerConnection();
  state.cameraOn = false;
  state.micOn = true;
  updateCallStatus("Call ended. Chat remains available.", false);
  updateCallButtons();
}

function stopLocalStream() {
  if (!state.localStream) return;
  state.localStream.getTracks().forEach((track) => track.stop());
  state.localStream = null;
  patientVideo.srcObject = null;
  patientVideo.parentElement.classList.remove("has-camera");
}

function updateCallButtons() {
  joinCallButton.classList.toggle("active", Boolean(state.localStream));
  joinCallButton.innerHTML = state.localStream ? `<i data-lucide="video"></i>Connected` : `<i data-lucide="video"></i>Join VC`;
  toggleMicButton.classList.toggle("active", state.micOn);
  toggleMicButton.innerHTML = state.micOn ? `<i data-lucide="mic"></i>Mic On` : `<i data-lucide="mic-off"></i>Muted`;
  toggleCameraButton.classList.toggle("active", state.cameraOn);
  toggleCameraButton.innerHTML = state.cameraOn ? `<i data-lucide="video"></i>Camera On` : `<i data-lucide="video-off"></i>Camera Off`;
  refreshIcons();
}

function updateCallStatus(message, connected) {
  callStatus.innerHTML = `<span></span>${escapeHtml(message)}`;
  callStatus.classList.toggle("connected", connected);
}

function initials(name) {
  return String(name || "Patient")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "PT";
}

function requestUserLocation(isAutomatic = false) {
  if (!navigator.geolocation) {
    showToast("Location is not supported in this browser.");
    return;
  }

  if (!isAutomatic) showToast("Please allow location permission.");

  navigator.geolocation.getCurrentPosition(async (position) => {
    if (locationLabel) locationLabel.textContent = "Location Allowed";
    showToast("Location allowed. Nearby services updated.");

    try {
      await fetch("/api/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        })
      });
    } catch {
      // Static preview still works when backend is not running.
    }
  }, () => {
    if (!isAutomatic) showToast("Location permission not allowed.");
  }, {
    enableHighAccuracy: true,
    timeout: 8000,
    maximumAge: 60000
  });
}

function openMobileMenu() {
  const drawerMenu = document.querySelector(".mobile-drawer");
  const menuButton = document.querySelector("[data-mobile-menu]");
  document.body.classList.add("home-nav-open");
  drawerMenu?.setAttribute("aria-hidden", "false");
  menuButton?.setAttribute("aria-expanded", "true");
}

function closeMobileMenu() {
  const drawerMenu = document.querySelector(".mobile-drawer");
  const menuButton = document.querySelector("[data-mobile-menu]");
  document.body.classList.remove("home-nav-open");
  drawerMenu?.setAttribute("aria-hidden", "true");
  menuButton?.setAttribute("aria-expanded", "false");
}

function bindEvents() {
  document.querySelector("#heroSearch")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (doctorGrid?.dataset.limit) {
      const params = new URLSearchParams();
      const query = doctorSearch?.value.trim();
      const specialty = specialtySelect?.value || "All";
      if (query) params.set("q", query);
      if (specialty !== "All") params.set("specialty", specialty);
      window.location.href = `doctors.html${params.toString() ? `?${params}` : ""}`;
      return;
    }
    setSpecialty(specialtySelect.value, true);
    showToast("Matching doctors updated.");
  });

  doctorSearch?.addEventListener("input", () => {
    if (doctorSectionSearch) doctorSectionSearch.value = doctorSearch.value;
    renderDoctors();
  });
  specialtySelect?.addEventListener("change", () => setSpecialty(specialtySelect.value));
  doctorSectionSearch?.addEventListener("input", () => {
    if (doctorSearch) doctorSearch.value = doctorSectionSearch.value;
    renderDoctors();
  });
  doctorSectionSpecialty?.addEventListener("change", () => setSpecialty(doctorSectionSpecialty.value));
  doctorToolbar?.addEventListener("submit", (event) => {
    event.preventDefault();
    setSpecialty(doctorSectionSpecialty?.value || "All");
    showToast("Doctors updated.");
  });

  document.querySelectorAll("[data-specialty]").forEach((button) => {
    button.addEventListener("click", () => setSpecialty(button.dataset.specialty, true));
  });

  document.querySelectorAll("[data-login]").forEach((button) => {
    button.addEventListener("click", () => {
      closeMobileMenu();
      openLoginChoice();
    });
  });

  const mobileMenuButton = document.querySelector("[data-mobile-menu]");
  mobileMenuButton?.addEventListener("click", () => {
    if (document.body.classList.contains("home-nav-open")) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });

  document.querySelector("[data-mobile-menu-close]")?.addEventListener("click", closeMobileMenu);
  document.querySelectorAll(".mobile-drawer a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });
  document.querySelector(".drawer-logout")?.addEventListener("click", () => {
    closeMobileMenu();
    showToast("Logged out from preview account.");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileMenu();
  });

  document.querySelectorAll("[data-location-request]").forEach((button) => {
    button.addEventListener("click", () => requestUserLocation(false));
  });

  if (heroDoctorButton) {
    heroDoctorButton.addEventListener("click", (event) => {
      event.stopPropagation();
      changeHeroDoctor(1);
      showToast("Doctor image changed.");
    });
  }

  if (heroArt) {
    heroArt.addEventListener("click", (event) => {
      if (event.target.closest(".hero-feature")) {
        changeHeroDoctor(1);
        showToast("Doctor image changed.");
      }
    });
  }

  document.querySelector("[data-consult]")?.addEventListener("click", () => {
    showToast("Video consultation selected.");
    openBooking("Dr. Priya Singh");
  });

  document.querySelector("#hospitalServiceForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const bedType = document.querySelector("#hospitalBedType")?.value || "Bed";
    const location = document.querySelector("#hospitalLocation")?.value || "your area";
    showToast(`Hospital bed support is launching soon for ${location}. Alert saved for ${bedType}.`);
  });

  document.querySelectorAll("[data-hospital-soon]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast("Hospital bed booking is launching soon. We will notify you when partner onboarding is live.");
    });
  });

  document.querySelector("#medicineStoreForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const medicine = document.querySelector("#medicineSearchInput")?.value.trim() || "your medicine";
    showToast(`Medicine delivery for ${medicine} is opening soon. We will notify you when pharmacy ordering starts.`);
  });

  document.querySelectorAll("[data-medicine-action]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast(`${button.dataset.medicineAction} will be available when medicine delivery launches.`);
    });
  });

  document.querySelector("#drawerClose")?.addEventListener("click", closeBooking);
  drawer?.addEventListener("click", (event) => {
    if (event.target === drawer) closeBooking();
  });

  document.querySelector("#bookingForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = document.querySelector("#patientName").value.trim() || "Patient";
    const phone = document.querySelector("#patientPhone").value.replace(/\D/g, "");

    if (phone.length < 10) {
      showToast("Please enter a valid mobile number.");
      return;
    }

    const slot = document.querySelector("#slotSelect").value;
    const concern = document.querySelector("#patientConcern").value.trim();
    if (confirmBookingButton) {
      confirmBookingButton.disabled = true;
      confirmBookingButton.textContent = "Confirming...";
    }

    try {
      const appointment = await createAppointment({
        doctorId: state.selectedDoctor.id,
        doctorName: state.selectedDoctor.name,
        patientName: name,
        phone,
        slot,
        concern
      });
      showToast(`${name} booked with ${appointment.doctorName}. VC and chat room ready.`);
      saveLastAppointment(appointment);
      renderLastConsultationShortcut();
      form.reset();
      closeBooking();
      openConsultationRoom(appointment);
    } catch (error) {
      showToast(error.message || "Appointment booking failed.");
    } finally {
      if (confirmBookingButton) {
        confirmBookingButton.disabled = false;
        confirmBookingButton.textContent = "Confirm Booking";
      }
    }
  });

  consultClose?.addEventListener("click", closeConsultationRoom);
  consultRoom?.addEventListener("click", (event) => {
    if (event.target === consultRoom) closeConsultationRoom();
  });
  joinCallButton?.addEventListener("click", joinCall);
  toggleMicButton?.addEventListener("click", toggleMic);
  toggleCameraButton?.addEventListener("click", toggleCamera);
  endCallButton?.addEventListener("click", endCall);
  chatForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    sendConsultMessage(text).catch((error) => showToast(error.message || "Message send failed."));
  });

  document.querySelector("#newsletterForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    showToast("Subscribed to Disha HealthQ health tips.");
    form.reset();
  });
}

function openLoginChoice() {
  let modal = document.querySelector("#loginChoiceModal");
  if (!modal) {
    modal = document.createElement("aside");
    modal.className = "login-choice-modal";
    modal.id = "loginChoiceModal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="login-choice-card">
        <button class="drawer-close" type="button" data-login-close aria-label="Close login options">
          <i data-lucide="x"></i>
        </button>
        <span class="section-kicker"><i data-lucide="user-round-check"></i>Choose Login</span>
        <h2>Continue as Patient or Doctor</h2>
        <p>Patient login stays on this booking page. Doctors get a separate dashboard for appointments and completed-consultation feedback.</p>
        <div class="login-choice-grid">
          <button type="button" data-patient-google>
            <i data-lucide="chrome"></i>
            <strong>Patient Google Login</strong>
            <small>OAuth setup ready</small>
          </button>
          <button type="button" data-patient-login>
            <i data-lucide="user-round"></i>
            <strong>Continue as Patient</strong>
            <small>Book doctors from here</small>
          </button>
          <a href="doctor-login.html">
            <i data-lucide="stethoscope"></i>
            <strong>Doctor Login</strong>
            <small>Google, mobile, or access code</small>
          </a>
        </div>
        <form class="auth-phone-form" data-patient-mobile-form>
          <label>
            <span>Patient mobile number</span>
            <input type="tel" inputmode="numeric" autocomplete="tel" placeholder="10 digit mobile number" data-patient-mobile />
          </label>
          <button class="black-button" type="submit"><i data-lucide="smartphone"></i>Continue with Mobile</button>
        </form>
        <small class="auth-note">Google OAuth and SMS OTP need production provider keys before real verification goes live.</small>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-login-close]")) closeLoginChoice();
      if (event.target.closest("[data-patient-login]")) {
        closeLoginChoice();
        showToast("Patient login stays on this booking page.");
      }
      if (event.target.closest("[data-patient-google]")) {
        showToast("Google login UI is ready. Add Google OAuth client keys to enable live sign-in.");
      }
    });
    modal.querySelector("[data-patient-mobile-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const phone = modal.querySelector("[data-patient-mobile]")?.value.replace(/\D/g, "") || "";
      if (phone.length < 10) {
        showToast("Enter a valid 10 digit mobile number.");
        return;
      }
      try {
        localStorage.setItem("dhq:patientLogin", JSON.stringify({
          method: "mobile",
          phone: `${phone.slice(0, 2)}******${phone.slice(-2)}`,
          createdAt: new Date().toISOString()
        }));
      } catch {
        // Patient can still continue booking without local storage.
      }
      closeLoginChoice();
      showToast("Patient mobile login saved for this device. SMS OTP provider can be connected for live verification.");
    });
  }

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  refreshIcons();
}

function closeLoginChoice() {
  const modal = document.querySelector("#loginChoiceModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
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
