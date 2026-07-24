#!/bin/bash
# ============================================================
#  KBU-MedLab — ONE-CLICK LAUNCHER
#  Double-click this file. It starts BOTH servers, waits until
#  they are healthy, and opens your browser automatically.
#  KEEP THIS WINDOW OPEN while using the site. Ctrl+C stops all.
# ============================================================

export PATH="$HOME/.npm-global/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
ROOT="$HOME/Desktop/TEKNOFEST_ONCOLOGY/DENEME/website_3"
IP="192.168.78.218"

cleanup() {
  echo; echo "Stopping servers..."
  kill "$BE" "$FE" 2>/dev/null
  pkill -f "uvicorn main:app" 2>/dev/null
  pkill -f "vite" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# 1) free the ports from any stale processes
for p in 5173 8001; do
  pids=$(lsof -nP -tiTCP:$p -sTCP:LISTEN 2>/dev/null)
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null
done

# 2) BACKEND
echo "==> Starting backend (port 8001)..."
cd "$ROOT/backend" || { echo "ERROR: backend folder missing"; read -r; exit 1; }
# Prefer system Python for uvicorn — the backend .venv can hang importing the
# scientific stack on some setups. Fall back to the venv only if system Python
# lacks the web deps. (The predictor itself already runs under system Python.)
SYS_PY="/Library/Frameworks/Python.framework/Versions/3.14/bin/python3"
if [ -x "$SYS_PY" ] && "$SYS_PY" -c "import fastapi,uvicorn,numpy,pandas,multipart" >/dev/null 2>&1; then
  echo "    (backend interpreter: system Python)"
  "$SYS_PY" -m uvicorn main:app --host 0.0.0.0 --port 8001 >/tmp/kbu_backend.log 2>&1 &
else
  echo "    (backend interpreter: .venv)"
  # shellcheck disable=SC1091
  source .venv/bin/activate
  uvicorn main:app --host 0.0.0.0 --port 8001 >/tmp/kbu_backend.log 2>&1 &
fi
BE=$!
for i in $(seq 1 60); do curl -s http://127.0.0.1:8001/api/health >/dev/null 2>&1 && break; sleep 0.5; done
if curl -s http://127.0.0.1:8001/api/health >/dev/null 2>&1; then
  echo "    backend OK."
else
  echo "    BACKEND FAILED TO START — log below:"; tail -25 /tmp/kbu_backend.log
  echo "Press Enter to close."; read -r; exit 1
fi

# 3) FRONTEND
echo "==> Starting frontend (port 5173)..."
cd "$ROOT/frontend" || { echo "ERROR: frontend folder missing"; read -r; exit 1; }
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found on PATH."; echo "Press Enter to close."; read -r; exit 1
fi
npm run dev >/tmp/kbu_frontend.log 2>&1 &
FE=$!
for i in $(seq 1 90); do lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1 && break; sleep 0.5; done
if lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "    frontend OK."
else
  echo "    FRONTEND FAILED TO START — log below:"; tail -25 /tmp/kbu_frontend.log
  echo "Press Enter to close."; read -r; cleanup
fi

# 4) open the browser automatically (LOCALHOST — always works on this machine)
echo ""
echo "=================================================="
echo "  READY. Opening: http://localhost:5173"
echo "  If it doesn't open, paste that URL in your browser:"
echo "     http://localhost:5173"
echo "  (LAN access, if ever needed: http://$IP:5173)"
echo "=================================================="
sleep 1
open "http://localhost:5173" 2>/dev/null

echo ""
echo ">>> Both servers are running. KEEP THIS WINDOW OPEN. <<<"
echo ">>> Press Ctrl+C here to stop everything.            <<<"
wait
