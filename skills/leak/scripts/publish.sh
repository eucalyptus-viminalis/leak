#!/usr/bin/env bash
set -euo pipefail

LEAK_CLI_VERSION="2026.2.14"
PUBLIC_CONFIRM_PHRASE="I_UNDERSTAND_PUBLIC_EXPOSURE"

# Publish a file with the leak server and print a clear share link.
#
# Usage:
#   bash skills/leak/scripts/publish.sh --file ./protected/asset.bin --price 0.01 --window 15m --pay-to 0x... [--network eip155:84532] [--port 4021] [--confirmed] [--public]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$SKILL_DIR/../.." && pwd)"   # leak repo root

run_leak() {
  if command -v leak >/dev/null 2>&1; then
    leak "$@"
    return
  fi
  if command -v npx >/dev/null 2>&1; then
    npx -y "leak-cli@${LEAK_CLI_VERSION}" "$@"
    return
  fi
  echo "[leak-skill] ERROR: leak not found on PATH and npx is unavailable."
  echo "[leak-skill] Install leak-cli (npm i -g leak-cli) or install Node/npm to use npx fallback."
  exit 1
}

exec_leak() {
  if command -v leak >/dev/null 2>&1; then
    exec leak "$@"
  fi
  if command -v npx >/dev/null 2>&1; then
    exec npx -y "leak-cli@${LEAK_CLI_VERSION}" "$@"
  fi
  echo "[leak-skill] ERROR: leak not found on PATH and npx is unavailable."
  echo "[leak-skill] Install leak-cli (npm i -g leak-cli) or install Node/npm to use npx fallback."
  exit 1
}

# Run from repo root so relative paths behave like the README examples.
cd "$REPO_DIR"

# Build args for `leak leak ...`
ARGS=("leak")

# Determine effective local port for display purposes and public confirmation state.
PORT=4021
HAS_PUBLIC=0
HAS_PUBLIC_CONFIRM=0
PREV=""
for ARG in "$@"; do
  if [ "$PREV" = "--port" ]; then
    PORT="$ARG"
    PREV=""
    continue
  fi
  if [ "$PREV" = "--public-confirm" ]; then
    HAS_PUBLIC_CONFIRM=1
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
    --public)
      HAS_PUBLIC=1
      ;;
    --public-confirm)
      HAS_PUBLIC_CONFIRM=1
      PREV="--public-confirm"
      ;;
    --public-confirm=*)
      HAS_PUBLIC_CONFIRM=1
      ;;
  esac
done

if [ "$HAS_PUBLIC" -eq 1 ] && [ "$HAS_PUBLIC_CONFIRM" -eq 0 ]; then
  if [ -t 0 ] && [ -t 1 ]; then
    echo "[leak-skill] You are about to expose a local file to the public internet."
    read -r -p "[leak-skill] Type ${PUBLIC_CONFIRM_PHRASE} to continue: " CONFIRM
    if [ "$CONFIRM" != "$PUBLIC_CONFIRM_PHRASE" ]; then
      echo "[leak-skill] Public exposure confirmation failed. Aborting."
      exit 1
    fi
    ARGS+=("--public-confirm" "$PUBLIC_CONFIRM_PHRASE")
  else
    echo "[leak-skill] ERROR: --public requires --public-confirm ${PUBLIC_CONFIRM_PHRASE} in non-interactive mode."
    exit 1
  fi
fi

# Pass through all flags.
ARGS+=("$@")

# If --public is used, extract the tunnel URL and print a share link at the end.
if [ "$HAS_PUBLIC" -eq 1 ]; then
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
    echo "[leak-skill] PROMO LINK: ${URL}/"
    echo "[leak-skill] BUY LINK:   ${URL}/download"
  fi

  exit "$CODE"
else
  echo "[leak-skill] Starting leak server (no public tunnel)."
  echo "[leak-skill] Local promo link (same machine): http://127.0.0.1:${PORT}/"
  echo "[leak-skill] Local buy link (same machine):   http://127.0.0.1:${PORT}/download"
  echo "[leak-skill] Tip: to expose publicly, re-run with --public (requires cloudflared)."
  exec_leak "${ARGS[@]}"
fi
