#!/usr/bin/env bash
set -euo pipefail

# Buy from a leak promo URL (/) or buy URL (/download) and save the artifact.
#
# Usage:
#   bash skills/leak/scripts/buy.sh <promo_or_download_url> --buyer-private-key 0x... [--out <path> | --basename <name>]
#
# Examples:
#   bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/" --buyer-private-key 0x...
#   bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/download" --buyer-private-key 0x... --basename myfile
#   bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/" --buyer-private-key 0x... --out ./downloads/myfile.bin

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure CLI exists (may npm link)
bash "$SCRIPT_DIR/ensure_leak.sh" >/dev/null || true

# Make sure this shell can see global npm bins.
NPM_PREFIX_GLOBAL="$(npm prefix -g)"
export PATH="$NPM_PREFIX_GLOBAL/bin:$PATH"

run_leak() {
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

if [ "$#" -lt 1 ]; then
  echo "Usage: bash skills/leak/scripts/buy.sh <promo_or_download_url> --buyer-private-key 0x... [--out <path> | --basename <name>]"
  exit 1
fi

DOWNLOAD_URL="$1"
shift

run_leak buy "$DOWNLOAD_URL" "$@"
