const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch {
  DatabaseSync = null;
}

loadEnvFile(path.join(__dirname, ".env"));

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || 5175);
const RAW_HOST = process.env.HOST || process.env.BIND_HOST || "0.0.0.0";
const HOST = IS_PRODUCTION && ["127.0.0.1", "localhost"].includes(RAW_HOST) ? "0.0.0.0" : RAW_HOST;
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const SECURE_COOKIES = process.env.SECURE_COOKIES === "true";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PRODUCTION ? "" : "admin123");
const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PRODUCTION ? "" : "development-session-secret-change-before-production");
const SESSION_TTL_MS = Number(process.env.ADMIN_SESSION_TTL_MS || 8 * 60 * 60 * 1000);
const MAX_JSON_BYTES = Number(process.env.MAX_JSON_BYTES || 200_000);
const SESSION_COOKIE = "dhq_admin_session";
const DOCTOR_SESSION_COOKIE = "dhq_doctor_session";
const DOCTOR_LOGIN_CODE = process.env.DOCTOR_LOGIN_CODE || "doctor123";
const CSRF_HEADER = "x-csrf-token";
const PUBLIC_DIR = path.resolve(__dirname);
const DATA_DIR = path.join(__dirname, "data");
const REQUESTS_FILE = path.join(DATA_DIR, "service-requests.json");
const DOCTORS_FILE = path.join(DATA_DIR, "doctors.json");
const AUDIT_FILE = path.join(DATA_DIR, "admin-audit.json");
const APPOINTMENTS_FILE = path.join(DATA_DIR, "appointments.json");
const CONSULT_MESSAGES_FILE = path.join(DATA_DIR, "consultation-messages.json");
const DATABASE_FILE = path.join(DATA_DIR, "disha-healthq.sqlite");
const publicClients = new Set();
const adminClients = new Set();
const consultationClients = new Map();
const consultationSignals = new Map();
const sessions = new Map();
const doctorSessions = new Map();
const rateBuckets = new Map();
let db = null;
let dataStoreReady = false;

if (IS_PRODUCTION && (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12 || !SESSION_SECRET || SESSION_SECRET.length < 32)) {
  console.error("Production requires ADMIN_PASSWORD length >= 12 and SESSION_SECRET length >= 32.");
  process.exit(1);
}

const publicStaticFiles = new Set([
  "/",
  "/index.html",
  "/doctors.html",
  "/medicine.html",
  "/doctor-login.html",
  "/doctor-dashboard.html",
  "/services.html",
  "/admin.html",
  "/styles.css",
  "/script.js",
  "/medicine.js",
  "/doctor-login.js",
  "/doctor-dashboard.js",
  "/services.js",
  "/admin.css",
  "/admin.js",
  "/favicon.ico",
  "/favicon.png",
  "/favicon-32x32.png",
  "/favicon-48x48.png",
  "/apple-touch-icon.png",
  "/robots.txt",
  "/sitemap.xml"
]);

const seedDoctors = [
  {
    id: "DOC-1001",
    name: "Dr. Ananya Sharma",
    specialty: "Cardiologist",
    city: "Guwahati",
    experience: "12+ Years Experience",
    license: "ASM-MC-20488",
    fee: "Rs 800",
    status: "pending",
    verified: false,
    rating: "4.9",
    reviews: "1.2K+ reviews",
    nextSlot: "Today, 05:30 PM",
    online: true,
    docs: ["Medical license", "ID proof", "Clinic address"],
    image: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=320&q=85"
  },
  {
    id: "DOC-1002",
    name: "Dr. Rohan Das",
    specialty: "Neurologist",
    city: "Dispur",
    experience: "10+ Years Experience",
    license: "ASM-MC-19320",
    fee: "Rs 700",
    status: "approved",
    verified: true,
    rating: "4.8",
    reviews: "980+ reviews",
    nextSlot: "Today, 06:00 PM",
    docs: ["Medical license", "Degree certificate", "Hospital letter"],
    image: "https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=320&q=85"
  },
  {
    id: "DOC-1003",
    name: "Dr. Priya Singh",
    specialty: "Gynecologist",
    city: "Beltola",
    experience: "8+ Years Experience",
    license: "ASM-MC-22871",
    fee: "Rs 600",
    status: "pending",
    verified: false,
    rating: "4.9",
    reviews: "1.5K+ reviews",
    nextSlot: "Today, 04:30 PM",
    docs: ["Medical license", "ID proof", "Degree certificate"],
    image: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=320&q=85"
  },
  {
    id: "DOC-1004",
    name: "Dr. Amit Verma",
    specialty: "Orthopedist",
    city: "Khanapara",
    experience: "15+ Years Experience",
    license: "ASM-MC-17642",
    fee: "Rs 800",
    status: "rejected",
    verified: false,
    rating: "4.8",
    reviews: "780+ reviews",
    nextSlot: "Today, 05:00 PM",
    docs: ["ID proof pending", "Clinic address"],
    image: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=320&q=85"
  },
  {
    id: "DOC-1005",
    name: "Dr. Meera Das",
    specialty: "Pediatrician",
    city: "Six Mile",
    experience: "9+ Years Experience",
    license: "ASM-MC-23018",
    fee: "Rs 650",
    status: "approved",
    verified: false,
    rating: "4.7",
    reviews: "840+ reviews",
    nextSlot: "Tomorrow, 11:00 AM",
    docs: ["Medical license", "Degree certificate", "ID proof"],
    image: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=320&q=85"
  },
  {
    id: "DOC-1006",
    name: "Dr. Kavya Rao",
    specialty: "Ophthalmologist",
    city: "Ulubari",
    experience: "11+ Years Experience",
    license: "ASM-MC-21119",
    fee: "Rs 750",
    status: "pending",
    verified: false,
    rating: "4.8",
    reviews: "690+ reviews",
    nextSlot: "Today, 07:00 PM",
    docs: ["Medical license", "Hospital letter"],
    image: "https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?auto=format&fit=crop&w=320&q=85"
  }
];

const services = [
  {
    id: "medicine",
    title: "Medicine Store",
    icon: "pill",
    accent: "purple",
    summary: "Medicine delivery, prescription upload, and nearby pharmacy connection.",
    features: ["Medicine delivery", "Prescription upload", "Nearby pharmacy connection"]
  },
  {
    id: "medical-tests",
    title: "Medical Tests",
    icon: "test-tube-2",
    accent: "blue",
    summary: "Home blood test, lab test booking, and report download.",
    features: ["Home blood test", "Lab test booking", "Report download"]
  },
  {
    id: "health-records",
    title: "Health Records",
    icon: "folder-heart",
    accent: "green",
    summary: "Online prescriptions, report history, and digital health profile.",
    features: ["Online prescriptions", "Reports history", "Digital health profile"]
  },
  {
    id: "subscriptions",
    title: "Subscription Plans",
    icon: "badge-percent",
    accent: "orange",
    summary: "Monthly healthcare membership and discounted services.",
    features: ["Monthly membership", "Discounted services", "Priority booking"]
  },
  {
    id: "fitness",
    title: "Fitness & Wellness",
    icon: "dumbbell",
    accent: "green",
    summary: "Diet plans, fitness consultation, and weight management.",
    features: ["Diet plans", "Fitness consultation", "Weight management"]
  },
  {
    id: "mental-health",
    title: "Mental Health",
    icon: "brain",
    accent: "purple",
    summary: "Online counselor and stress/anxiety consultation.",
    features: ["Online counselor", "Stress consultation", "Anxiety consultation"]
  },
  {
    id: "women-child",
    title: "Women & Child Care",
    icon: "baby",
    accent: "pink",
    summary: "Pregnancy support, vaccination reminders, and child specialist booking.",
    features: ["Pregnancy support", "Vaccination reminders", "Child specialist booking"]
  },
  {
    id: "elderly-care",
    title: "Elderly Care",
    icon: "hand-heart",
    accent: "blue",
    summary: "Home nurse booking and senior citizen care plans.",
    features: ["Home nurse booking", "Senior care plans", "Vitals follow-up"]
  },
  {
    id: "notifications",
    title: "Smart Notifications",
    icon: "bell-ring",
    accent: "orange",
    summary: "Medicine reminders and appointment reminders.",
    features: ["Medicine reminders", "Appointment reminders", "Follow-up alerts"]
  },
  {
    id: "languages",
    title: "Multi-language Support",
    icon: "languages",
    accent: "purple",
    summary: "Hindi, English, and regional language assistance.",
    features: ["Hindi", "English", "Regional languages"]
  },
  {
    id: "student-plans",
    title: "Student Health Plans",
    icon: "graduation-cap",
    accent: "green",
    summary: "Affordable healthcare plans for students.",
    features: ["Low-cost consults", "Campus health plans", "Student discounts"]
  },
  {
    id: "blood-services",
    title: "Blood Services",
    icon: "droplets",
    accent: "pink",
    summary: "Blood donor network and emergency blood request.",
    features: ["Blood donor network", "Emergency blood request", "Blood group matching"]
  },
  {
    id: "nearby",
    title: "Nearby Services",
    icon: "radar",
    accent: "blue",
    summary: "Nearby hospitals, labs, and pharmacies tracking.",
    features: ["Nearby hospitals", "Nearby labs", "Nearby pharmacies"]
  }
];

const nearbyProviders = [
  { id: "h-1", type: "hospital", name: "Guwahati Care Hospital", area: "GS Road", lat: 26.1448, lng: 91.7362, distanceKm: 2.4, open: true, tags: ["Bed Support Preview", "ICU Desk", "Emergency Alert"] },
  { id: "h-2", type: "hospital", name: "Disha HealthQ Multi Speciality", area: "Dispur", lat: 26.1433, lng: 91.7898, distanceKm: 4.1, open: true, tags: ["ICU Preview", "Trauma Desk", "Bed Alerts"] },
  { id: "l-1", type: "lab", name: "City Diagnostics Lab", area: "Beltola", lat: 26.1294, lng: 91.8013, distanceKm: 1.8, open: true, tags: ["Blood Test", "Home Sample", "Reports"] },
  { id: "l-2", type: "lab", name: "North East Lab Care", area: "Ganeshguri", lat: 26.1534, lng: 91.7852, distanceKm: 3.2, open: true, tags: ["Lab Booking", "CBC", "Thyroid"] },
  { id: "p-1", type: "pharmacy", name: "Apollo Pharmacy", area: "Six Mile", lat: 26.1385, lng: 91.8069, distanceKm: 1.2, open: true, tags: ["Delivery", "Prescription", "24/7"] },
  { id: "p-2", type: "pharmacy", name: "MediFast Pharmacy", area: "Pan Bazaar", lat: 26.1844, lng: 91.7409, distanceKm: 4.8, open: false, tags: ["Delivery", "Nearest Store"] },
  { id: "b-1", type: "blood", name: "Emergency Blood Donor Network", area: "Guwahati", lat: 26.1445, lng: 91.7362, distanceKm: 2.9, open: true, tags: ["A+", "O-", "Urgent"] }
];

const medicineProducts = [
  { id: "med-1", name: "Paracetamol 500mg", category: "daily", price: 35, tag: "Fever & pain", prescription: false, icon: "pill" },
  { id: "med-2", name: "Diabetes Care Refill", category: "diabetes", price: 240, tag: "Diabetes Care", prescription: true, icon: "briefcase-medical" },
  { id: "med-3", name: "BP Monitoring Tablets", category: "daily", price: 180, tag: "Doctor Rx", prescription: true, icon: "heart-pulse" },
  { id: "med-4", name: "Vitamin D3 Pack", category: "wellness", price: 160, tag: "Wellness", prescription: false, icon: "sun" },
  { id: "med-5", name: "Immunity Combo", category: "wellness", price: 399, tag: "Popular", prescription: false, icon: "shield-plus" },
  { id: "med-6", name: "Baby Care Essentials", category: "baby", price: 520, tag: "Baby Care", prescription: false, icon: "baby" },
  { id: "med-7", name: "Digital Thermometer", category: "devices", price: 220, tag: "Device", prescription: false, icon: "thermometer" },
  { id: "med-8", name: "BP Monitor Device", category: "devices", price: 1399, tag: "Home Care", prescription: false, icon: "activity" }
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function ensureDataStore() {
  if (dataStoreReady) return;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(REQUESTS_FILE)) fs.writeFileSync(REQUESTS_FILE, "[]\n", "utf8");
  if (!fs.existsSync(DOCTORS_FILE)) fs.writeFileSync(DOCTORS_FILE, `${JSON.stringify(seedDoctors, null, 2)}\n`, "utf8");
  if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, "[]\n", "utf8");
  if (!fs.existsSync(APPOINTMENTS_FILE)) fs.writeFileSync(APPOINTMENTS_FILE, "[]\n", "utf8");
  if (!fs.existsSync(CONSULT_MESSAGES_FILE)) fs.writeFileSync(CONSULT_MESSAGES_FILE, "{}\n", "utf8");
  initializeDatabase();
  dataStoreReady = true;
}

function readLegacyJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function initializeDatabase() {
  if (!DatabaseSync) return;
  try {
    db = new DatabaseSync(DATABASE_FILE);
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS doctors (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        verified INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL UNIQUE,
        doctor_id TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        status TEXT NOT NULL,
        consult_token_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS consultation_messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        sender_type TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS consultation_signals (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        type TEXT NOT NULL,
        sender_type TEXT NOT NULL,
        payload TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS service_requests (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_audit (
        id TEXT PRIMARY KEY,
        message TEXT NOT NULL,
        time TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON appointments(doctor_id);
      CREATE INDEX IF NOT EXISTS idx_consult_messages_room ON consultation_messages(room_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_consult_signals_room ON consultation_signals(room_id, created_at);
    `);
    migrateLegacyJsonData();
  } catch (error) {
    console.warn(`SQLite database unavailable; falling back to JSON storage. ${error.message}`);
    db = null;
  }
}

function migrateLegacyJsonData() {
  if (!db) return;
  if (dbCount("doctors") === 0) {
    replaceDoctorsInDb(readLegacyJsonFile(DOCTORS_FILE, seedDoctors));
  }
  if (dbCount("appointments") === 0) {
    replaceAppointmentsInDb(readLegacyJsonFile(APPOINTMENTS_FILE, []));
  }
  if (dbCount("consultation_messages") === 0) {
    replaceConsultMessagesInDb(readLegacyJsonFile(CONSULT_MESSAGES_FILE, {}));
  }
  if (dbCount("service_requests") === 0) {
    replaceRequestsInDb(readLegacyJsonFile(REQUESTS_FILE, []));
  }
  if (dbCount("admin_audit") === 0) {
    replaceAuditInDb(readLegacyJsonFile(AUDIT_FILE, []));
  }
}

function dbCount(tableName) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count || 0);
}

function withDbTransaction(callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function parseDbPayload(row, fallback = {}) {
  try {
    return JSON.parse(row.data);
  } catch {
    return fallback;
  }
}

function hashConsultToken(token) {
  return crypto.createHash("sha256").update(`${SESSION_SECRET}:consult:${token}`).digest("base64url");
}

function publicAppointmentPayload(appointment) {
  const { consultToken, consultTokenHash, ...safeAppointment } = appointment;
  return safeAppointment;
}

function storedAppointmentBackupPayload(appointment) {
  const { consultToken, ...safeAppointment } = appointment;
  return safeAppointment;
}

function appointmentTokenHash(appointment) {
  if (appointment.consultTokenHash) return appointment.consultTokenHash;
  if (appointment.consultToken) return hashConsultToken(appointment.consultToken);
  return null;
}

function replaceDoctorsInDb(doctors) {
  if (!db) return;
  const insert = db.prepare(`
    INSERT INTO doctors (id, status, verified, updated_at, data)
    VALUES (?, ?, ?, ?, ?)
  `);
  withDbTransaction(() => {
    db.exec("DELETE FROM doctors");
    doctors.forEach((doctor) => {
      insert.run(
        doctor.id,
        doctor.status || "pending",
        doctor.verified ? 1 : 0,
        doctor.updatedAt || null,
        JSON.stringify(doctor)
      );
    });
  });
}

function replaceAppointmentsInDb(appointments) {
  if (!db) return;
  const insert = db.prepare(`
    INSERT INTO appointments (id, room_id, doctor_id, patient_name, status, consult_token_hash, created_at, updated_at, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  withDbTransaction(() => {
    db.exec("DELETE FROM appointments");
    appointments.forEach((appointment) => {
      const stored = publicAppointmentPayload(appointment);
      insert.run(
        appointment.id,
        appointment.roomId,
        appointment.doctorId,
        appointment.patientName,
        appointment.status || "confirmed",
        appointmentTokenHash(appointment),
        appointment.createdAt || new Date().toISOString(),
        appointment.updatedAt || null,
        JSON.stringify(stored)
      );
    });
  });
}

function replaceConsultMessagesInDb(messagesByRoom) {
  if (!db) return;
  const insert = db.prepare(`
    INSERT INTO consultation_messages (id, room_id, sender_type, sender_name, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  withDbTransaction(() => {
    db.exec("DELETE FROM consultation_messages");
    Object.entries(messagesByRoom || {}).forEach(([roomId, messages]) => {
      (messages || []).forEach((message) => {
        insert.run(
          message.id || crypto.randomUUID(),
          message.roomId || roomId,
          message.senderType || "system",
          message.senderName || "Disha HealthQ",
          message.text || "",
          message.createdAt || new Date().toISOString()
        );
      });
    });
  });
}

function replaceRequestsInDb(requests) {
  if (!db) return;
  const insert = db.prepare("INSERT INTO service_requests (id, created_at, data) VALUES (?, ?, ?)");
  withDbTransaction(() => {
    db.exec("DELETE FROM service_requests");
    (requests || []).forEach((request) => {
      insert.run(request.id || crypto.randomUUID(), request.createdAt || new Date().toISOString(), JSON.stringify(request));
    });
  });
}

function replaceAuditInDb(audit) {
  if (!db) return;
  const insert = db.prepare("INSERT INTO admin_audit (id, message, time, created_at) VALUES (?, ?, ?, ?)");
  withDbTransaction(() => {
    db.exec("DELETE FROM admin_audit");
    (audit || []).forEach((item) => {
      insert.run(item.id || crypto.randomUUID(), item.message || "Admin action", item.time || "", item.createdAt || new Date().toISOString());
    });
  });
}

function readJsonFile(filePath, fallback) {
  ensureDataStore();
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, payload) {
  ensureDataStore();
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function readRequests() {
  ensureDataStore();
  if (db) {
    return db.prepare("SELECT data FROM service_requests ORDER BY created_at DESC").all().map((row) => parseDbPayload(row));
  }
  return readJsonFile(REQUESTS_FILE, []);
}

function writeRequests(requests) {
  ensureDataStore();
  if (db) replaceRequestsInDb(requests);
  writeJsonFile(REQUESTS_FILE, requests);
}

function readAppointments() {
  ensureDataStore();
  if (db) {
    return db.prepare("SELECT * FROM appointments ORDER BY created_at DESC").all().map((row) => ({
      ...parseDbPayload(row),
      consultTokenHash: row.consult_token_hash || null
    }));
  }
  return readJsonFile(APPOINTMENTS_FILE, []);
}

function writeAppointments(appointments) {
  ensureDataStore();
  const safeAppointments = appointments.map(storedAppointmentBackupPayload);
  if (db) replaceAppointmentsInDb(appointments);
  writeJsonFile(APPOINTMENTS_FILE, safeAppointments);
}

function readConsultMessages() {
  ensureDataStore();
  if (db) {
    return db.prepare("SELECT * FROM consultation_messages ORDER BY created_at ASC").all().reduce((rooms, row) => {
      const message = {
        id: row.id,
        roomId: row.room_id,
        senderType: row.sender_type,
        senderName: row.sender_name,
        text: row.text,
        createdAt: row.created_at
      };
      if (!rooms[message.roomId]) rooms[message.roomId] = [];
      rooms[message.roomId].push(message);
      return rooms;
    }, {});
  }
  return readJsonFile(CONSULT_MESSAGES_FILE, {});
}

function writeConsultMessages(messages) {
  ensureDataStore();
  if (db) replaceConsultMessagesInDb(messages);
  writeJsonFile(CONSULT_MESSAGES_FILE, messages);
}

function readDoctors() {
  ensureDataStore();
  if (db) {
    return db.prepare("SELECT data FROM doctors ORDER BY rowid ASC").all().map((row) => parseDbPayload(row));
  }
  return readJsonFile(DOCTORS_FILE, seedDoctors);
}

function writeDoctors(doctors) {
  ensureDataStore();
  if (db) replaceDoctorsInDb(doctors);
  writeJsonFile(DOCTORS_FILE, doctors);
}

function readAudit() {
  ensureDataStore();
  if (db) {
    return db.prepare("SELECT id, message, time, created_at FROM admin_audit ORDER BY created_at DESC LIMIT 80").all().map((row) => ({
      id: row.id,
      message: row.message,
      time: row.time,
      createdAt: row.created_at
    }));
  }
  return readJsonFile(AUDIT_FILE, []);
}

function writeAudit(audit) {
  ensureDataStore();
  if (db) replaceAuditInDb(audit);
  writeJsonFile(AUDIT_FILE, audit);
}

function addAudit(message) {
  const audit = readAudit();
  audit.unshift({
    message,
    time: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    createdAt: new Date().toISOString()
  });
  writeAudit(audit.slice(0, 80));
  return audit;
}

function publicDoctor(doctor) {
  return {
    id: doctor.id,
    name: doctor.name,
    specialty: doctor.specialty,
    experience: doctor.experience,
    feeLabel: "FREE",
    feeAmount: "",
    originalFeeLabel: "Rs",
    originalFeeAmount: "699",
    discountLabel: "100% discount",
    nextSlot: doctor.nextSlot || "Today, 06:00 PM",
    online: Boolean(doctor.online),
    verified: Boolean(doctor.verified),
    image: doctor.image,
    city: doctor.city
  };
}

function doctorProfile(doctor) {
  return {
    id: doctor.id,
    name: doctor.name,
    specialty: doctor.specialty,
    city: doctor.city,
    experience: doctor.experience,
    rating: doctor.rating || "4.8",
    reviews: doctor.reviews || "500+ reviews",
    nextSlot: doctor.nextSlot || "Today, 06:00 PM",
    image: doctor.image
  };
}

function appointmentMetrics(appointments) {
  return {
    total: appointments.length,
    upcoming: appointments.filter((item) => ["pending", "confirmed"].includes(item.status)).length,
    completed: appointments.filter((item) => item.status === "completed").length,
    cancelled: appointments.filter((item) => item.status === "cancelled").length
  };
}

function doctorReviews(doctor, appointments) {
  return [];
}

function doctorMetrics(doctors) {
  return {
    pending: doctors.filter((doctor) => doctor.status === "pending").length,
    approved: doctors.filter((doctor) => doctor.status === "approved").length,
    rejected: doctors.filter((doctor) => doctor.status === "rejected").length,
    verified: doctors.filter((doctor) => doctor.verified).length
  };
}

function liveSnapshot() {
  const doctors = readDoctors();
  return {
    doctors,
    publicDoctors: doctors.filter((doctor) => doctor.status === "approved").map(publicDoctor),
    audit: readAudit(),
    metrics: doctorMetrics(doctors)
  };
}

function publicSnapshot() {
  const doctors = readDoctors();
  return {
    publicDoctors: doctors.filter((doctor) => doctor.status === "approved").map(publicDoctor)
  };
}

function sendEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastTo(clients, event, payload) {
  for (const client of clients) {
    sendEvent(client, event, payload);
  }
}

function consultationPath(urlPath, suffix = "") {
  const match = urlPath.match(new RegExp(`^/api/consultations/([^/]+)${suffix}$`));
  return match ? decodeURIComponent(match[1]) : null;
}

function findAppointmentByRoom(roomId) {
  return readAppointments().find((appointment) => appointment.roomId === roomId);
}

function getConsultationClients(roomId) {
  if (!consultationClients.has(roomId)) consultationClients.set(roomId, new Set());
  return consultationClients.get(roomId);
}

function readConsultMessagesForRoom(roomId) {
  ensureDataStore();
  if (db) {
    return db.prepare(`
      SELECT * FROM consultation_messages
      WHERE room_id = ?
      ORDER BY created_at ASC, rowid ASC
      LIMIT 200
    `).all(roomId).map((row) => ({
      id: row.id,
      roomId: row.room_id,
      senderType: row.sender_type,
      senderName: row.sender_name,
      text: row.text,
      createdAt: row.created_at
    }));
  }
  return readConsultMessages()[roomId] || [];
}

function readConsultSignalsForRoom(roomId) {
  ensureDataStore();
  if (!db) return consultationSignals.get(roomId) || [];
  return db.prepare(`
    SELECT * FROM consultation_signals
    WHERE room_id = ?
    ORDER BY created_at ASC, rowid ASC
    LIMIT 80
  `).all(roomId).map((row) => ({
    id: row.id,
    roomId: row.room_id,
    type: row.type,
    senderType: row.sender_type,
    payload: row.payload ? JSON.parse(row.payload) : null,
    createdAt: row.created_at
  }));
}

function consultationSnapshot(roomId) {
  const appointment = findAppointmentByRoom(roomId);
  return {
    appointment: appointment ? {
      id: appointment.id,
      roomId: appointment.roomId,
      doctorId: appointment.doctorId,
      doctorName: appointment.doctorName,
      doctorImage: appointment.doctorImage,
      patientName: appointment.patientName,
      slot: appointment.slot,
      concern: appointment.concern,
      status: appointment.status
    } : null,
    messages: readConsultMessagesForRoom(roomId),
    signals: readConsultSignalsForRoom(roomId)
  };
}

function appendConsultMessage(roomId, message) {
  ensureDataStore();
  if (db) {
    db.prepare(`
      INSERT INTO consultation_messages (id, room_id, sender_type, sender_name, text, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(message.id, roomId, message.senderType, message.senderName, message.text, message.createdAt);
    db.prepare(`
      DELETE FROM consultation_messages
      WHERE rowid IN (
        SELECT rowid FROM consultation_messages
        WHERE room_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT -1 OFFSET 200
      )
    `).run(roomId);
    broadcastTo(getConsultationClients(roomId), "message", message);
    return message;
  }
  const allMessages = readConsultMessages();
  const messages = allMessages[roomId] || [];
  messages.push(message);
  allMessages[roomId] = messages.slice(-200);
  writeConsultMessages(allMessages);
  broadcastTo(getConsultationClients(roomId), "message", message);
  return message;
}

function appendConsultSignal(roomId, signal) {
  ensureDataStore();
  if (db) {
    db.prepare(`
      INSERT INTO consultation_signals (id, room_id, type, sender_type, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(signal.id, roomId, signal.type, signal.senderType, signal.payload ? JSON.stringify(signal.payload) : null, signal.createdAt);
    db.prepare(`
      DELETE FROM consultation_signals
      WHERE rowid IN (
        SELECT rowid FROM consultation_signals
        WHERE room_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT -1 OFFSET 80
      )
    `).run(roomId);
  } else {
    const signals = consultationSignals.get(roomId) || [];
    signals.push(signal);
    consultationSignals.set(roomId, signals.slice(-80));
  }
  broadcastTo(getConsultationClients(roomId), "signal", signal);
  return signal;
}

function securityHeaders() {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' https://unpkg.com",
      "style-src 'self'",
      "img-src 'self' https://images.unsplash.com data:",
      "connect-src 'self' ws: wss: stun: turns:",
      "media-src 'self' blob: mediastream:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join("; "),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Origin-Agent-Cluster": "?1",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
    "X-DNS-Prefetch-Control": "off",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Permissions-Policy": "camera=(self), microphone=(self), payment=(), usb=(), geolocation=(self)"
  };
}

function writeHead(res, status, headers = {}) {
  res.writeHead(status, {
    ...securityHeaders(),
    ...headers
  });
}

function sendJson(res, status, payload, extraHeaders = {}) {
  writeHead(res, status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { ok: false, message });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_JSON_BYTES) {
        const error = new Error("Payload too large");
        error.status = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        const error = new Error("Invalid JSON");
        error.status = 400;
        reject(error);
      }
    });
  });
}

function clientIp(req) {
  if (TRUST_PROXY && req.headers["x-forwarded-for"]) {
    return String(req.headers["x-forwarded-for"]).split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function rateLimit(req, res, key, limit, windowMs) {
  const now = Date.now();
  const bucketKey = `${key}:${clientIp(req)}`;
  const bucket = rateBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) {
    sendError(res, 429, "Too many requests. Try again later.");
    return false;
  }
  bucket.count += 1;
  return true;
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(cookieHeader.split(";").map((cookie) => {
    const separator = cookie.indexOf("=");
    if (separator === -1) return ["", ""];
    return [cookie.slice(0, separator).trim(), decodeURIComponent(cookie.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

function cookieHeader(name, value, req, options = {}) {
  const secure = SECURE_COOKIES || Boolean(req.socket.encrypted) || (TRUST_PROXY && req.headers["x-forwarded-proto"] === "https");
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
    options.maxAge === 0 ? "Max-Age=0" : `Max-Age=${Math.floor((options.maxAge || SESSION_TTL_MS) / 1000)}`
  ].filter(Boolean).join("; ");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createSession() {
  clearExpiredSessions();
  const id = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const secretHash = crypto.createHmac("sha256", SESSION_SECRET).update(id).digest("base64url");
  sessions.set(secretHash, { csrfToken, expiresAt });
  return { id, csrfToken };
}

function createDoctorSession(doctorId) {
  clearExpiredDoctorSessions();
  const id = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const secretHash = crypto.createHmac("sha256", SESSION_SECRET).update(`doctor:${id}`).digest("base64url");
  doctorSessions.set(secretHash, { doctorId, csrfToken, expiresAt });
  return { id, csrfToken };
}

function clearExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}

function clearExpiredDoctorSessions() {
  const now = Date.now();
  for (const [id, session] of doctorSessions) {
    if (session.expiresAt <= now) doctorSessions.delete(id);
  }
}

function getSession(req) {
  clearExpiredSessions();
  const sessionId = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!sessionId) return null;
  const secretHash = crypto.createHmac("sha256", SESSION_SECRET).update(sessionId).digest("base64url");
  const session = sessions.get(secretHash);
  if (!session) return null;
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { id: sessionId, ...session };
}

function getDoctorSession(req) {
  clearExpiredDoctorSessions();
  const sessionId = parseCookies(req.headers.cookie || "")[DOCTOR_SESSION_COOKIE];
  if (!sessionId) return null;
  const secretHash = crypto.createHmac("sha256", SESSION_SECRET).update(`doctor:${sessionId}`).digest("base64url");
  const session = doctorSessions.get(secretHash);
  if (!session) return null;
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  const doctor = readDoctors().find((item) => item.id === session.doctorId && item.status === "approved");
  if (!doctor) return null;
  return { id: sessionId, ...session, doctor };
}

function requireAdmin(req, res, options = {}) {
  const session = getSession(req);
  if (!session) {
    sendError(res, 401, "Admin login required.");
    return null;
  }
  if (options.csrf) {
    const csrfToken = req.headers[CSRF_HEADER];
    if (!safeEqual(csrfToken, session.csrfToken)) {
      sendError(res, 403, "Invalid CSRF token.");
      return null;
    }
  }
  return session;
}

function requireDoctor(req, res, options = {}) {
  const session = getDoctorSession(req);
  if (!session) {
    sendError(res, 401, "Doctor login required.");
    return null;
  }
  if (options.csrf) {
    const csrfToken = req.headers[CSRF_HEADER];
    if (!safeEqual(csrfToken, session.csrfToken)) {
      sendError(res, 403, "Invalid CSRF token.");
      return null;
    }
  }
  return session;
}

function consultTokenFromRequest(req, url) {
  return validateText(req.headers["x-consult-token"] || url.searchParams.get("token") || "", 256);
}

function authorizeConsultation(req, res, url, roomId) {
  const appointment = findAppointmentByRoom(roomId);
  if (!appointment) {
    sendError(res, 404, "Consultation room not found.");
    return null;
  }

  const doctorSession = getDoctorSession(req);
  if (doctorSession?.doctor?.id === appointment.doctorId) {
    return { role: "doctor", appointment, session: doctorSession };
  }

  const token = consultTokenFromRequest(req, url);
  if (token && appointment.consultTokenHash && safeEqual(hashConsultToken(token), appointment.consultTokenHash)) {
    return { role: "patient", appointment, session: null };
  }

  sendError(res, 403, "Consultation room access denied.");
  return null;
}

function requireConsultSender(req, res, auth, senderType) {
  if (!["patient", "doctor"].includes(senderType)) {
    sendError(res, 400, "Unsupported sender type.");
    return false;
  }
  if (senderType !== auth.role) {
    sendError(res, 403, "Sender does not match consultation access.");
    return false;
  }
  if (auth.role === "doctor") {
    const csrfToken = req.headers[CSRF_HEADER];
    if (!safeEqual(csrfToken, auth.session.csrfToken)) {
      sendError(res, 403, "Invalid CSRF token.");
      return false;
    }
  }
  return true;
}

function destroySession(req) {
  const sessionId = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!sessionId) return;
  const secretHash = crypto.createHmac("sha256", SESSION_SECRET).update(sessionId).digest("base64url");
  sessions.delete(secretHash);
}

function destroyDoctorSession(req) {
  const sessionId = parseCookies(req.headers.cookie || "")[DOCTOR_SESSION_COOKIE];
  if (!sessionId) return;
  const secretHash = crypto.createHmac("sha256", SESSION_SECRET).update(`doctor:${sessionId}`).digest("base64url");
  doctorSessions.delete(secretHash);
}

function validateText(value, maxLength, fallback = "") {
  const text = String(value || fallback).trim();
  return text.slice(0, maxLength);
}

function distanceKm(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}

function nearbyForLocation(location, type = "all") {
  const hasCoords = Number.isFinite(location.lat) && Number.isFinite(location.lng);
  return nearbyProviders
    .filter((provider) => type === "all" || provider.type === type)
    .map((provider) => ({
      ...provider,
      distanceKm: hasCoords ? Number(distanceKm(location, provider).toFixed(1)) : provider.distanceKm
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function safeStaticPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const cleaned = decoded.replace(/\\/g, "/");
  const normalized = path.posix.normalize(cleaned === "/" ? "/index.html" : cleaned);
  if (!normalized.startsWith("/") || normalized.includes("/../")) return null;
  if (!isAllowedPublicPath(normalized)) return null;

  const filePath = path.resolve(PUBLIC_DIR, normalized.slice(1));
  const root = `${PUBLIC_DIR.toLowerCase()}${path.sep}`;
  if (!filePath.toLowerCase().startsWith(root)) return null;
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : null;
}

function isAllowedPublicPath(urlPath) {
  if (publicStaticFiles.has(urlPath)) return true;
  if (!urlPath.startsWith("/assets/") || urlPath.includes("/.")) return false;
  const ext = path.extname(urlPath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp"].includes(ext);
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/events") {
    writeHead(res, 200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    publicClients.add(res);
    sendEvent(res, "connected", publicSnapshot());
    req.on("close", () => publicClients.delete(res));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "Disha HealthQ backend",
      database: db ? "sqlite" : "json-fallback",
      env: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === "GET" && url.pathname === "/api/doctors") {
    const publicDoctors = readDoctors().filter((doctor) => doctor.status === "approved").map(publicDoctor);
    return sendJson(res, 200, { doctors: publicDoctors });
  }

  if (req.method === "GET" && url.pathname === "/api/medicine-products") {
    return sendJson(res, 200, { products: medicineProducts });
  }

  const consultationEventsRoom = consultationPath(url.pathname, "/events");
  if (req.method === "GET" && consultationEventsRoom) {
    const auth = authorizeConsultation(req, res, url, consultationEventsRoom);
    if (!auth) return;
    writeHead(res, 200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    const clients = getConsultationClients(consultationEventsRoom);
    clients.add(res);
    sendEvent(res, "connected", consultationSnapshot(consultationEventsRoom));
    req.on("close", () => clients.delete(res));
    return;
  }

  const consultationMessagesRoom = consultationPath(url.pathname, "/messages");
  if (req.method === "POST" && consultationMessagesRoom) {
    if (!rateLimit(req, res, "consult-message", 90, 60_000)) return;
    const auth = authorizeConsultation(req, res, url, consultationMessagesRoom);
    if (!auth) return;
    const body = await readJsonBody(req);
    const text = validateText(body.text, 1000);
    if (!text) return sendError(res, 400, "Message text is required.");
    const senderType = ["patient", "doctor"].includes(body.senderType) ? body.senderType : auth.role;
    if (!requireConsultSender(req, res, auth, senderType)) return;
    const message = appendConsultMessage(consultationMessagesRoom, {
      id: crypto.randomUUID(),
      roomId: consultationMessagesRoom,
      senderType,
      senderName: validateText(body.senderName, 80, senderType === "doctor" ? "Doctor" : "Patient"),
      text,
      createdAt: new Date().toISOString()
    });
    return sendJson(res, 201, { ok: true, message });
  }

  const consultationSignalsRoom = consultationPath(url.pathname, "/signals");
  if (req.method === "POST" && consultationSignalsRoom) {
    if (!rateLimit(req, res, "consult-signal", 180, 60_000)) return;
    const auth = authorizeConsultation(req, res, url, consultationSignalsRoom);
    if (!auth) return;
    const body = await readJsonBody(req);
    const type = validateText(body.type, 40);
    if (!["join", "leave", "offer", "answer", "candidate", "call-ended"].includes(type)) {
      return sendError(res, 400, "Unsupported signal type.");
    }
    const senderType = ["patient", "doctor"].includes(body.senderType) ? body.senderType : auth.role;
    if (!requireConsultSender(req, res, auth, senderType)) return;
    const signal = {
      id: crypto.randomUUID(),
      roomId: consultationSignalsRoom,
      type,
      senderType,
      payload: body.payload || null,
      createdAt: new Date().toISOString()
    };
    appendConsultSignal(consultationSignalsRoom, signal);
    return sendJson(res, 201, { ok: true, signal });
  }

  const consultationRoom = consultationPath(url.pathname);
  if (req.method === "GET" && consultationRoom) {
    const auth = authorizeConsultation(req, res, url, consultationRoom);
    if (!auth) return;
    const snapshot = consultationSnapshot(consultationRoom);
    if (!snapshot.appointment) return sendError(res, 404, "Consultation room not found.");
    return sendJson(res, 200, snapshot);
  }

  if (req.method === "GET" && url.pathname === "/api/doctor/session") {
    const session = getDoctorSession(req);
    return sendJson(res, 200, {
      authenticated: Boolean(session),
      doctor: session ? doctorProfile(session.doctor) : null,
      csrfToken: session ? session.csrfToken : null
    });
  }

  if (req.method === "POST" && url.pathname === "/api/doctor/session") {
    if (!rateLimit(req, res, "doctor-login", 8, 60_000)) return;
    const body = await readJsonBody(req);
    const doctorId = validateText(body.doctorId, 80);
    const accessCode = String(body.accessCode || "").trim();
    const doctor = readDoctors().find((item) => item.id === doctorId && item.status === "approved");
    if (!doctor) return sendError(res, 401, "Approved doctor account not found.");

    const licenseCode = String(doctor.license || "").replace(/[^a-z0-9]/gi, "").slice(-4).toLowerCase();
    const expectedCodes = [DOCTOR_LOGIN_CODE.toLowerCase(), licenseCode].filter(Boolean);
    if (!expectedCodes.some((code) => safeEqual(accessCode.toLowerCase(), code))) {
      return sendError(res, 401, "Invalid doctor access code.");
    }

    const session = createDoctorSession(doctor.id);
    return sendJson(res, 200, {
      ok: true,
      authenticated: true,
      doctor: doctorProfile(doctor),
      csrfToken: session.csrfToken
    }, {
      "Set-Cookie": cookieHeader(DOCTOR_SESSION_COOKIE, session.id, req)
    });
  }

  if (req.method === "DELETE" && url.pathname === "/api/doctor/session") {
    const session = requireDoctor(req, res, { csrf: true });
    if (!session) return;
    destroyDoctorSession(req);
    return sendJson(res, 200, { ok: true, authenticated: false }, {
      "Set-Cookie": cookieHeader(DOCTOR_SESSION_COOKIE, "", req, { maxAge: 0 })
    });
  }

  if (req.method === "GET" && url.pathname === "/api/doctor/appointments") {
    const session = requireDoctor(req, res);
    if (!session) return;
    const appointments = readAppointments()
      .filter((appointment) => appointment.doctorId === session.doctor.id)
      .map((appointment) => ({
        ...publicAppointmentPayload(appointment),
        phone: appointment.phone ? `${appointment.phone.slice(0, 2)}******${appointment.phone.slice(-2)}` : ""
      }));
    return sendJson(res, 200, {
      doctor: doctorProfile(session.doctor),
      appointments,
      metrics: appointmentMetrics(appointments),
      reviews: doctorReviews(session.doctor, appointments)
    });
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/doctor/appointments/")) {
    const session = requireDoctor(req, res, { csrf: true });
    if (!session) return;
    if (!rateLimit(req, res, "doctor-appointment-write", 60, 60_000)) return;
    const appointmentId = decodeURIComponent(url.pathname.split("/").pop());
    const body = await readJsonBody(req);
    const nextStatus = validateText(body.status, 30);
    if (!["confirmed", "completed", "cancelled"].includes(nextStatus)) {
      return sendError(res, 400, "Unsupported appointment status.");
    }
    const appointments = readAppointments();
    const appointment = appointments.find((item) => item.id === appointmentId && item.doctorId === session.doctor.id);
    if (!appointment) return sendError(res, 404, "Appointment not found.");
    appointment.status = nextStatus;
    appointment.updatedAt = new Date().toISOString();
    writeAppointments(appointments);
    return sendJson(res, 200, { ok: true, appointment });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/session") {
    const session = getSession(req);
    return sendJson(res, 200, {
      authenticated: Boolean(session),
      username: session ? ADMIN_USERNAME : null,
      csrfToken: session ? session.csrfToken : null
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/session") {
    if (!rateLimit(req, res, "admin-login", 5, 60_000)) return;
    const body = await readJsonBody(req);
    const username = validateText(body.username, 80);
    const password = String(body.password || "");
    if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
      addAudit(`Failed admin login from ${clientIp(req)}`);
      return sendError(res, 401, "Invalid admin credentials.");
    }
    const session = createSession();
    addAudit(`Admin login from ${clientIp(req)}`);
    return sendJson(res, 200, {
      ok: true,
      authenticated: true,
      username: ADMIN_USERNAME,
      csrfToken: session.csrfToken
    }, {
      "Set-Cookie": cookieHeader(SESSION_COOKIE, session.id, req)
    });
  }

  if (req.method === "DELETE" && url.pathname === "/api/admin/session") {
    const session = requireAdmin(req, res, { csrf: true });
    if (!session) return;
    destroySession(req);
    addAudit("Admin logout");
    return sendJson(res, 200, { ok: true, authenticated: false }, {
      "Set-Cookie": cookieHeader(SESSION_COOKIE, "", req, { maxAge: 0 })
    });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/events") {
    const session = requireAdmin(req, res);
    if (!session) return;
    writeHead(res, 200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    adminClients.add(res);
    sendEvent(res, "connected", liveSnapshot());
    req.on("close", () => adminClients.delete(res));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/doctors") {
    const session = requireAdmin(req, res);
    if (!session) return;
    const doctors = readDoctors();
    return sendJson(res, 200, { doctors, audit: readAudit(), metrics: doctorMetrics(doctors) });
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/admin/doctors/")) {
    const session = requireAdmin(req, res, { csrf: true });
    if (!session) return;
    if (!rateLimit(req, res, "admin-doctor-write", 60, 60_000)) return;
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const body = await readJsonBody(req);
    const doctors = readDoctors();
    const doctor = doctors.find((item) => item.id === id);
    if (!doctor) return sendJson(res, 404, { ok: false, message: "Doctor not found" });

    if (["pending", "approved", "rejected"].includes(body.status)) {
      doctor.status = body.status;
      if (body.status === "rejected") doctor.verified = false;
    }
    if (typeof body.verified === "boolean") {
      // Historical metadata only; approval status is the single public visibility gate.
      doctor.verified = body.verified;
    }
    doctor.updatedAt = new Date().toISOString();
    writeDoctors(doctors);
    addAudit(body.auditMessage || `Updated ${doctor.name}`);
    const snapshot = liveSnapshot();
    broadcastTo(adminClients, "doctors-updated", snapshot);
    broadcastTo(publicClients, "doctors-updated", publicSnapshot());
    return sendJson(res, 200, { ok: true, doctor, ...snapshot });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/doctors/bulk-approve") {
    const session = requireAdmin(req, res, { csrf: true });
    if (!session) return;
    if (!rateLimit(req, res, "admin-bulk-approve", 12, 60_000)) return;
    const doctors = readDoctors();
    let changed = 0;
    doctors.forEach((doctor) => {
      if (doctor.status === "pending") {
        doctor.status = "approved";
        doctor.updatedAt = new Date().toISOString();
        changed += 1;
      }
    });
    writeDoctors(doctors);
    addAudit(`Approved ${changed} pending doctors`);
    const snapshot = liveSnapshot();
    broadcastTo(adminClients, "doctors-updated", snapshot);
    broadcastTo(publicClients, "doctors-updated", publicSnapshot());
    return sendJson(res, 200, { ok: true, changed, ...snapshot });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/doctors/reset") {
    const session = requireAdmin(req, res, { csrf: true });
    if (!session) return;
    if (!rateLimit(req, res, "admin-reset", 6, 60_000)) return;
    writeDoctors(seedDoctors);
    writeAudit([]);
    const snapshot = liveSnapshot();
    broadcastTo(adminClients, "doctors-updated", snapshot);
    broadcastTo(publicClients, "doctors-updated", publicSnapshot());
    return sendJson(res, 200, { ok: true, ...snapshot });
  }

  if (req.method === "GET" && url.pathname === "/api/services") {
    return sendJson(res, 200, { services, nearbyProviders });
  }

  if (req.method === "GET" && url.pathname === "/api/nearby") {
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const type = url.searchParams.get("type") || "all";
    const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    return sendJson(res, 200, {
      providers: nearbyForLocation({ lat: hasValidCoords ? lat : NaN, lng: hasValidCoords ? lng : NaN }, type),
      locationAllowed: hasValidCoords
    });
  }

  if (req.method === "POST" && url.pathname === "/api/location") {
    if (!rateLimit(req, res, "location", 30, 60_000)) return;
    const body = await readJsonBody(req);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    return sendJson(res, 200, {
      ok: true,
      location: hasValidCoords ? { lat, lng, accuracy: Number(body.accuracy) || null } : null,
      areaLabel: hasValidCoords ? "Nearby care around your current location" : "Guwahati, Assam",
      nearby: nearbyForLocation({ lat: hasValidCoords ? lat : NaN, lng: hasValidCoords ? lng : NaN })
    });
  }

  if (req.method === "POST" && url.pathname === "/api/appointments") {
    if (!rateLimit(req, res, "appointments", 20, 10 * 60_000)) return;
    const body = await readJsonBody(req);
    const doctors = readDoctors();
    const requestedDoctorId = validateText(body.doctorId, 80);
    const requestedDoctorName = validateText(body.doctorName, 120);
    const doctor = doctors.find((item) => item.status === "approved" && (
      item.id === requestedDoctorId || item.name === requestedDoctorName
    ));

    if (!doctor) {
      return sendError(res, 400, "Doctor is not available for booking.");
    }

    const patientName = validateText(body.patientName, 80);
    const phone = validateText(String(body.phone || "").replace(/\D/g, ""), 15);
    if (!patientName || phone.length < 10) {
      return sendError(res, 400, "Valid patient name and mobile number are required.");
    }

    const consultToken = crypto.randomBytes(32).toString("base64url");
    const appointment = {
      id: crypto.randomUUID(),
      trackingId: `DHQ-${Date.now().toString(36).toUpperCase()}`,
      roomId: crypto.randomBytes(8).toString("hex").toUpperCase(),
      doctorId: doctor.id,
      doctorName: doctor.name,
      doctorImage: doctor.image,
      specialty: doctor.specialty,
      patientName,
      phone,
      slot: validateText(body.slot, 80, doctor.nextSlot || "Today, 06:00 PM"),
      concern: validateText(body.concern, 500),
      mode: "video-chat",
      status: "confirmed",
      consultTokenHash: hashConsultToken(consultToken),
      createdAt: new Date().toISOString()
    };
    const appointments = readAppointments();
    appointments.unshift(appointment);
    writeAppointments(appointments.slice(0, 500));
    appendConsultMessage(appointment.roomId, {
      id: crypto.randomUUID(),
      roomId: appointment.roomId,
      senderType: "doctor",
      senderName: appointment.doctorName,
      text: `Hi ${appointment.patientName}, your appointment is confirmed for ${appointment.slot}. You can share symptoms here or join the video call.`,
      createdAt: new Date().toISOString()
    });
    if (appointment.concern) {
      appendConsultMessage(appointment.roomId, {
        id: crypto.randomUUID(),
        roomId: appointment.roomId,
        senderType: "patient",
        senderName: appointment.patientName,
        text: appointment.concern,
        createdAt: new Date().toISOString()
      });
    }
    return sendJson(res, 201, { ok: true, appointment: { ...publicAppointmentPayload(appointment), consultToken } });
  }

  if (req.method === "POST" && url.pathname === "/api/service-requests") {
    if (!rateLimit(req, res, "service-requests", 20, 10 * 60_000)) return;
    const body = await readJsonBody(req);
    const requests = readRequests();
    const request = {
      id: crypto.randomUUID(),
      trackingId: `MC-${Date.now().toString(36).toUpperCase()}`,
      serviceId: validateText(body.serviceId, 80, "general"),
      serviceTitle: validateText(body.serviceTitle, 120, "Healthcare Service"),
      name: validateText(body.name, 80, "Guest User"),
      phone: validateText(body.phone, 24),
      note: validateText(body.note, 500),
      location: body.location || null,
      status: "received",
      createdAt: new Date().toISOString()
    };
    requests.unshift(request);
    writeRequests(requests.slice(0, 250));
    return sendJson(res, 201, { ok: true, request });
  }

  return sendError(res, 404, "API route not found");
}

function serveStatic(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method)) {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  const filePath = safeStaticPath(url.pathname);
  if (!filePath || !fs.existsSync(filePath)) {
    writeHead(res, 404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  writeHead(res, 200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=86400"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

ensureDataStore();

const server = http.createServer(async (req, res) => {
  if (req.url.length > 2048) {
    sendError(res, 414, "Request URL too long.");
    return;
  }

  if (req.method === "OPTIONS") {
    writeHead(res, 204, { "Cache-Control": "no-store" });
    res.end();
    return;
  }

  if (!["GET", "HEAD", "POST", "PATCH", "DELETE"].includes(req.method)) {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  } catch {
    sendError(res, 400, "Bad request.");
    return;
  }

  try {
    if (url.pathname.startsWith("/api/")) {
      if (!rateLimit(req, res, "api-global", 600, 60_000)) return;
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    sendError(res, error.status || 500, error.message || "Server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Listening on ${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
