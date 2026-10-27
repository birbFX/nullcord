# NullCord bot surface

`nullcord.py` is a bot-token client for NullCord/Stoat. This file lists the
calls a bot can actually make, the calls NullCord explicitly rejects for bot
accounts, and the gateway/embed shapes behind the Python API.

Authentication for every REST call:

```http
x-bot-token: <bot token>
```

The bot must be a real bot account (`user.bot` present). A seeded normal user
session is not a bot credential.

## What a bot can call

Permissions shown are the relevant NullCord permission names. The server owner
and privileged accounts bypass permission checks.

### Core and users

| Method | Path | Python | Notes |
|---|---|---|---|
| GET | `/` | `http.fetch_node()` | API version, gateway URL, Autumn URL, limits. |
| GET | `/users/@me` | `http.fetch_self()` | Bot identity. |
| GET | `/users/{id}` | `http.fetch_user(id)` | Requires shared server/DM context. |
| GET | `/users/{id}/profile` | `http.fetch_profile(id)` | Profile/banner/bio. |
| GET | `/users/{id}/default_avatar` | `http.fetch_default_avatar(id)` | Usually binary/redirect. |
| GET | `/users/{id}/mutual` | `http.fetch_mutual(id)` | Mutual friends/servers/groups/DMs. |
| GET | `/users/{id}/flags` | `http.fetch_user_flags(id)` | Public flags response. |
| GET | `/users/{id}/dm` | `http.open_dm(id)` | Opens/reuses a DM channel. |
| GET | `/users/dms` | `http.fetch_dms()` | DM channels for the bot. |
| PATCH | `/users/@me` | `http.edit_self(...)` | Display name, pronouns, status, avatar, profile, remove fields. |
| GET | `/bots/@me` | `http.fetch_owned_bots()` | Bots owned by the authenticated account. |

`PATCH /users/@me/username` requires an account password, so it is not usable
with a bot token. Friend requests, blocking, accepting/removing friends, and
reporting content are rejected with `IsBot`.

### Messages

| Method | Path | Python | Permission / notes |
|---|---|---|---|
| GET | `/channels/{c}/messages` | `http.fetch_messages(c, ...)` | ViewChannel + ReadMessageHistory. |
| POST | `/channels/{c}/messages` | `http.send_message(c, ...)` | SendMessage; SendEmbeds for embeds; UploadFiles for attachments. |
| GET | `/channels/{c}/messages/{m}` | `http.fetch_message(c, m)` | ReadMessageHistory. |
| PATCH | `/channels/{c}/messages/{m}` | `http.edit_message(c, m, ...)` | ManageMessages or own message; content/embeds. |
| DELETE | `/channels/{c}/messages/{m}` | `http.delete_message(c, m)` | ManageMessages or own message. |
| DELETE | `/channels/{c}/messages/bulk` | `http.bulk_delete_messages(c, ids)` | ManageMessages. |
| POST | `/channels/{c}/messages/{m}/pin` | `http.pin_message(c, m)` | ManageMessages. |
| DELETE | `/channels/{c}/messages/{m}/pin` | `http.unpin_message(c, m)` | ManageMessages. |
| PUT | `/channels/{c}/messages/{m}/reactions/{emoji}` | `http.react(c, m, emoji)` | React. |
| DELETE | `/channels/{c}/messages/{m}/reactions/{emoji}` | `http.unreact(c, m, emoji, user_id=..., remove_all=...)` | React; ManageMessages for others/all. |
| DELETE | `/channels/{c}/messages/{m}/reactions` | `http.clear_reactions(c, m)` | ManageMessages. |
| POST | `/channels/{c}/search` | — | **Rejected for bots** (`IsBot`). |
| PUT | `/channels/{c}/ack/{m}` | — | **Rejected for bots** (`IsBot`). |

Send-body fields:

```json
{
  "content": "text",
  "attachments": ["autumn-file-id"],
  "replies": [{"id": "message-id", "mention": false}],
  "embeds": [{"title": "Title", "description": "Body", "colour": "#3ba55c"}],
  "masquerade": {"name": "name", "avatar": "autumn-file-id", "colour": "#fff"},
  "interactions": {"reactions": ["✅"], "restrict_reactions": true},
  "flags": 1,
  "nonce": "dedupe-token"
}
```

`flags`: `1` suppress notifications, `2` mentions everyone, `4` mentions
online members.

### Channels, permissions, voice

| Method | Path | Python | Permission |
|---|---|---|---|
| GET | `/channels/{c}` | `http.fetch_channel(c)` | ViewChannel. |
| PATCH | `/channels/{c}` | `http.edit_channel(c, ...)` | ManageChannel. |
| DELETE | `/channels/{c}` | `http.delete_channel(c)` | ManageChannel for server channels; leaving groups/DMs. |
| GET | `/channels/{c}/members` | `http.fetch_channel_members(c)` | Group channels only. |
| PUT | `/channels/{c}/permissions/default` | `http.set_channel_default_permissions(c, perms)` | ManageChannel. |
| PUT | `/channels/{c}/permissions/{role}` | `http.set_channel_permissions(c, role, allow, deny)` | ManageChannel. |
| POST | `/channels/{c}/join_call` | `http.join_call(c, node=...)` | Connect. Bots may join; `force_disconnect` is rejected for bots. |
| PUT | `/channels/{c}/end_ring/{user}` | `http.end_ring(c, user)` | Voice call participant. |
| GET/POST | `/channels/{c}/webhooks` | `http.fetch_webhooks` / `http.create_webhook` | ManageWebhooks; only if webhooks feature is enabled. |

Group creation, group add/remove member, channel invite creation, invite join,
and invite creation are rejected for bots with `IsBot`.

### Servers

| Method | Path | Python | Permission |
|---|---|---|---|
| GET | `/servers/{s}` | `http.fetch_server(s)` | ViewChannel/member. |
| PATCH | `/servers/{s}` | `http.edit_server(s, ...)` | ManageServer. |
| DELETE | `/servers/{s}` | `http.delete_server(s)` | Leave; owner deletion rules apply. |
| POST | `/servers/{s}/channels` | `http.create_channel(s, name, ...)` | ManageChannel. |
| GET | `/servers/{s}/members` | `http.fetch_members(s)` | Member list. |
| GET | `/servers/{s}/members/{u}` | `http.fetch_member(s, u)` | Member. |
| PATCH | `/servers/{s}/members/{u}` | `http.edit_member(s, u, ...)` | ManageNicknames/roles/timeout. |
| DELETE | `/servers/{s}/members/{u}` | `http.kick_member(s, u)` | KickMembers. |
| PUT | `/servers/{s}/bans/{u}` | `http.ban_member(s, u, ...)` | BanMembers. |
| DELETE | `/servers/{s}/bans/{u}` | `http.unban_member(s, u)` | BanMembers. |
| GET | `/servers/{s}/bans` | `http.fetch_bans(s)` | BanMembers. |
| POST | `/servers/{s}/roles` | `http.create_role(s, name, ...)` | ManageRoles. |
| GET | `/servers/{s}/roles/{r}` | `http.fetch_role(s, r)` | Role read. |
| PATCH | `/servers/{s}/roles/{r}` | `http.edit_role(s, r, ...)` | ManageRoles. |
| DELETE | `/servers/{s}/roles/{r}` | `http.delete_role(s, r)` | ManageRoles. |
| PATCH | `/servers/{s}/roles/ranks` | `http.edit_role_ranks(s, ranks)` | ManageRoles. |
| PUT | `/servers/{s}/permissions/default` | `http.set_server_default_permissions(s, perms)` | ManageServer. |
| PUT | `/servers/{s}/permissions/{r}` | `http.set_server_permissions(s, r, allow, deny)` | ManageServer. |
| GET | `/servers/{s}/invites` | `http.fetch_server_invites(s)` | ManageServer / invite view. |
| GET | `/servers/{s}/emojis` | `http.fetch_server_emojis(s)` | Emoji list. |
| GET | `/servers/{s}/audit_logs` | `http.fetch_audit_logs(s, ...)` | ManageServer/audit permission. |
| GET | `/servers/{s}/members_experimental_query` | direct `http.request` | Name search. |

Server creation and marking a server as read are rejected for bots. Server
ownership transfer to a bot is rejected.

### Custom emoji, invites, webhooks

| Method | Path | Python | Permission |
|---|---|---|---|
| GET | `/custom/emoji/{id}` | `http.fetch_emoji(id)` | Emoji visible. |
| PUT | `/custom/emoji/{id}` | `http.create_emoji(id, name, parent)` | ManageCustomisation. |
| PATCH | `/custom/emoji/{id}` | `http.edit_emoji(id, name)` | ManageCustomisation. |
| DELETE | `/custom/emoji/{id}` | `http.delete_emoji(id)` | ManageCustomisation. |
| GET | `/invites/{code}` | `http.fetch_invite(code)` | Invite visible/public. |
| DELETE | `/invites/{code}` | `http.delete_invite(code)` | Creator or ManageServer. |
| POST | `/webhooks/{id}/{token}` | `http.execute_webhook(...)` | Webhook token. |

Creating/joining invites is not a bot capability. Webhooks are available only
when the instance enables the webhooks feature.

## Embeds

NullCord's `SendableEmbed` is smaller than Discord's:

| Field | Max | Notes |
|---|---:|---|
| `title` | 100 | Optional. |
| `description` | 2000 | Optional; supports Markdown. |
| `url` | 256 | Optional link. |
| `icon_url` | 256 | Optional icon. |
| `media` | — | Autumn file ID to attach an image. |
| `colour` | 128 | CSS colour, gradient, or `var(--...)`. |

A message can contain up to the instance limit (currently 5 on CLL); edits
accept up to 10. There are **no native fields, footer, author block, or
timestamp** on NullCord text embeds. `nullcord.py`'s `Embed.add_field()` and
`set_footer()` fold that text into `description` so discord.py-shaped code
still works without pretending unsupported fields exist.

```python
from nullcord import Embed, Colour

embed = Embed(
    title="Canyon Lake Labs",
    description="**Status:** online",
    colour=Colour.green,
    url="https://canyonlakelabs.com",
)
await channel.send(embed=embed)
```

## File uploads / attachments

Upload first to the Autumn service advertised by `GET /`:

```http
POST {features.autumn.url}/attachments
x-bot-token: <token>
Content-Type: multipart/form-data

file=@image.png
```

Response:

```json
{"id": "autumn-file-id"}
```

Then pass that ID in `attachments` on `POST /channels/{c}/messages`. Tags and
limits: `attachments` 20 MB, `avatars` 4 MB, `backgrounds` 6 MB, `icons`
2.5 MB, `banners` 6 MB, `emojis` 500 KB. Non-attachment tags are images only.

`nullcord.py`:

```python
await channel.send("look", file="image.png")
# uploads, then sends attachments automatically
```

## Gateway

The gateway URL is `GET /` → `ws`. Connect with:

```text
wss://...?version=1&format=json&token=<bot-token>
```

Client → server packets:

```json
{"type": "Authenticate", "token": "..."}
{"type": "BeginTyping", "channel": "channel-id"}
{"type": "EndTyping", "channel": "channel-id"}
{"type": "Subscribe", "server_id": "server-id"}
{"type": "Ping", "data": 1700000000}
```

Server → client packets use the same `type` tag. Important events:

`Authenticated`, `Ready`, `Error`, `Logout`, `Pong`, `Bees`, `Bulk`,
`Message`, `MessageUpdate`, `MessageAppend`, `MessageDelete`, `MessageReact`,
`InteractionCreate`,
`MessageUnreact`, `MessageRemoveReaction`, `BulkMessageDelete`,
`ServerCreate`, `ServerUpdate`, `ServerDelete`, `ServerMemberUpdate`,
`ServerMemberJoin`, `ServerMemberLeave`, `ServerRoleUpdate`,
`ServerRoleDelete`, `ServerRoleRanksUpdate`, `UserUpdate`,
`UserRelationship`, `UserSettingsUpdate`, `UserPlatformWipe`, `EmojiCreate`,
`EmojiUpdate`, `EmojiDelete`, `ChannelCreate`, `ChannelUpdate`,
`ChannelDelete`, `ChannelGroupJoin`, `ChannelGroupLeave`,
`ChannelStartTyping`, `ChannelStopTyping`, `ChannelAck`, `WebhookCreate`,
`WebhookUpdate`, `WebhookDelete`, `VoiceChannelJoin`, `VoiceChannelLeave`,
`VoiceChannelMove`, `UserVoiceStateUpdate`, `UserSlowmodes`,
`VoiceCallUpdate`.

`nullcord.py` maps these to `on_message`, `on_message_update`,
`on_message_delete`, `on_reaction_add`, `on_member_join`, `on_member_leave`,
`on_channel_create`, `on_server_create`, etc. Unmapped events still arrive
through `on_event(event_type, payload)`.

## Components

NullCord now has native message components and an `InteractionCreate` gateway
event. See **Native message components** at the end of this document for the
current schema and route. The old reaction renderer is retained only as an
explicit fallback (`NULLCORD_COMPONENT_MODE=reactions`).

## `nullcord.py` quick start

```python
from nullcord import Client, Embed, Colour

client = Client("BOT_TOKEN")

@client.event
async def on_ready():
    print("ready", client.user.tag)

@client.event
async def on_message(message):
    if message.content == "!ping":
        await message.reply("pong")
    elif message.content == "!embed":
        await message.channel.send(
            embed=Embed(title="Hello", description="From NullCord", colour=Colour.green)
        )

client.run()
```

`Client` uses `aiohttp` for REST and WebSocket. `Embed`, model classes, and
exceptions import without it; network/gateway calls raise a clear
`RuntimeError` if `aiohttp` is missing.

## Discord.py-compatible SDK

`nullcord.py` now includes the Discord-shaped surface directly, and the
repository also ships a `discord/` compatibility package:

```python
import discord
from discord.ext import commands
from discord import app_commands
```

`discord` re-exports the NullCord SDK so existing bot modules can keep
`discord.Embed`, `discord.ui.View`, `discord.ui.Button`,
`discord.ui.Select`, `discord.Interaction`, and
`discord.ext.commands.Bot` imports.

### Native embeds

`discord.Embed` keeps the Discord API, but emits a **flat** NullCord
`SendableEmbed`:

```python
embed = discord.Embed(title="Title", description="Body", colour=discord.Color.dark_teal())
embed.add_field(name="Field", value="Value", inline=False)
embed.set_footer(text="footer")
await channel.send(embed=embed)
```

The wire payload never contains `"type": "Text"`. Fields, footer, author,
timestamp, image URL, and thumbnail URL are folded into the native embed
description as Markdown; a file ID set through `media` becomes the native
`media` card. Descriptions longer than 2,000 characters are split into
additional native embeds (up to 10), not flattened into raw message text.

### Views, buttons, selects, interactions

NullCord now stores and renders native `components` on messages. The SDK
serializes `discord.ui.View` children directly:

- `Button` becomes a native button with label, emoji, style, disabled, URL,
  and row.
- `Select` becomes a native dropdown with placeholder, options (label, value,
  description, emoji, default), min/max, disabled, and row.
- Selecting an option or pressing a button POSTs to the message interaction
  route; the server emits `InteractionCreate` to the bot gateway.
- The SDK constructs `discord.Interaction` with
  `type == InteractionType.component`.
- `interaction.response.edit_message(embed=..., view=self)`,
  `interaction.edit_original_response(...)`, `.message`, `.user`, `.data`,
  `.channel`, and `.guild` work.
- `timeout=None` views remain registered for the life of the process;
  timed views expire and unregister.
- `on_interaction` receives every component interaction.

The old reaction transport remains available only with
`NULLCORD_COMPONENT_MODE=reactions`. The 25-option AxHelpView uses native
components; it no longer needs reaction pagination.

Modal classes are present, but `InteractionResponse.send_modal` raises
`NotImplementedError` because NullCord has no native modal transport.

### Commands

`discord.ext.commands` implements prefix commands, groups, subcommands,
aliases, checks, cooldowns, `Greedy`, `Optional`, converters, and
keyword-only `reason`/`args` consumption. `Bot` verifies the token is a real
bot before starting and uses `x-bot-token` only.

## Bot verification badge (admin panel)

The admin user page has a **Bots** section. Platform admins can press
**Verify app** to set bot flag `1`; **Remove verification** clears it.
Verification is written to both:

- `revolt.bots.flags`
- `revolt.users.bot.flags`

The NullCord client renders a green checkmark next to verified bot usernames.
The route is protected by the admin-panel session and
`RBAC_PERMISSION_MODERATION_AGENT`.

## Compatibility test command

```bash
cd /mnt/cll-storage/NullCord-legacy
PYTHONPATH=/mnt/cll-storage/oracleturret/venv/lib/python3.14/site-packages \
  python3 -m unittest test_nullcord -v
```

The suite covers token verification, Ready caching, gateway dispatch,
duplicate/self-message suppression, status mapping, idempotency, 429 retry,
blocked APIs, native embed folding/splitting, AxHelpView select/Home/Prev/Next,
commands/groups/Greedy/Optional/keyword-only args, and mocked Autumn upload.

## Native message components (dropdowns and buttons)

NullCord now stores real components on messages. This is the preferred path
for views; reactions remain only as an explicit fallback
(`NULLCORD_COMPONENT_MODE=reactions`).

Message send/edit accepts:

```json
{
  "content": "Choose a category",
  "embeds": [{"title": "Help", "description": "..."}],
  "components": [
    {
      "type": "select",
      "custom_id": "help:category",
      "placeholder": "Browse a category...",
      "min_values": 1,
      "max_values": 1,
      "row": 0,
      "options": [
        {
          "label": "Core",
          "value": "core",
          "description": "Runtime, ping, prefix",
          "emoji": "⚙️"
        }
      ]
    },
    {
      "type": "button",
      "custom_id": "help:home",
      "label": "Home",
      "emoji": "🏠",
      "style": "primary",
      "disabled": false,
      "row": 1
    }
  ]
}
```

Message responses include the same `components` array. The NullCord client
renders selects as a real dropdown and buttons as styled controls. Button
styles are `primary`, `secondary`, `success`, `danger`, and `link`; buttons
support label, emoji, disabled, URL, and row. Selects support placeholder,
options with label/value/description/emoji/default, min/max, disabled, and
row.

### Interaction route

```http
POST /channels/{channel_id}/messages/{message_id}/interactions
x-bot-token: ...        # or user session token
Content-Type: application/json

{"custom_id":"help:category","component_type":"select","values":["core"]}
```

The server validates the component and select values, then emits
`InteractionCreate` to the message author's bot gateway. The SDK constructs
`discord.Interaction`, invokes the live view callback, and a callback can
call `interaction.response.edit_message(embed=..., view=self)`.

SDK usage:

```python
view = discord.ui.View(timeout=None)
view.add_item(discord.ui.Select(
    placeholder="Browse a category...",
    options=[discord.SelectOption(label="Core", value="core", emoji="⚙️")],
))
view.add_item(discord.ui.Button(
    label="Home", emoji="🏠", style=discord.ButtonStyle.primary,
))

await channel.send(embed=embed, view=view)
```

`Message.interact(custom_id, values=[...])` is also available for manual
interaction calls. Components are sent directly; bots do not need to add
reactions by default.
