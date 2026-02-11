#!/usr/bin/env bash
set -euo pipefail

REPO_SSH="git@github.com:eucalyptus-viminalis/leak.git"
INSTALL_DIR="$HOME/leak"

if command -v leak >/dev/null 2>&1; then
  echo "[leak-skill] leak already on PATH: $(command -v leak)"
  leak --help >/dev/null 2>&1 || true
  exit 0
fi

if [ ! -d "$INSTALL_DIR" ]; then
  echo "[leak-skill] cloning into $INSTALL_DIR"
  git clone "$REPO_SSH" "$INSTALL_DIR"
else
  echo "[leak-skill] found existing repo at $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Best-effort update (don’t fail the whole install if offline)
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git fetch --all --prune >/dev/null 2>&1 || true
  git pull --ff-only >/dev/null 2>&1 || true
fi

echo "[leak-skill] installing deps"
npm install

echo "[leak-skill] linking leak CLI globally (npm link)"
npm link

# Ensure this current shell can see the global npm bin too.
NPM_PREFIX_GLOBAL="$(npm prefix -g)"
NPM_BIN_GLOBAL="$NPM_PREFIX_GLOBAL/bin"
export PATH="$NPM_BIN_GLOBAL:$PATH"

echo "[leak-skill] done."
echo "[leak-skill] global npm bin: $NPM_BIN_GLOBAL"
echo "[leak-skill] If 'leak' is still not found in a new shell, add this to your shell config:"
echo "  export PATH=\"$NPM_BIN_GLOBAL:\$PATH\""

command -v leak || true
