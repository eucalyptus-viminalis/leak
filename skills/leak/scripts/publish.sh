#!/usr/bin/env bash
set -euo pipefail

# Publish a file with the leak server and print a clear share link.
#
# Usage:
#   bash skills/leak/scripts/publish.sh --file ./protected/asset.bin --price 0.01 --window 15m --pay-to 0x... [--network eip155:84532] [--port 4021] [--confirmed] [--public]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$SKILL_DIR/../.." && pwd)"   # leak repo root

# Ensure CLI exists (may npm link)
bash "$SCRIPT_DIR/ensure_leak.sh" >/dev/null || true

# Make sure this shell can see global npm bins (npm@10 doesn't support `npm bin -g`).
NPM_PREFIX_GLOBAL="$(npm prefix -g)"
export PATH="$NPM_PREFIX_GLOBAL/bin:$PATH"

run_leak() {
  if command -v leak >/dev/null 2>&1; then
    leak "$@"
    return
  fi
  if command -v npx >/dev/null 2>&1; then
    npx -y leak-cli "$@"
    return
  fi
  echo "[leak-skill] ERROR: leak not found on PATH and npx is unavailable."
  echo "[leak-skill] Run: bash skills/leak/scripts/ensure_leak.sh"
  echo "[leak-skill] Or install Node/npm and retry with npx fallback."
  exit 1
}

exec_leak() {
  if command -v leak >/dev/null 2>&1; then
    exec leak "$@"
  fi
  if command -v npx >/dev/null 2>&1; then
    exec npx -y leak-cli "$@"
  fi
  echo "[leak-skill] ERROR: leak not found on PATH and npx is unavailable."
  echo "[leak-skill] Run: bash skills/leak/scripts/ensure_leak.sh"
  echo "[leak-skill] Or install Node/npm and retry with npx fallback."
  exit 1
}

# Run from repo root so relative paths behave like the README examples.
cd "$REPO_DIR"

# Build args for `leak leak ...`
ARGS=("leak")

# Determine effective local port for display purposes.
PORT=4021
PREV=""
for ARG in "$@"; do
  if [ "$PREV" = "--port" ]; then
    PORT="$ARG"
    PREV=""
    continue
  fi
  case "$ARG" in
    --port)
      PREV="--port"
      ;;
    --port=*)
      PORT="${ARG#--port=}"
      ;;
  esac
done

# Pass through all flags.
# NOTE: we intentionally don't try to interpret or validate; leak.js already does that.
ARGS+=("$@")

# If --public is used, extract the tunnel URL and print a share link at the end.
if printf '%s\n' "$@" | grep -q -- '--public'; then
  TMP="$(mktemp)"
  set +e
  run_leak "${ARGS[@]}" 2>&1 | tee "$TMP"
  CODE=${PIPESTATUS[0]}
  set -e

  # Extract trycloudflare URL (printed by scripts/leak.js)
  URL=$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$TMP" | head -n 1 || true)
  rm -f "$TMP" || true

  if [ -n "$URL" ]; then
    echo
    echo "[leak-skill] SHARE LINK: ${URL}/download"
  fi

  exit "$CODE"
else
  echo "[leak-skill] Starting leak server (no public tunnel)."
  echo "[leak-skill] Local share link (same machine): http://127.0.0.1:${PORT}/download"
  echo "[leak-skill] Tip: to expose publicly, re-run with --public (requires cloudflared)."
  exec_leak "${ARGS[@]}"
fi
