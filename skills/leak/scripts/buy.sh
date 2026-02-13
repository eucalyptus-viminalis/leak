#!/usr/bin/env bash
set -euo pipefail

LEAK_CLI_VERSION="2026.2.14"

# Buy from a leak promo URL (/) or buy URL (/download) and save the artifact.
#
# Usage:
#   bash skills/leak/scripts/buy.sh <promo_or_download_url> (--buyer-private-key-file <path> | --buyer-private-key-stdin) [--out <path> | --basename <name>]
#
# Examples:
#   bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/" --buyer-private-key-file ./buyer.key
#   cat ./buyer.key | bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/download" --buyer-private-key-stdin --basename myfile
#   bash skills/leak/scripts/buy.sh "https://xxxx.trycloudflare.com/" --buyer-private-key-file ./buyer.key --out ./downloads/myfile.bin

run_leak() {
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

if [ "$#" -lt 1 ]; then
  echo "Usage: bash skills/leak/scripts/buy.sh <promo_or_download_url> (--buyer-private-key-file <path> | --buyer-private-key-stdin) [--out <path> | --basename <name>]"
  exit 1
fi

DOWNLOAD_URL="$1"
shift

for ARG in "$@"; do
  case "$ARG" in
    --buyer-private-key|--buyer-private-key=*)
      echo "[leak-skill] ERROR: --buyer-private-key is no longer supported."
      echo "[leak-skill] Use --buyer-private-key-file <path> or --buyer-private-key-stdin."
      exit 1
      ;;
  esac
done

run_leak buy "$DOWNLOAD_URL" "$@"
