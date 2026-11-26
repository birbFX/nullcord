# NullCord (working tree)

Source for https://github.com/birbFX/nullcord.

## Publishing

After any change, publish it:

```bash
./publish.sh "what changed"
```

`publish.sh` syncs `revite/`, `stoat-backend/`, `bot/` and `admin-panel/`
into `/mnt/cll-storage/nullcord-publish`, strips secrets/instance endpoints,
and pushes to GitHub. See `AGENTS.md` for details.

Never commit `.env`, `.env.local`, `bot/.token`, `Revolt.overrides.toml`,
`public-urls.env` or tunnel configs.

## Calls, video and screen sharing

Voice channels and DM/group calls use **WebRTC** with NullCord’s API/gateway
for signalling. Direct peer-to-peer paths are preferred; when both peers are
behind restrictive NAT, public TURN relays are used as a fallback. The first
participant is the host, and the host role moves to the next participant when
the host leaves. Multiple participants can share their screen and its audio at
once. Nitro accounts can publish up to 1440p60; basic/non-Nitro accounts are
capped at 720p30. Jitsi is not used. See [`VOICE.md`](./VOICE.md) for the
architecture, NAT requirements and privacy notes.

## Orbs, Nitro and quests

Orbs, Nitro tiers and daily quest progress are **server-authoritative**. They
are stored in MongoDB through the API, not in localStorage, and the client
cannot write balances or tiers directly.

- `GET /users/@me/economy` returns the current balance, tier and daily quests.
- `POST /users/@me/economy/quests/:id/claim` verifies server-recorded activity.
- `POST /users/@me/economy/nitro/redeem` deducts Orbs server-side.
- The legacy `nullcord:economy` sync key is rejected by `/sync/settings/set`.

Server hooks record eligible activity for messages, images, reactions,
invites, invitations accepted, voice presence, profile changes, themes, server
creation and friend requests. Quests that cannot be verified by the server are
not included in the daily pool.

Account preferences such as theme, appearance, notifications, locale and
ordering continue to use the existing server sync settings. Device-specific
settings such as audio devices and drafts stay local.

## Usernames

Usernames are 2–35 characters and may contain Unicode letters, numbers,
spaces, dots, dashes and underscores. Spaces must be single and cannot be at
the start or end. The API and client enforce the same rule.

## Blocking

Blocking is available from a user's context menu and profile. Blocking removes
the friendship automatically and stops both accounts from sending direct
messages to each other. The blocked account can still see the other user's
username and profile picture, but profile details and message sends return
`403 Forbidden`.

When a blocked user tries to send a DM, the client shows a local Clyde-style
notice. The notice is only visible to the sender and links to the help article at
[`support.canyonlakelabs.com/topics/nullcord`](https://support.canyonlakelabs.com/topics/nullcord).

## Admin panel

The Next.js admin panel includes user search, server and message browsers,
raw object inspection, account/MFA/email management, username/display-name
editing, admin grants, session revocation, strikes/suspensions/bans with
temporary expiry, IP bans, bot verification, announcements, service logs and
LiveKit/voice health checks. `/api/health` is an unauthenticated JSON probe.

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

It can inspect the local session and storage, and change local-only plugins
and UI mode. Orbs, Nitro tiers and quest claims are server-authoritative and
cannot be changed by this overlay. It does not call admin APIs.

## Demo account seeding

`seed-accounts.mjs` populates a fresh instance with accounts that join the
configured invite. It uses a local Ollama model (default `qwen2.5:3b`) plus a
local fallback, and stores learned style patterns in `seed/username-memory.json`.

```bash
node seed-accounts.mjs 100 --dry-run       # preview only
node seed-accounts.mjs 100 --confirm       # create + join CLL
node seed-accounts.mjs 500 --confirm       # larger run
```

Credentials are written to `seed/accounts.jsonl` with mode `0600`; the whole
`seed/` directory is gitignored. Use `--api` to point at another API and
`--invite` to change the destination server.

## NullCord Desktop

The Electron desktop source is bundled in `for-desktop/`, based on
`stoatchat/for-desktop` (AGPL-3.0). Discord RPC has been removed, so NullCord
does not require Discord. Set `NULLCORD_PUBLIC_URL` before starting it.

## Python bot client

`nullcord.py` is a single-file, discord.py-shaped bot client for the NullCord
REST API and gateway. It includes `Client`, `Bot`, `Embed`, uploads, messages,
servers, roles, members, invites, emoji, and the bot-safe endpoint helpers.

```bash
NULLCORD_API=https://your-nullcord-api.example \
NULLCORD_BOT_TOKEN=... \
python3 your_bot.py
```

See `NULLCORD_BOT_API.md` for every bot-capable call, the bot-blocked routes,
embeds, uploads, gateway packets, and examples.
