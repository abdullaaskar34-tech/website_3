#!/bin/bash
# Double-click this file to start the KBU-MedLab BACKEND.
# Keep the window that opens OPEN while you use the site.
cd "$HOME/Desktop/TEKNOFEST_ONCOLOGY/DENEME/website_3/backend" || { echo "backend folder not found"; read -r; exit 1; }

# free port 8001 if a stale process is holding it
pids=$(lsof -nP -tiTCP:8001 -sTCP:LISTEN 2>/dev/null)
[ -n "$pids" ] && { echo "Freeing port 8001 (killing $pids)"; kill -9 $pids 2>/dev/null; }

source .venv/bin/activate
echo "======================================================"
echo " KBU-MedLab BACKEND starting on http://0.0.0.0:8001"
echo " Health check: http://192.168.78.218:8001/api/health"
echo " Leave this window OPEN. Press Ctrl+C to stop."
echo "======================================================"
exec uvicorn main:app --host 0.0.0.0 --port 8001 --reload
