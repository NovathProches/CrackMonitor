@echo off
echo Starting CrackMonitor...
cd /d "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
    echo Creating virtual environment...
    python -m venv .venv
    .venv\Scripts\pip install -r requirements.txt
)
echo Running on http://localhost:8000
.venv\Scripts\python manage.py migrate --run-syncdb
.venv\Scripts\python manage.py runserver 0.0.0.0:8000
