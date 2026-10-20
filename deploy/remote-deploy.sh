#!/usr/bin/env bash
# Runs ON the asterisk server, over SSH from .github/workflows/deploy.yml, as the
# user that owns the clone (`asterisk-server`). The workflow already did the
# git fetch / reset --hard / clean in $REPO_DIR, so the checkout is pristine here.
#
# `git clean -fd` (no -x) on purpose: the box's .env and dist/ are gitignored, so
# they survive the reset. Never use -x here -- it would delete the server's .env.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/asterisk-server/www/leen-iptv}"
cd "$REPO_DIR"

# nvm is initialised from .bashrc, which non-interactive SSH never loads. Source it.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

command -v node >/dev/null || { echo "node not found (is nvm installed?)" >&2; exit 1; }
if ! command -v pnpm >/dev/null; then
  echo ">> pnpm missing, installing"
  npm i -g pnpm
fi

echo ">> node $(node -v), pnpm $(pnpm -v)"

pnpm install --frozen-lockfile
pnpm build

# leen-tv is `bash -c "pnpm preview --host --port 5100"` with cwd = this repo,
# so a restart republishes the fresh dist/.
pm2 restart leen-tv --update-env

echo ">> deploy done"
