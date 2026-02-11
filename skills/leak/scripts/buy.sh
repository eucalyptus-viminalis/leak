#!/usr/bin/env bash
set -euo pipefail

# Buy a leak (/download) URL and save the artifact.
#
# Usage:
#   bash skills/leak/scripts/buy.sh <download_url> --buyer-private-key 0x... [--out <path> | --basename <name>]
#
# Examples:
#   bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/download" --buyer-private-key 0x...
#   bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/download" --buyer-private-key 0x... --basename myfile
#   bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/download" --buyer-private-key 0x... --out ./downloads/myfile.bin

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure CLI exists (may npm link)
bash "$SCRIPT_DIR/ensure_leak.sh" >/dev/null || true

# Make sure this shell can see global npm bins.
NPM_PREFIX_GLOBAL="$(npm prefix -g)"
export PATH="$NPM_PREFIX_GLOBAL/bin:$PATH"

if ! command -v leak >/dev/null 2>&1; then
  echo "[leak-skill] ERROR: leak not found on PATH even after ensure."
  echo "[leak-skill] Try opening a new shell or add: export PATH=\"$NPM_PREFIX_GLOBAL/bin:\$PATH\""
  exit 1
fi

if [ "$#" -lt 1 ]; then
  echo "Usage: bash skills/leak/scripts/buy.sh <download_url> --buyer-private-key 0x... [--out <path> | --basename <name>]"
  exit 1
fi

DOWNLOAD_URL="$1"
shift

exec leak buy "$DOWNLOAD_URL" "$@"
