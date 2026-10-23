#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPSTREAM="${1:-$ROOT/upstream}"
if [ ! -d "$UPSTREAM/.git" ]; then
  git clone https://github.com/stoatchat/for-web "$UPSTREAM"
fi
cd "$UPSTREAM"
git checkout 70c0dd614f23e1007d6b4741baa771ea1fc086bc
git submodule update --init packages/stoat.js packages/solid-livekit-components
git apply "$ROOT/nullcord.patch" || true
npx --yes pnpm@11.3.0 install --frozen-lockfile
npx --yes pnpm@11.3.0 --filter stoat.js build
npx --yes pnpm@11.3.0 --filter solid-livekit-components build
cd packages/client
node scripts/copyAssets.mjs
npx --yes pnpm@11.3.0 exec lingui compile --typescript
BASE_PATH=/stoat/ PWA_SCOPE=/stoat/ \
  VITE_HOST="${VITE_HOST:?set your instance host}" \
  VITE_API_URL="${VITE_API_URL:?set your API URL}" \
  NODE_OPTIONS=--max-old-space-size=4096 \
  npx --yes pnpm@11.3.0 exec vite build
rsync -a --delete dist/ "$ROOT/dist/"
