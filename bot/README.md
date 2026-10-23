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

## Data

```
data/config.json      prefix + per-server settings
data/warns.json       warnings
data/tickets.json     open tickets
data/transcripts/     closed ticket transcripts
data/bot.log          runtime log
```
