# Stoat for Web UI integration

NullCord serves the full Stoat for Web client at **`/stoat/`** as the
"Stoat for Web" UI option. The root NullCord app remains available at `/`.

- Upstream: https://github.com/stoatchat/for-web
- Upstream commit: `70c0dd614f23e1007d6b4741baa771ea1fc086bc`
- Upstream licence: AGPL-3.0
- Local modifications: `nullcord.patch` (NullCord branding, base-aware
  SPA navigation, short-lived client handoff, UI switch and speed fixes).
  Apply it to a clean upstream checkout.

## Build

```bash
git clone https://github.com/stoatchat/for-web
cd for-web
git checkout 70c0dd614f23e1007d6b4741baa771ea1fc086bc
git submodule update --init packages/stoat.js packages/solid-livekit-components
git apply /path/to/nullcord.patch

npx pnpm@11.3.0 install --frozen-lockfile
npx pnpm@11.3.0 --filter stoat.js build
npx pnpm@11.3.0 --filter solid-livekit-components build

cd packages/client
node scripts/copyAssets.mjs
npx pnpm@11.3.0 exec lingui compile --typescript
BASE_PATH=/stoat/ PWA_SCOPE=/stoat/ \
  VITE_HOST="${VITE_HOST:?set your instance host}" \
  VITE_API_URL="${VITE_API_URL:?set your API URL}" \
  NODE_OPTIONS=--max-old-space-size=4096 \
  npx pnpm@11.3.0 exec vite build

# deploy the built client
rsync -a --delete dist/ /path/to/NullCord-legacy/for-web/dist/
```

The upstream source plus this patch is the corresponding source for the
Stoat for Web build served by NullCord.
