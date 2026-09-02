#!/usr/bin/env bash
# Starts both dev processes (API + static frontend) with one command and
# stops them together on Ctrl+C. Mirrors the two manual steps in the
# "Running the dev server" section of CLAUDE.md — this script doesn't do
# anything those steps didn't already do, it just runs them together.
#
# Assumes one-time setup is already done: PostgreSQL running, server/.env
# configured, and `npm install` + `npm run migrate` already run inside
# server/ (see CLAUDE.md for those first-time steps).
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f server/.env ]; then
  echo "server/.env not found — copy/create it first (see CLAUDE.md 'Running the dev server')." >&2
  exit 1
fi

if [ ! -d server/node_modules ]; then
  echo "server/node_modules not found — run 'npm install' inside server/ first." >&2
  exit 1
fi

API_PORT="$(grep -E '^PORT=' server/.env | cut -d= -f2)"
API_PORT="${API_PORT:-8790}"
STATIC_PORT=8743

pids=()
cleanup() {
  echo
  echo "Stopping…"
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

echo "Starting API on http://localhost:${API_PORT} …"
(cd server && npm start) &
pids+=("$!")

echo "Starting static frontend on http://localhost:${STATIC_PORT} …"
python3 -m http.server "$STATIC_PORT" &
pids+=("$!")

echo
echo "Ready:"
echo "  API      http://localhost:${API_PORT}/api"
echo "  Frontend http://localhost:${STATIC_PORT}/login.html"
echo
echo "Press Ctrl+C to stop both."

wait
