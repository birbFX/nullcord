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

## Calls, video and screen sharing

Voice channels and DM/group calls are embedded through the Jitsi IFrame API
on the public `meet.element.io` relay. Jitsi provides the SFU/TURN path for
remote participants, microphone, camera and screen sharing. DM/group
recipients get an incoming-call card with a ringtone and Join/Decline actions;
the in-call bar shows participant count, call duration and quick
mute/camera/screen/leave controls, and syncs hang-up back to the call view.

This relay exists because the reference host is behind CGNAT and cannot accept
inbound WebRTC media. See [`VOICE.md`](./VOICE.md) for the architecture,
privacy notes, self-hosting instructions and troubleshooting. The backend
still contains the legacy LiveKit path for LAN/public-SFU deployments.

## Blocking

Users can block others from the context menu or their profile. Blocking
automatically removes the friendship and prevents direct messages in both
directions. The blocked account can still see the other user's username and
profile picture, but profile details and message delivery return
`403 Forbidden`.

When a blocked user tries to send a DM, their client shows a local, dismissible
Clyde-style notice. The notice is visible only to the sender and links to the
help centre at [`support.canyonlakelabs.com`](https://support.canyonlakelabs.com/).

## Orbs, Nitro and quests

Orbs, Nitro tiers and daily quest progress are server-authoritative. They are
stored in MongoDB through the API, never in browser storage, and the client
cannot set a balance or tier directly.

- `GET /users/@me/economy` — current balance, tier and daily quests
- `POST /users/@me/economy/quests/:id/claim` — server-verified quest claim
- `POST /users/@me/economy/nitro/redeem` — server-side Orb deduction
- `/sync/settings/set` rejects the protected `nullcord:economy` key

Server hooks validate messages, images, reactions, invites, invite joins,
voice presence, profile changes, themes, server creation and friend requests.
Unverifiable quests are excluded from the daily pool.

Theme, appearance, notifications, locale and ordering continue to use server
sync settings. Device-specific settings such as audio devices and drafts remain
local.

## Usernames

Usernames are 2–35 characters and may contain Unicode letters, numbers,
spaces, dots, dashes and underscores. Spaces must be single and cannot be at
the start or end. The API, onboarding form, username-change form and bot names
all enforce the same rule.

## Admin panel

The Next.js admin panel includes:

- user search by username, display name, email or ID
- server, channel and recent-message browsers
- raw object inspection for users, servers, channels, messages, reports and cases
- account enable/disable, email verification, MFA reset, recovery-code clearing
- username and display-name editing, admin grants and session revocation
- strikes, temporary suspensions, permanent/temporary bans and unsuspension
- IP bans and per-user session IP history
- bot verification
- platform announcements
- service logs, LiveKit/voice health and `/api/health`

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

## Hack Client

A local-only browser overlay lives at `/hack-client.js`. Inject it from the
console on either client:

```js
const s = document.createElement("script");
s.src = "/hack-client.js";
document.head.append(s);
```

It can inspect/edit the local session handoff, Orbs, Nitro tier, plugins,
quest claims, UI mode, and `nullcord:*` storage. It does not call admin APIs.

## NullCord Desktop

The Electron desktop source is bundled in `for-desktop/`, based on
`stoatchat/for-desktop` (AGPL-3.0), with NullCord RPC branding. Set
`NULLCORD_DISCORD_CLIENT_ID` and `NULLCORD_PUBLIC_URL` before starting it.
