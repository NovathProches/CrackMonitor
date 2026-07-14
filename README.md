# CrackMonitor

Automated railway crack detection and maintenance management platform. An ESP32-CAM device captures images of rail surfaces, sends them to the backend for AI-powered crack analysis, and surfaces the results through a web dashboard.

## Architecture

```
crack-monitor/
  backend/          Django 6 + DRF backend (API + CV processing + static file serving)
    api/            REST API views, models, serializers, URL routes
    crackmonitor/   Django project settings and WSGI entry point
    crack_detector.py  OpenCV/Pillow crack measurement pipeline
    react_build/    Built React app — served by WhiteNoise at /static/
    media/          Uploaded images (raw captures + annotated overlays)
    db.sqlite3      SQLite database
    requirements.txt
  web/              React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
  esp32cam/         Arduino firmware for the ESP32-CAM capture device
```

Everything runs on a single origin (`http://localhost:8000`). The React build is served by the Django backend via WhiteNoise — no separate frontend dev server is needed in production.

## Quick start

### Prerequisites

| Tool   | Version |
|--------|---------|
| Python | ≥ 3.11  |
| Node   | ≥ 20    |
| npm    | ≥ 10    |

---

### 1 – Run the server (Windows)

Double-click **`start.bat`** or run it from the terminal:

```bat
start.bat
```

This will:
1. Create a `.venv` virtual environment inside `backend/` if one doesn't exist
2. Install Python dependencies from `backend/requirements.txt`
3. Apply database migrations
4. Start Django on `http://0.0.0.0:8000`

The web dashboard is then available at **`http://localhost:8000`**.

---

### 2 – Run the server (macOS / Linux)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate --run-syncdb
.venv/bin/python manage.py runserver 0.0.0.0:8000
```

---

### 3 – Create the first user

```bash
cd backend
.venv/bin/python manage.py createsuperuser
```

Log in at `http://localhost:8000` with those credentials.

---

### 4 – Develop the frontend

The pre-built React app (`backend/react_build/`) is already committed and served immediately. To work on the frontend:

```bash
cd web
npm install
npm run dev       # Vite dev server → http://localhost:5173 (proxies API to :8000)
```

When ready to ship changes:

```bash
cd web
npm run build     # outputs to backend/react_build/
```

---

## Environment variables

Create `backend/.env` (copy from `backend/.env.example` if present):

| Variable        | Default                          | Description                        |
|-----------------|----------------------------------|------------------------------------|
| `SECRET_KEY`    | `dev-only-secret-key-...`        | Django secret key — **change in production** |
| `DEBUG`         | `true`                           | Set to `false` in production       |
| `ALLOWED_HOSTS` | `*`                              | Comma-separated list of allowed hostnames |

---

## API overview

All endpoints are under `/api/` and require a `Token <token>` header except login.

| Method | Endpoint                        | Description                        |
|--------|---------------------------------|------------------------------------|
| POST   | `/api/auth/login/`              | Obtain auth token                  |
| GET    | `/api/detections/`              | List crack detections (paginated)  |
| POST   | `/api/detections/`              | Ingest a new detection (ESP32-CAM) |
| GET    | `/api/tickets/`                 | List maintenance tickets           |
| GET    | `/api/engineers/`               | List engineers                     |
| GET    | `/api/devices/`                 | List registered devices            |
| GET    | `/api/stats/dashboard/`         | Overview statistics                |
| GET    | `/api/stats/reports/`           | Report data for a time period      |
| GET    | `/api/stats/reports/export/`    | Download report as CSV or PDF      |
| GET    | `/api/health/`                  | Health check (no auth required)    |

### Report export

```
GET /api/stats/reports/export/?period=30&output=csv
GET /api/stats/reports/export/?period=30&output=pdf
```

`period` — number of days (7, 30, 90). `output` — `csv` or `pdf`.

---

## ESP32-CAM firmware

The Arduino sketch lives in `esp32cam/esp32cam.ino`. It:
1. Captures a JPEG frame from the camera
2. POSTs it to `http://<server-ip>:8000/api/detections/` with the device token in the `Authorization` header
3. The backend runs crack detection (OpenCV contour analysis) and stores the result

Flash instructions are in the sketch header comments.

---

## Tech stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Backend    | Django 6, Django REST Framework 3.15, SQLite    |
| CV         | OpenCV (headless), NumPy, Pillow, ReportLab     |
| Frontend   | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts, Leaflet |
| Auth       | DRF `TokenAuthentication` (token in localStorage) |
| Static     | WhiteNoise (compression + long-lived caching)   |
| Device     | ESP32-CAM (Arduino framework)                   |
