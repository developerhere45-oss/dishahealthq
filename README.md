# DHQ Healthcare

Disha HealthQ healthcare web prototype for doctor appointment booking, hospital services, nearby care tracking and complete care services from the attached DHQ feature chart.

## Run

For local development:

```bash
node server.js
```

Then open `http://127.0.0.1:5175/`.

For production-style local run, configure `.env` and use:

```bash
npm run start:prod
```

Or double-click `start-production.bat` on Windows.

Admin login is required at `/admin.html` on the same host.
The local production credentials are stored in `.env`; rotate `ADMIN_PASSWORD` and `SESSION_SECRET` before public deployment.

If running behind HTTPS/reverse proxy, set:

```env
TRUST_PROXY=true
SECURE_COOKIES=true
HOST=0.0.0.0
```

Use `0.0.0.0` for production platforms like Render so the web service can detect the open port. Local development still works at `http://127.0.0.1:5175/`.

The backend creates a local SQLite database automatically at:

```text
data/disha-healthq.sqlite
```

Existing JSON data is migrated on first run. JSON files remain for local fallback/migration, but SQLite is now the main store for doctors, appointments, service requests, consultation messages and VC signaling metadata.

## Included Features

- Doctor search, filters, clinic/video/home booking and payment choices
- Online consultation slots, appointment reminders and success toast
- Hospital bed availability with ICU, oxygen and general bed status
- Medicine prescription upload and nearby pharmacy ordering
- Home lab tests and report downloads
- Emergency SOS, live location status and ambulance ETA
- AI symptom checker with smart care routes
- Digital health profile, prescriptions, reports and reminders
- Subscription plans, wellness, mental health, women and child care, elderly care, blood services, insurance help, student plans and nearby tracking
- Multi-language selector for English, Hindi, Assamese and Bengali support
- Password-protected admin page for approving and rejecting doctor applications

## Production Security Added

- Admin login with HTTP-only session cookie
- CSRF token required for admin write actions
- Public live events only expose approved public doctors
- Admin APIs and admin live events require authentication
- SQLite-backed persistence for doctors, appointments, service requests, consultation messages and recent VC signaling
- Patient consultation rooms require a per-appointment room token; doctors access rooms only through their approved doctor session
- Doctor chat and VC signaling writes require CSRF protection
- Security headers including CSP, frame blocking and nosniff
- Static file allowlist blocks `.env`, backend source, logs and `data/*.json`
- Request size limits, rate limits and validated location/service request inputs
