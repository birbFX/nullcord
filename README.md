# NullCord

Self-hostable Discord-style chat for Canyon Lake Labs, built on the
Stoat (formerly Revolt) stack.

> [!IMPORTANT]
> **This is AI vibe coding.**
> NullCord is a **passion project by Canyon Lake Labs**, built for fun and made
> almost entirely with AI assistance. It is a hobby project, not a polished
> commercial product. **If you don't like AI made software then don't use it.**

This repository contains the source for everything we run:

| Path | What it is |
|---|---|
| `revite/` | NullCord web client (Preact + Vite), including our UI changes |
| `revite/external/` | Our forks of `revolt.js`, `@revoltchat/components` and locales |
| `stoat-backend/` | Stoat API / events / file services (Rust) |
| `bot/` | NullCord bot: moderation, logging, prefix commands, tickets/appeals, music queue |
| `admin-panel/` | Stoat admin panel (Next.js), modified to run against this stack |

No credentials, private endpoints, tunnel configs or deployment secrets are
included. All instance-specific values are supplied through environment
variables.

## Self-hosting (outline)

1. **Backend** (`stoat-backend/`)
   - MongoDB (replica set), Redis/KeyDB, RabbitMQ, S3-compatible storage, LiveKit.
   - Copy `Revolt.overrides.example.toml` to `Revolt.overrides.toml` and set
     your public hosts.
   - Build the Rust services (`cargo build`) or use the included Dockerfiles.
2. **Client** (`revite/`)
   ```bash
   cd revite
   cp .env.example .env      # set VITE_API_URL (and VITE_ADMIN_URL if used)
   yarn install
   yarn dev
   ```
   Production: `yarn build`, then serve `dist/`.
3. **Bot** (`bot/`)
   ```bash
   cd bot
   printf '%s' 'YOUR_BOT_TOKEN' > .token && chmod 600 .token
   ./run.sh start
   ```
4. **Admin panel** (`admin-panel/`)
   ```bash
   cd admin-panel
   cp .env.local.example .env.local   # set MONGODB, REDIS, auth, PLATFORM_ACCOUNT_ID
   bun install && bun run build && node server/.build/server/index.js
   ```

## Licence

NullCord is distributed under the **GNU Affero General Public License v3.0**
(see `LICENSE`). The client, backend and admin panel are derivative works of
the Stoat/Revolt projects; their notices and licences are kept in place.
If you run a modified version as a network service, you must offer its
corresponding source — that is exactly what this repository is for.

Source: <https://github.com/birbFX/nullcord>

## UI attribution

The Material 3 surface palette and visual tokens in
`revite/src/styles/_for-web.scss` / `UiModePicker.tsx` are adapted from
[Stoat for Web](https://github.com/stoatchat/for-web), licensed AGPL-3.0.
The upstream client is Solid.js; only the portable visual token layer was
adapted, not its component tree. See `NOTICE`.

## Stoat for Web UI

The full Stoat for Web client is built from upstream commit
`70c0dd614f23e1007d6b4741baa771ea1fc086bc` and served at `/stoat/`.
Local modifications, build steps and the AGPL-3.0 notice are in `for-web/`.
