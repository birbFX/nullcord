# Canyon Lake Labs bot

NullCord/Stoat port of the Axiom core: moderation, logging, prefix commands,
tickets and a music queue. Runs on the local `revolt.js` and talks to the
local NullCord API.

## Run

```bash
./run.sh start      # background (setsid)
./run.sh status
./run.sh logs 100   # follow
./run.sh restart
./run.sh stop
```

Token: `.token` (mode 600). Override with `NULLCORD_BOT_TOKEN`.
API: `http://127.0.0.1:14702` (override with `NULLCORD_API`).

## Commands

Prefix defaults to `!` per server (`/setprefix <p>`). Current CLL prefix is
whatever is stored in `data/config.json`.

| Group | Commands |
|---|---|
| General | `help`, `ping`, `uptime`, `botinfo`, `userinfo`, `avatar`, `serverinfo` |
| Moderation | `kick`, `ban`, `unban`, `warn`, `warnings`, `clearwarns`, `purge`, `say` |
| Tickets | `ticket`, `close`, `add`, `remove`, `tickets` |
| Music | `play`, `queue`, `nowplaying`, `skip`, `stop` |
| Config | `setprefix`, `setlogs`, `setticketrole` |

## Tickets

`/ticket <reason>` creates a private channel:

1. Creates `#ticket-<username>`.
2. Creates a temporary role with view/send/history/upload/react.
3. Assigns it to the opener and sets `@default` to deny View Channel.
4. `/close [reason]` writes a transcript to `data/transcripts/<channel>.json`,
   deletes the role and the channel.
5. `/add @user` / `/remove @user` assign or remove that ticket role.

Revolt channel overwrites are role-based, hence the per-ticket role.

## Logging

`/setlogs #channel` enables logs for: message delete/edit, member join/leave,
channel create/delete, and every moderation/ticket action.

## Music

`/play <query>` queues a YouTube result via `yt-dlp` (bundled in `bin/`).
**Bots cannot stream audio into Stoat voice channels yet**, so the queue posts
links instead of playing audio. `queue`, `nowplaying`, `skip`, `stop` manage it.

## AI conversation engine

The optional AI engine lives in `ai/`. It is **disabled by default** and only
responds inside explicitly allowlisted servers/channels. It never replies in
DMs or General unless those IDs are deliberately added to the allowlist.

```bash
cp ai-config.example.json data/ai.json
chmod 600 data/ai.json
# fill in channelAllowlist and review characters
```

Runtime configuration: `data/ai.json` (ignored by publishing).
Example configuration: `ai-config.example.json`.
Structured logs: `data/ai.log` (message content is omitted by default).

Environment overrides:

```bash
NULLCORD_AI_ENABLED=0          # global enable/disable
NULLCORD_AI_DISABLED=1         # immediate kill switch
NULLCORD_AI_SERVERS=...        # comma-separated server IDs
NULLCORD_AI_CHANNELS=...       # comma-separated channel IDs
NULLCORD_AI_MODEL=qwen2.5:3b
NULLCORD_OLLAMA_URL=http://127.0.0.1:11434
NULLCORD_AI_MODE=mention       # mention | ambient
```

The kill switch is also `data/ai.disabled`; it is checked before generation and
again before sending. Delete the file to re-enable.

Tests use Node's built-in runner and mocks:

```bash
node --test ai/engine.test.js
```

`mention` mode replies only when the bot is mentioned or someone replies to one
of its messages. `ambient` mode is opt-in and still subject to the channel
allowlist, probability, cooldowns and consecutive-reply limit.

Presence uses Stoat's supported `status.presence` values (`Online`, `Idle`,
`Focus`, `Busy`, `Invisible`) and custom status text. Discord-style activity
objects are not supported by the Stoat model and are ignored with a log entry.
One bot process has one Stoat identity: per-character presence is configurable,
but only one character's status can be active at a time. Run separate bot
processes with separate tokens if simultaneous identities are required.

## Multi-agent manager

The single-bot engine is separate from the multi-agent manager. Each managed
agent is a separate Node process with its own Stoat bot token, client session,
character, presence, memory and log file. The manager does not use Axiom.

```bash
cp ai/agents.example.json data/agents.json
chmod 600 data/agents.json
node ai/agents.js status
node ai/agents.js check
node ai/agents.js start pixel-agent
node ai/agents.js stop pixel-agent
node ai/agents.js restart pixel-agent
node ai/agents.js logs pixel-agent 100
```

`data/agents.json` is persistent runtime configuration and is not published.

Important account rule: the manager verifies every token with
`GET /users/@me` using `x-bot-token`. The response must contain a `bot` object.
Regular user credentials are rejected with
`regular_user_account_not_supported`. Do not put user passwords in this file.

Each agent must have explicit `serverAllowlist` and `channelAllowlist` entries.
Agents do not create channels or servers. Separate agents can use different
characters, statuses, channels, rate limits, memory files and logs.

The server has **one** existing bot account (Axiom), but the multi-agent manager
does not start or use it. The 103 seeded records are regular user accounts, not
bot accounts. New real bot accounts and tokens are required for additional
autonomous identities.

## Data

```
data/config.json      prefix + per-server settings
data/warns.json       warnings
data/tickets.json     open tickets
data/transcripts/     closed ticket transcripts
data/bot.log          runtime log
data/ai.json          optional single-bot AI config (not published)
data/ai.log           structured AI event log
data/ai.disabled      optional single-bot AI kill switch
data/ai-memory.json   optional persisted AI memory (only when enabled)
data/agents.json      persistent multi-agent config (not published)
data/agents/          per-agent pid, log and memory files (not published)
```
