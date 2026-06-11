#!/usr/bin/env bash
# CodeScope startup script

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=${PORT:-8765}

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║      CodeScope v1.0               ║"
echo "  ║   C++ Interactive Debugger        ║"
echo "  ╚═══════════════════════════════════╝"
echo ""

# Check deps
command -v g++ >/dev/null 2>&1 || { echo "ERROR: g++ not found. sudo apt install g++"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 not found"; exit 1; }

python3 -c "import fastapi, uvicorn" 2>/dev/null || {
    echo "Installing Python deps..."
    pip3 install fastapi uvicorn python-multipart --break-system-packages -q
}

# Build frontend if needed
STATIC="$DIR/backend/static/index.html"
FRONTEND="$DIR/frontend-app"
if [ ! -f "$STATIC" ] || [ "$FRONTEND/src/App.jsx" -nt "$STATIC" ]; then
    echo "Building frontend..."
    command -v node >/dev/null 2>&1 || { echo "ERROR: node not found. Install Node.js 18+"; exit 1; }
    cd "$FRONTEND" && npm install -s && npm run build -s && cd "$DIR"
fi

echo "  → http://localhost:$PORT"
echo "  → Ctrl+C to stop"
echo ""

cd "$DIR/backend"
exec python3 -m uvicorn main:app --host 0.0.0.0 --port $PORT
