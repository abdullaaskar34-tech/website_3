#!/bin/bash
# Double-click this file to start the KBU-MedLab FRONTEND.
# Keep the window that opens OPEN while you use the site.

# When launched by double-click, macOS uses a minimal PATH that misses the
# user's npm/node locations. Add them explicitly so `npm` is found.
export PATH="$HOME/.npm-global/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

cd "$HOME/Desktop/TEKNOFEST_ONCOLOGY/DENEME/website_3/frontend" || {
  echo "ERROR: frontend folder not found"; echo "Press Enter to close."; read -r; exit 1;
}

# Make sure npm is actually available before trying to use it.
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: 'npm' was not found on PATH."
  echo "Node/npm may be installed elsewhere. Run 'which npm' in Terminal and tell Claude the path."
  echo "Press Enter to close."; read -r; exit 1
fi

# free port 5173 if a stale process is holding it
pids=$(lsof -nP -tiTCP:5173 -sTCP:LISTEN 2>/dev/null)
[ -n "$pids" ] && { echo "Freeing port 5173 (killing $pids)"; kill -9 $pids 2>/dev/null; }

echo "======================================================"
echo " Using npm at: $(command -v npm)  (v$(npm -v 2>/dev/null))"
echo " KBU-MedLab FRONTEND starting on http://0.0.0.0:5173"
echo " Open in browser:  http://192.168.78.218:5173"
echo " Leave this window OPEN. Press Ctrl+C to stop."
echo "======================================================"

npm run dev
# If npm exits (error or Ctrl+C), keep the window open so the message is visible.
echo ""
echo "==== the frontend server stopped. Read any message above. ===="
echo "Press Enter to close this window."
read -r
