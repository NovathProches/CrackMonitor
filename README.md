<<<<<<< HEAD
# Crack Monitor

Railway crack detection web platform.

## Repository structure

```
crack-monitor/
  web/          React + TypeScript + Vite + Tailwind + shadcn/ui
  cv-service/   Python FastAPI + OpenCV measurement & ingest service
  supabase/     SQL migrations
  .vscode/      Workspace settings and extension recommendations
```

## Quick start

### Prerequisites

| Tool | Version |
|------|---------|
| Node | ≥ 20 |
| npm  | ≥ 10 |
| Python | ≥ 3.11 |

---

### 1 – Web frontend

```bash
cd web
cp .env.example .env        # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev                  # → http://localhost:5173
```

---

### 2 – CV service

```bash
cd cv-service
cp .env.example .env        # fill in SUPABASE_URL and SUPABASE_SERVICE_KEY

# Windows
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn main:app --reload     # → http://localhost:8000

# macOS / Linux
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload
```

API docs auto-generated at `http://localhost:8000/docs`.

---

### 3 – Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run `supabase/migrations/0001_init.sql`.
3. Copy the **Project URL** and keys into both `.env` files.

---

## Environment variables

| Service    | Variable                 | Description                    |
|------------|--------------------------|--------------------------------|
| web        | `VITE_SUPABASE_URL`      | Supabase project URL           |
| web        | `VITE_SUPABASE_ANON_KEY` | Public anon key                |
| cv-service | `SUPABASE_URL`           | Supabase project URL           |
| cv-service | `SUPABASE_SERVICE_KEY`   | Service-role key (bypasses RLS)|

---

## Adding shadcn/ui components

```bash
cd web
npx shadcn-ui@latest add button card table ...
```
=======
# CrackMonitor
>>>>>>> 92db56f6ff2aae05bf00a76d6af854b0ddc94bbd
