#!/usr/bin/env bash
set -euo pipefail

# Buy from a leak promo URL (/) or buy URL (/download) and save the artifact.
#
# Usage:
#   bash skills/leak-buy/scripts/buy.sh <promo_or_download_url> --buyer-private-key-file <path> [--out <path> | --basename <name>]
#
# Examples:
#   bash skills/leak-buy/scripts/buy.sh "https://xxxx.trycloudflare.com/" --buyer-private-key-file ./buyer.key
#   bash skills/leak-buy/scripts/buy.sh "https://xxxx.trycloudflare.com/download" --buyer-private-key-file ./buyer.key --basename myfile
#   bash skills/leak-buy/scripts/buy.sh "https://xxxx.trycloudflare.com/" --buyer-private-key-file ./buyer.key --out ./downloads/myfile.bin

run_leak() {
  if command -v leak >/dev/null 2>&1; then
    exec leak "$@"
  fi
  echo "[leak-buy] ERROR: leak is not installed on PATH."
  echo "[leak-buy] Install leak-cli first: npm i -g leak-cli"
  exit 1
}

if [ "$#" -lt 1 ]; then
  echo "Usage: bash skills/leak-buy/scripts/buy.sh <promo_or_download_url> --buyer-private-key-file <path> [--out <path> | --basename <name>]"
  exit 1
fi

DOWNLOAD_URL="$1"
shift

BLOCKED_RAW_FLAG="--buyer-private-key"
BLOCKED_STDIN_FLAG="--buyer-private-key""-stdin"

for ARG in "$@"; do
  case "$ARG" in
    "$BLOCKED_RAW_FLAG"|"$BLOCKED_RAW_FLAG"=*)
      echo "[leak-buy] ERROR: --buyer-private-key is blocked."
      echo "[leak-buy] Use --buyer-private-key-file <path>."
      exit 1
      ;;
    "$BLOCKED_STDIN_FLAG"|"$BLOCKED_STDIN_FLAG"=*)
      echo "[leak-buy] ERROR: stdin key mode is blocked for this hardened skill."
      echo "[leak-buy] Use --buyer-private-key-file <path>."
      exit 1
      ;;
  esac
done

HAS_KEY_FILE=0
PREV=""
for ARG in "$@"; do
  if [ "$PREV" = "--buyer-private-key-file" ]; then
    HAS_KEY_FILE=1
    PREV=""
    continue
  fi
  case "$ARG" in
    --buyer-private-key-file)
      PREV="--buyer-private-key-file"
      ;;
    --buyer-private-key-file=*)
      HAS_KEY_FILE=1
      ;;
  esac
done

if [ "$HAS_KEY_FILE" -eq 0 ]; then
  echo "[leak-buy] ERROR: --buyer-private-key-file <path> is required."
  exit 1
fi

run_leak buy "$DOWNLOAD_URL" "$@"
