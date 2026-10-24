"""nullcord.py — a small discord.py-shaped client for NullCord / Stoat.

This is a single-file client for the NullCord REST API and gateway. It uses
bot authentication (``x-bot-token``) and works with the bot account created in
NullCord. It intentionally mirrors the familiar discord.py shapes:

    client = Client(token)
    @client.event
    async def on_ready(): ...
    @client.event
    async def on_message(message):
        await message.reply("hello")
    client.run()

Only the bot-safe surface is wrapped. Endpoints that NullCord explicitly
rejects for bot accounts (friend requests, server creation, invites, search,
ack, reports, group management, etc.) are documented in
``NULLCORD_BOT_API.md`` and are not exposed here.

Requirements: Python 3.10+ and aiohttp for gateway/async HTTP. If aiohttp is
not installed, the model classes and ``Embed`` still import; network calls
raise a clear RuntimeError.
"""

from __future__ import annotations

import asyncio
import json as _json
import logging
import mimetypes
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable, Optional, Sequence, Union

try:
    import aiohttp
except ImportError:  # pragma: no cover
    aiohttp = None

__version__ = "0.1.0"
__all__ = [
    "Client",
    "Bot",
    "HTTPClient",
    "Embed",
    "Colour",
    "Color",
    "File",
    "Message",
    "Channel",
    "Server",
    "User",
    "Member",
    "Role",
    "Invite",
    "Emoji",
    "Ban",
    "Webhook",
    "Context",
    "HTTPException",
    "Forbidden",
    "NotFound",
    "Unauthorized",
    "RateLimited",
    "BotBlocked",
    "MessageFlags",
]

log = logging.getLogger("nullcord")

DEFAULT_API_URL = os.environ.get("NULLCORD_API", "http://127.0.0.1:14702")
DEFAULT_WS_URL = os.environ.get("NULLCORD_WS", "")

# Message flags from NullCord/Stoat.
class MessageFlags:
    SuppressNotifications = 1
    MentionsEveryone = 2
    MentionsOnline = 4


class Colour:
    """Simple colour constants; NullCord accepts CSS colour strings."""

    default = "#3ba55c"
    blue = "#5865f2"
    green = "#57f287"
    yellow = "#fee75c"
    red = "#ed4245"
    purple = "#9b59b6"
    dark_teal = "#1f8b8b"
    white = "#ffffff"
    black = "#000000"


Color = Colour


# ----------------------------------------------------------------- exceptions
class HTTPException(Exception):
    def __init__(self, status: int, code: str = "", message: str = "", response: Any = None):
        self.status = status
        self.code = code
        self.message = message or code or f"HTTP {status}"
        self.response = response
        super().__init__(f"{status} {self.code}: {self.message}".strip())


class Unauthorized(HTTPException):
    pass


class Forbidden(HTTPException):
    pass


class NotFound(HTTPException):
    pass


class RateLimited(HTTPException):
    def __init__(self, status: int = 429, retry_after: float = 0, **kwargs: Any):
        self.retry_after = retry_after
        super().__init__(status, **kwargs)


class BotBlocked(Forbidden):
    """Raised when a bot calls an endpoint marked IsBot by NullCord."""


def _raise_http(status: int, body: Any, response: Any = None) -> None:
    if isinstance(body, dict):
        code = str(body.get("type") or body.get("code") or "")
        message = str(body.get("message") or body.get("error") or "")
        retry_after = body.get("retry_after") or body.get("retryAfter") or 0
    else:
        code = ""
        message = str(body or "")
        retry_after = 0

    exc_type: type[HTTPException] = HTTPException
    if status == 401:
        exc_type = Unauthorized
    elif status == 403:
        exc_type = BotBlocked if code == "IsBot" else Forbidden
    elif status == 404:
        exc_type = NotFound
    elif status == 429:
        exc_type = RateLimited
        raise RateLimited(
            status=status,
            retry_after=float(retry_after or 0),
            code=code,
            message=message,
            response=response,
        )
    raise exc_type(status, code=code, message=message, response=response)


# ----------------------------------------------------------------- helpers
def _ulid_time(value: str | None) -> datetime | None:
    if not value:
        return None
    alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    try:
        millis = 0
        for char in value[:10].upper():
            millis = millis * 32 + alphabet.index(char)
        return datetime.fromtimestamp(millis / 1000, tz=timezone.utc)
    except (ValueError, IndexError):
        return None


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return list(value)
    return [value]


def _clean(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}


def _embed_payload(embed: Any) -> dict[str, Any]:
    if embed is None:
        return {}
    if isinstance(embed, Embed):
        return embed.to_dict()
    if hasattr(embed, "to_dict"):
        return embed.to_dict()
    return dict(embed)


def _file_id(value: Any) -> str:
    if isinstance(value, File):
        return value.id
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return str(value.get("_id") or value.get("id") or "")
    return str(value)


def _id_of(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("_id") or value.get("id") or "")
    return str(getattr(value, "id", value))


# ----------------------------------------------------------------- models
@dataclass
class Embed:
    """A NullCord SendableEmbed.

    NullCord's text embeds support title, description, URL, icon URL, media
    (an Autumn file ID), and a CSS colour. They do not have Discord-style
    fields or footers; ``add_field`` and ``set_footer`` fold that text into the
    description so code written for discord.py still produces useful output.
    """

    title: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    icon_url: Optional[str] = None
    media: Optional[str] = None
    colour: Optional[str] = None
    color: Optional[str] = None

    @property
    def _colour(self) -> Optional[str]:
        return self.colour or self.color

    def to_dict(self) -> dict[str, Any]:
        return _clean(
            {
                "title": self.title,
                "description": self.description,
                "url": self.url,
                "icon_url": self.icon_url,
                "media": _id_of(self.media) if self.media else None,
                "colour": self._colour,
            }
        )

    def add_field(self, name: str, value: str, inline: bool = True) -> "Embed":
        line = f"**{name}**\n{value}" if name else str(value)
        self.description = f"{self.description}\n\n{line}" if self.description else line
        return self

    def set_footer(self, text: str, icon_url: Optional[str] = None) -> "Embed":
        self.description = f"{self.description}\n\n_{text}_" if self.description else f"_{text}_"
        if icon_url and not self.icon_url:
            self.icon_url = icon_url
        return self

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Embed":
        return cls(
            title=data.get("title"),
            description=data.get("description"),
            url=data.get("url"),
            icon_url=data.get("icon_url"),
            media=data.get("media"),
            colour=data.get("colour"),
        )


@dataclass
class File:
    """An Autumn upload or a file to upload."""

    path: Optional[Union[str, Path]] = None
    data: Optional[bytes] = None
    filename: Optional[str] = None
    content_type: Optional[str] = None
    spoiler: bool = False
    id: str = ""
    tag: str = "attachments"
    size: int = 0
    url: Optional[str] = None

    def read_bytes(self) -> bytes:
        if self.data is not None:
            return self.data
        if self.path is None:
            return b""
        return Path(self.path).read_bytes()

    def resolved_filename(self) -> str:
        if self.filename:
            return self.filename
        if self.path:
            return Path(self.path).name
        return "file"

    def resolved_content_type(self) -> str:
        if self.content_type:
            return self.content_type
        guessed, _ = mimetypes.guess_type(self.resolved_filename())
        return guessed or "application/octet-stream"

    @classmethod
    def from_dict(cls, data: dict[str, Any], autumn_url: str | None = None) -> "File":
        file_id = str(data.get("_id") or data.get("id") or "")
        tag = str(data.get("tag") or "attachments")
        filename = str(data.get("filename") or "file")
        url = None
        if autumn_url and file_id:
            url = f"{autumn_url.rstrip('/')}/{tag}/{file_id}/{filename}"
        return cls(
            id=file_id,
            tag=tag,
            filename=filename,
            content_type=data.get("content_type"),
            size=int(data.get("size") or 0),
            url=url,
            data=None,
        )


class _Model:
    def __init__(self, client: "Client", data: dict[str, Any]):
        self.client = client
        self.raw = data or {}


class User(_Model):
    def __init__(self, client: "Client", data: dict[str, Any]):
        super().__init__(client, data)
        self.id = str(data.get("_id") or data.get("id") or "")
        self.username = str(data.get("username") or "")
        self.discriminator = str(data.get("discriminator") or "0")
        self.display_name = data.get("display_name")
        self.pronouns = data.get("pronouns")
        self.avatar = File.from_dict(data["avatar"], getattr(client, "autumn_url", None)) if data.get("avatar") else None
        self.badges = int(data.get("badges") or 0)
        self.flags = int(data.get("flags") or 0)
        self.privileged = bool(data.get("privileged"))
        self.bot = data.get("bot")
        self.is_bot = bool(data.get("bot"))
        self.online = bool(data.get("online"))
        self.status = data.get("status")

    @property
    def name(self) -> str:
        return self.display_name or self.username

    @property
    def mention(self) -> str:
        return f"<@{self.id}>"

    @property
    def tag(self) -> str:
        return f"{self.username}#{self.discriminator}"

    @property
    def avatar_url(self) -> str | None:
        return self.avatar.url if self.avatar else None

    async def fetch(self) -> "User":
        return await self.client.http.fetch_user(self.id)

    async def open_dm(self) -> "Channel":
        return await self.client.http.open_dm(self.id)

    async def send(self, content: str | None = None, **kwargs: Any) -> "Message":
        channel = await self.open_dm()
        return await channel.send(content, **kwargs)

    def __repr__(self) -> str:
        return f"<User id={self.id!r} username={self.username!r}>"


class Member:
    def __init__(self, client: "Client", server: "Server | None", data: dict[str, Any]):
        data = data or {}
        self.client = client
        self.server = server
        self.raw = data
        key = data.get("_id") or {}
        self.user_id = str(key.get("user") or data.get("user") or "")
        self.server_id = str(key.get("server") or data.get("server") or getattr(server, "id", ""))
        self.joined_at = data.get("joined_at")
        self.nickname = data.get("nickname")
        self.pronouns = data.get("pronouns")
        self.roles = list(data.get("roles") or [])
        self.timeout = data.get("timeout")
        self.can_publish = data.get("can_publish", True)
        self.can_receive = data.get("can_receive", True)

    @property
    def id(self) -> str:
        return self.user_id

    @property
    def user(self) -> User | None:
        return self.client.get_user(self.user_id) if self.client else None

    @property
    def display_name(self) -> str:
        return self.nickname or (self.user.name if self.user else self.user_id)

    async def edit(self, **fields: Any) -> "Member":
        return await self.server.edit_member(self.user_id, **fields)

    async def kick(self, reason: str | None = None) -> None:
        await self.server.kick(self.user_id, reason=reason)

    async def ban(self, reason: str | None = None, delete_message_seconds: int = 0) -> None:
        await self.server.ban(self.user_id, reason=reason, delete_message_seconds=delete_message_seconds)

    def __repr__(self) -> str:
        return f"<Member server={self.server_id!r} user={self.user_id!r}>"


class Role:
    def __init__(self, client: "Client", data: dict[str, Any], server: "Server | None" = None):
        self.client = client
        self.raw = data or {}
        self.server = server
        self.id = str(data.get("_id") or data.get("id") or "")
        self.name = str(data.get("name") or "")
        self.colour = data.get("colour")
        self.hoist = bool(data.get("hoist"))
        self.rank = data.get("rank", 0)
        self.permissions = data.get("permissions") or {}
        self.icon = File.from_dict(data["icon"], getattr(client, "autumn_url", None)) if data.get("icon") else None

    @property
    def color(self) -> str | None:
        return self.colour

    async def edit(self, **fields: Any) -> "Role":
        if self.server is None:
            raise RuntimeError("Role is not attached to a server")
        return await self.server.edit_role(self.id, **fields)

    async def delete(self) -> None:
        if self.server is None:
            raise RuntimeError("Role is not attached to a server")
        await self.server.delete_role(self.id)

    def __repr__(self) -> str:
        return f"<Role id={self.id!r} name={self.name!r}>"


class Channel(_Model):
    def __init__(self, client: "Client", data: dict[str, Any]):
        super().__init__(client, data)
        self.id = str(data.get("_id") or data.get("id") or "")
        self.type = str(data.get("channel_type") or data.get("type") or "")
        self.name = data.get("name")
        self.description = data.get("description")
        self.server_id = data.get("server")
        self.owner_id = data.get("owner")
        self.recipients = list(data.get("recipients") or [])
        self.last_message_id = data.get("last_message_id")
        self.nsfw = bool(data.get("nsfw"))
        self.icon = File.from_dict(data["icon"], getattr(client, "autumn_url", None)) if data.get("icon") else None
        self.default_permissions = data.get("default_permissions")

    @property
    def server(self) -> "Server | None":
        return self.client.get_server(self.server_id) if self.client and self.server_id else None

    @property
    def mention(self) -> str:
        return f"<#{self.id}>"

    async def send(self, content: str | None = None, **kwargs: Any) -> "Message":
        return await self.client.http.send_message(self.id, content, **kwargs)

    async def fetch_messages(self, **kwargs: Any) -> list["Message"]:
        return await self.client.http.fetch_messages(self.id, **kwargs)

    async def fetch_message(self, message_id: str) -> "Message":
        return await self.client.http.fetch_message(self.id, message_id)

    async def fetch_members(self) -> list[User]:
        return await self.client.http.fetch_channel_members(self.id)

    async def edit(self, **fields: Any) -> "Channel":
        return await self.client.http.edit_channel(self.id, **fields)

    async def delete(self) -> None:
        await self.client.http.delete_channel(self.id)

    async def join_call(self, node: str | None = None) -> Any:
        return await self.client.http.join_call(self.id, node=node)

    def __repr__(self) -> str:
        return f"<Channel id={self.id!r} type={self.type!r} name={self.name!r}>"


class Server(_Model):
    def __init__(self, client: "Client", data: dict[str, Any]):
        super().__init__(client, data)
        self.id = str(data.get("_id") or data.get("id") or "")
        self.owner_id = data.get("owner")
        self.name = str(data.get("name") or "")
        self.description = data.get("description")
        self.channel_ids = list(data.get("channels") or [])
        self.categories = list(data.get("categories") or [])
        self.roles = {
            str(role_id): Role(client, role_data, self)
            for role_id, role_data in (data.get("roles") or {}).items()
        }
        self.default_permissions = data.get("default_permissions")
        self.icon = File.from_dict(data["icon"], getattr(client, "autumn_url", None)) if data.get("icon") else None
        self.banner = File.from_dict(data["banner"], getattr(client, "autumn_url", None)) if data.get("banner") else None
        self.flags = data.get("flags", 0)
        self.nsfw = bool(data.get("nsfw"))
        self.discoverable = bool(data.get("discoverable"))
        self.approximate_member_count = int(data.get("approximate_member_count") or 0)

    @property
    def channels(self) -> list[Channel]:
        if not self.client:
            return []
        return [channel for channel_id in self.channel_ids if (channel := self.client.get_channel(channel_id))]

    @property
    def icon_url(self) -> str | None:
        return self.icon.url if self.icon else None

    async def fetch_member(self, user_id: str) -> Member:
        return await self.client.http.fetch_member(self.id, user_id)

    async def fetch_members(self, **kwargs: Any) -> list[Member]:
        return await self.client.http.fetch_members(self.id, **kwargs)

    async def edit_member(self, user_id: str, **fields: Any) -> Member:
        return await self.client.http.edit_member(self.id, user_id, **fields)

    async def kick(self, user_id: str, reason: str | None = None) -> None:
        await self.client.http.kick_member(self.id, user_id, reason=reason)

    async def ban(self, user_id: str, reason: str | None = None, delete_message_seconds: int = 0) -> None:
        await self.client.http.ban_member(
            self.id, user_id, reason=reason, delete_message_seconds=delete_message_seconds
        )

    async def unban(self, user_id: str) -> None:
        await self.client.http.unban_member(self.id, user_id)

    async def fetch_bans(self) -> list["Ban"]:
        return await self.client.http.fetch_bans(self.id)

    async def create_channel(self, name: str, **fields: Any) -> Channel:
        return await self.client.http.create_channel(self.id, name, **fields)

    async def fetch_roles(self) -> dict[str, Role]:
        return await self.client.http.fetch_roles(self.id)

    async def fetch_role(self, role_id: str) -> Role:
        return await self.client.http.fetch_role(self.id, role_id)

    async def create_role(self, name: str, **fields: Any) -> Role:
        return await self.client.http.create_role(self.id, name, **fields)

    async def edit_role(self, role_id: str, **fields: Any) -> Role:
        return await self.client.http.edit_role(self.id, role_id, **fields)

    async def delete_role(self, role_id: str) -> None:
        await self.client.http.delete_role(self.id, role_id)

    async def edit_role_ranks(self, ranks: Sequence[str]) -> None:
        await self.client.http.edit_role_ranks(self.id, ranks)

    async def set_permissions(self, role_id: str, allow: int = 0, deny: int = 0) -> None:
        await self.client.http.set_server_permissions(self.id, role_id, allow=allow, deny=deny)

    async def set_default_permissions(self, permissions: int) -> None:
        await self.client.http.set_server_default_permissions(self.id, permissions)

    async def fetch_invites(self) -> list["Invite"]:
        return await self.client.http.fetch_server_invites(self.id)

    async def fetch_emojis(self) -> list["Emoji"]:
        return await self.client.http.fetch_server_emojis(self.id)

    async def fetch_audit_logs(self, **params: Any) -> Any:
        return await self.client.http.fetch_audit_logs(self.id, **params)

    async def edit(self, **fields: Any) -> "Server":
        return await self.client.http.edit_server(self.id, **fields)

    async def delete(self) -> None:
        await self.client.http.delete_server(self.id)

    def __repr__(self) -> str:
        return f"<Server id={self.id!r} name={self.name!r}>"


class Message(_Model):
    def __init__(self, client: "Client", data: dict[str, Any]):
        super().__init__(client, data)
        self.id = str(data.get("_id") or data.get("id") or "")
        self.channel_id = str(data.get("channel") or data.get("channel_id") or "")
        self.author_id = str(data.get("author") or data.get("author_id") or "")
        self.content = data.get("content") or ""
        self.nonce = data.get("nonce")
        self.edited = data.get("edited")
        self.pinned = bool(data.get("pinned"))
        self.flags = int(data.get("flags") or 0)
        self.replies = list(data.get("replies") or [])
        self.mentions = list(data.get("mentions") or [])
        self.role_mentions = list(data.get("role_mentions") or [])
        self.reactions = dict(data.get("reactions") or {})
        self.masquerade = data.get("masquerade")
        self.interactions = data.get("interactions") or {}
        self.attachments = [
            File.from_dict(item, getattr(client, "autumn_url", None)) for item in (data.get("attachments") or [])
        ]
        self.embeds = [Embed.from_dict(item) for item in (data.get("embeds") or [])]
        self.system = data.get("system")
        self.user = User(client, data["user"]) if data.get("user") else None
        self.webhook = data.get("webhook")

    @property
    def channel(self) -> Channel | None:
        return self.client.get_channel(self.channel_id) if self.client else None

    @property
    def author(self) -> User | None:
        return (self.client.get_user(self.author_id) if self.client else None) or self.user

    @property
    def created_at(self) -> datetime | None:
        return _ulid_time(self.id)

    @property
    def jump_url(self) -> str | None:
        channel = self.channel
        if not channel:
            return None
        base = self.client.app_url.rstrip("/")
        if channel.server_id:
            return f"{base}/server/{channel.server_id}/channel/{channel.id}/{self.id}"
        return f"{base}/channel/{channel.id}/{self.id}"

    async def reply(self, content: str | None = None, **kwargs: Any) -> "Message":
        return await self.client.http.send_message(
            self.channel_id, content, replies=[self.id], **kwargs
        )

    async def edit(self, content: str | None = None, **kwargs: Any) -> "Message":
        return await self.client.http.edit_message(self.channel_id, self.id, content, **kwargs)

    async def delete(self) -> None:
        await self.client.http.delete_message(self.channel_id, self.id)

    async def react(self, emoji: str) -> None:
        await self.client.http.react(self.channel_id, self.id, emoji)

    async def unreact(self, emoji: str, *, user_id: str | None = None, remove_all: bool = False) -> None:
        await self.client.http.unreact(
            self.channel_id, self.id, emoji, user_id=user_id, remove_all=remove_all
        )

    async def clear_reactions(self) -> None:
        await self.client.http.clear_reactions(self.channel_id, self.id)

    async def pin(self) -> None:
        await self.client.http.pin_message(self.channel_id, self.id)

    async def unpin(self) -> None:
        await self.client.http.unpin_message(self.channel_id, self.id)

    async def fetch(self) -> "Message":
        return await self.client.http.fetch_message(self.channel_id, self.id)

    def __repr__(self) -> str:
        return f"<Message id={self.id!r} channel={self.channel_id!r}>"


@dataclass
class Invite:
    code: str
    server_id: str | None = None
    channel_id: str | None = None
    creator_id: str | None = None
    member_count: int = 0
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Invite":
        return cls(
            code=str(data.get("code") or data.get("_id") or ""),
            server_id=data.get("server"),
            channel_id=data.get("channel"),
            creator_id=data.get("creator"),
            member_count=int(data.get("member_count") or 0),
            raw=data,
        )


@dataclass
class Emoji:
    id: str
    name: str
    parent: Any = None
    creator_id: str | None = None
    animated: bool = False
    nsfw: bool = False
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def mention(self) -> str:
        return f"<:{self.name}:{self.id}>"

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Emoji":
        return cls(
            id=str(data.get("_id") or data.get("id") or ""),
            name=str(data.get("name") or ""),
            parent=data.get("parent"),
            creator_id=data.get("creator_id") or data.get("creator"),
            animated=bool(data.get("animated")),
            nsfw=bool(data.get("nsfw")),
            raw=data,
        )


@dataclass
class Ban:
    user_id: str
    reason: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Ban":
        user = data.get("user") or {}
        user_id = data.get("_id") or data.get("id") or user.get("_id") or user.get("id")
        return cls(user_id=str(user_id or ""), reason=data.get("reason"), raw=data)


@dataclass
class Webhook:
    id: str
    name: str
    channel_id: str
    token: str | None = None
    creator_id: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Webhook":
        return cls(
            id=str(data.get("id") or data.get("_id") or ""),
            name=str(data.get("name") or ""),
            channel_id=str(data.get("channel_id") or data.get("channel") or ""),
            token=data.get("token"),
            creator_id=data.get("creator_id") or data.get("creator"),
            raw=data,
        )


# ----------------------------------------------------------------- http client
class HTTPClient:
    def __init__(
        self,
        token: str,
        api_url: str = DEFAULT_API_URL,
        *,
        session: Any = None,
    ):
        self.token = token
        self.api_url = api_url.rstrip("/")
        self.client: Any = None
        self._session = session
        self._owns_session = session is None
        self._node: dict[str, Any] | None = None
        self._autumn_url: str | None = None
        self.app_url = ""
        self.ws_url = DEFAULT_WS_URL

    async def start(self) -> None:
        if aiohttp is None:
            raise RuntimeError("aiohttp is required for network access: pip install aiohttp")
        if self._session is None:
            self._session = aiohttp.ClientSession()
            self._owns_session = True

    async def close(self) -> None:
        if self._session is not None and self._owns_session:
            await self._session.close()
        self._session = None

    @property
    def session(self) -> Any:
        if self._session is None:
            raise RuntimeError("HTTPClient.start() has not been called")
        return self._session

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {"x-bot-token": self.token, "Accept": "application/json"}
        if extra:
            headers.update(extra)
        return headers

    async def request(
        self,
        method: str,
        path: str,
        *,
        payload: Any = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        data: Any = None,
        raw: bool = False,
    ) -> Any:
        url = path if path.startswith("http") else f"{self.api_url}/{path.lstrip('/')}"
        request_headers = self._headers(headers)
        body = None
        if payload is not None:
            body = _json.dumps(payload)
            request_headers["Content-Type"] = "application/json"
        elif data is not None:
            body = data

        if self._session is None:
            # Small synchronous fallback for one-off scripts without aiohttp.
            return await asyncio.to_thread(
                self._urllib_request,
                method,
                url,
                params,
                request_headers,
                body,
                raw,
            )

        async with self.session.request(
            method,
            url,
            params=params,
            headers=request_headers,
            data=body,
        ) as response:
            text = await response.text()
            if response.status == 204:
                return None
            if response.status >= 400:
                try:
                    decoded = _json.loads(text) if text else {}
                except ValueError:
                    decoded = text
                _raise_http(response.status, decoded, response)
            if raw:
                return text
            if not text:
                return None
            try:
                return _json.loads(text)
            except ValueError:
                return text

    @staticmethod
    def _urllib_request(
        method: str,
        url: str,
        params: dict[str, Any] | None,
        headers: dict[str, str],
        body: Any,
        raw: bool,
    ) -> Any:
        if params:
            query = urllib.parse.urlencode(params)
            url = f"{url}?{query}"
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                text = response.read().decode()
        except urllib.error.HTTPError as error:
            text = error.read().decode()
            try:
                decoded = _json.loads(text) if text else {}
            except ValueError:
                decoded = text
            _raise_http(error.code, decoded, error)
        if raw:
            return text
        return _json.loads(text) if text else None

    async def fetch_node(self) -> dict[str, Any]:
        node = await self.request("GET", "/")
        self._node = node
        self.app_url = node.get("app") or ""
        self.ws_url = self.ws_url or node.get("ws") or DEFAULT_WS_URL
        autumn = (node.get("features") or {}).get("autumn") or {}
        self._autumn_url = autumn.get("url")
        return node

    @property
    def autumn_url(self) -> str | None:
        return self._autumn_url

    def _server(self, server_id: str) -> Any:
        if self.client is not None:
            return self.client.get_server(server_id) or Server(self.client, {"_id": server_id})
        return Server(None, {"_id": server_id})  # type: ignore[arg-type]

    # ---- users
    async def fetch_self(self) -> User:
        return User(self.client, await self.request("GET", "/users/@me"))  # type: ignore[arg-type]

    async def fetch_user(self, user_id: str) -> User:
        return User(self.client, await self.request("GET", f"/users/{user_id}"))  # type: ignore[arg-type]

    async def fetch_profile(self, user_id: str) -> dict[str, Any]:
        return await self.request("GET", f"/users/{user_id}/profile")

    async def fetch_user_flags(self, user_id: str) -> Any:
        return await self.request("GET", f"/users/{user_id}/flags")

    async def fetch_default_avatar(self, user_id: str) -> Any:
        return await self.request("GET", f"/users/{user_id}/default_avatar")

    async def fetch_dms(self) -> list[Channel]:
        data = await self.request("GET", "/users/dms")
        return [Channel(self.client, item) for item in data]  # type: ignore[arg-type]

    async def open_dm(self, user_id: str) -> Channel:
        return Channel(self.client, await self.request("GET", f"/users/{user_id}/dm"))  # type: ignore[arg-type]

    async def fetch_mutual(self, user_id: str) -> dict[str, Any]:
        return await self.request("GET", f"/users/{user_id}/mutual")

    async def edit_self(self, **fields: Any) -> User:
        return User(self.client, await self.request("PATCH", "/users/@me", payload=_clean(fields)))  # type: ignore[arg-type]

    async def fetch_owned_bots(self) -> list[dict[str, Any]]:
        return await self.request("GET", "/bots/@me")

    # ---- channels
    async def fetch_channel(self, channel_id: str) -> Channel:
        return Channel(self.client, await self.request("GET", f"/channels/{channel_id}"))  # type: ignore[arg-type]

    async def edit_channel(self, channel_id: str, **fields: Any) -> Channel:
        return Channel(
            self.client, await self.request("PATCH", f"/channels/{channel_id}", payload=_clean(fields))
        )  # type: ignore[arg-type]

    async def delete_channel(self, channel_id: str) -> None:
        await self.request("DELETE", f"/channels/{channel_id}")

    async def fetch_channel_members(self, channel_id: str) -> list[User]:
        data = await self.request("GET", f"/channels/{channel_id}/members")
        return [User(self.client, item) for item in data]  # type: ignore[arg-type]

    async def join_call(
        self,
        channel_id: str,
        node: str | None = None,
        *,
        force_disconnect: bool | None = None,
        recipients: Sequence[str] | None = None,
    ) -> Any:
        payload = _clean(
            {
                "node": node,
                "force_disconnect": force_disconnect,
                "recipients": list(recipients) if recipients else None,
            }
        )
        return await self.request("POST", f"/channels/{channel_id}/join_call", payload=payload)

    async def end_ring(self, channel_id: str, user_id: str) -> None:
        await self.request("PUT", f"/channels/{channel_id}/end_ring/{user_id}")

    async def set_channel_permissions(self, channel_id: str, role_id: str, allow: int = 0, deny: int = 0) -> None:
        await self.request(
            "PUT",
            f"/channels/{channel_id}/permissions/{role_id}",
            payload={"permissions": {"allow": allow, "deny": deny}},
        )

    async def set_channel_default_permissions(self, channel_id: str, permissions: int) -> None:
        await self.request(
            "PUT",
            f"/channels/{channel_id}/permissions/default",
            payload={"permissions": permissions},
        )

    # ---- messages
    async def send_message(
        self,
        channel_id: str,
        content: str | None = None,
        *,
        embed: Embed | dict[str, Any] | None = None,
        embeds: Sequence[Embed | dict[str, Any]] | None = None,
        attachments: Sequence[Any] | None = None,
        replies: Sequence[Any] | None = None,
        masquerade: dict[str, Any] | None = None,
        interactions: dict[str, Any] | None = None,
        nonce: str | None = None,
        flags: int | None = None,
        file: File | str | Path | None = None,
        files: Sequence[File | str | Path] | None = None,
        idempotency_key: str | None = None,
        **extra: Any,
    ) -> Message:
        file_values = list(files or [])
        if file is not None:
            file_values.insert(0, file)

        uploaded: list[File] = []
        for value in file_values:
            uploaded.append(await self.upload(value))

        attachment_ids = [uploaded_file.id for uploaded_file in uploaded]
        if attachments:
            attachment_ids.extend(_file_id(item) for item in attachments if item is not None)

        embed_values = [embed] if embed is not None else list(embeds or [])
        payload: dict[str, Any] = {
            "content": content,
            "attachments": attachment_ids or None,
            "embeds": [_embed_payload(item) for item in embed_values] or None,
            "replies": [
                item if isinstance(item, dict) else {"id": _id_of(item), "mention": False}
                for item in (replies or [])
            ]
            or None,
            "masquerade": masquerade,
            "interactions": interactions,
            "nonce": nonce or uuid.uuid4().hex[:32],
            "flags": flags,
        }
        payload.update(extra)
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else None
        data = await self.request(
            "POST",
            f"/channels/{channel_id}/messages",
            payload=_clean(payload),
            headers=headers,
        )
        return Message(self.client, data)  # type: ignore[arg-type]

    async def fetch_messages(
        self,
        channel_id: str,
        *,
        limit: int = 50,
        before: str | None = None,
        after: str | None = None,
        sort: str | None = None,
        nearby: str | None = None,
        include_users: bool = False,
    ) -> list[Message]:
        params = _clean(
            {
                "limit": limit,
                "before": before,
                "after": after,
                "sort": sort,
                "nearby": nearby,
                "include_users": str(include_users).lower() if include_users else None,
            }
        )
        data = await self.request("GET", f"/channels/{channel_id}/messages", params=params)
        messages = data.get("messages", data) if isinstance(data, dict) else data
        users = data.get("users", []) if isinstance(data, dict) else []
        return [
            Message(self.client, {**message, "user": _find_user(users, message.get("author"))})
            for message in messages or []
        ]  # type: ignore[arg-type]

    async def fetch_message(self, channel_id: str, message_id: str) -> Message:
        data = await self.request("GET", f"/channels/{channel_id}/messages/{message_id}")
        return Message(self.client, data)  # type: ignore[arg-type]

    async def edit_message(
        self,
        channel_id: str,
        message_id: str,
        content: str | None = None,
        *,
        embed: Embed | dict[str, Any] | None = None,
        embeds: Sequence[Embed | dict[str, Any]] | None = None,
    ) -> Message:
        embed_values = [embed] if embed is not None else list(embeds or [])
        payload = _clean(
            {
                "content": content,
                "embeds": [_embed_payload(item) for item in embed_values] or None,
            }
        )
        data = await self.request(
            "PATCH", f"/channels/{channel_id}/messages/{message_id}", payload=payload
        )
        return Message(self.client, data)  # type: ignore[arg-type]

    async def delete_message(self, channel_id: str, message_id: str) -> None:
        await self.request("DELETE", f"/channels/{channel_id}/messages/{message_id}")

    async def bulk_delete_messages(self, channel_id: str, message_ids: Sequence[str]) -> None:
        await self.request(
            "DELETE",
            f"/channels/{channel_id}/messages/bulk",
            payload={"ids": list(message_ids)},
        )

    async def pin_message(self, channel_id: str, message_id: str) -> None:
        await self.request("POST", f"/channels/{channel_id}/messages/{message_id}/pin")

    async def unpin_message(self, channel_id: str, message_id: str) -> None:
        await self.request("DELETE", f"/channels/{channel_id}/messages/{message_id}/pin")

    async def react(self, channel_id: str, message_id: str, emoji: str) -> None:
        await self.request(
            "PUT", f"/channels/{channel_id}/messages/{message_id}/reactions/{_quote(emoji)}"
        )

    async def unreact(
        self,
        channel_id: str,
        message_id: str,
        emoji: str,
        *,
        user_id: str | None = None,
        remove_all: bool = False,
    ) -> None:
        params = {}
        if user_id:
            params["user_id"] = user_id
        if remove_all:
            params["remove_all"] = "true"
        await self.request(
            "DELETE",
            f"/channels/{channel_id}/messages/{message_id}/reactions/{_quote(emoji)}",
            params=params or None,
        )

    async def clear_reactions(self, channel_id: str, message_id: str) -> None:
        await self.request("DELETE", f"/channels/{channel_id}/messages/{message_id}/reactions")

    # ---- servers
    async def fetch_server(self, server_id: str) -> Server:
        return Server(self.client, await self.request("GET", f"/servers/{server_id}"))  # type: ignore[arg-type]

    async def edit_server(self, server_id: str, **fields: Any) -> Server:
        return Server(
            self.client, await self.request("PATCH", f"/servers/{server_id}", payload=_clean(fields))
        )  # type: ignore[arg-type]

    async def delete_server(self, server_id: str) -> None:
        await self.request("DELETE", f"/servers/{server_id}")

    async def fetch_member(self, server_id: str, user_id: str) -> Member:
        data = await self.request("GET", f"/servers/{server_id}/members/{user_id}")
        return Member(self.client, self._server(server_id), data)  # type: ignore[arg-type]

    async def fetch_members(self, server_id: str, **params: Any) -> list[Member]:
        data = await self.request("GET", f"/servers/{server_id}/members", params=_clean(params))
        members = data.get("members", data) if isinstance(data, dict) else data
        server = self._server(server_id)
        return [Member(self.client, server, item) for item in members]  # type: ignore[arg-type]

    async def edit_member(self, server_id: str, user_id: str, **fields: Any) -> Member:
        data = await self.request(
            "PATCH", f"/servers/{server_id}/members/{user_id}", payload=_clean(fields)
        )
        return Member(self.client, self._server(server_id), data)  # type: ignore[arg-type]

    async def kick_member(self, server_id: str, user_id: str, *, reason: str | None = None) -> None:
        await self.request(
            "DELETE",
            f"/servers/{server_id}/members/{user_id}",
            headers={"X-Audit-Log-Reason": reason} if reason else None,
        )

    async def ban_member(
        self,
        server_id: str,
        user_id: str,
        *,
        reason: str | None = None,
        delete_message_seconds: int = 0,
    ) -> None:
        await self.request(
            "PUT",
            f"/servers/{server_id}/bans/{user_id}",
            payload={"reason": reason, "delete_message_seconds": delete_message_seconds},
            headers={"X-Audit-Log-Reason": reason} if reason else None,
        )

    async def unban_member(self, server_id: str, user_id: str) -> None:
        await self.request("DELETE", f"/servers/{server_id}/bans/{user_id}")

    async def fetch_bans(self, server_id: str) -> list[Ban]:
        data = await self.request("GET", f"/servers/{server_id}/bans")
        return [Ban.from_dict(item) for item in (data.get("bans", data) if isinstance(data, dict) else data)]

    async def create_channel(self, server_id: str, name: str, **fields: Any) -> Channel:
        payload = {"name": name, **fields}
        return Channel(
            self.client, await self.request("POST", f"/servers/{server_id}/channels", payload=_clean(payload))
        )  # type: ignore[arg-type]

    async def fetch_roles(self, server_id: str) -> dict[str, Role]:
        data = await self.request("GET", f"/servers/{server_id}")
        roles = (data.get("roles") or {}) if isinstance(data, dict) else {}
        return {str(role_id): Role(self.client, role) for role_id, role in roles.items()}  # type: ignore[arg-type]

    async def fetch_role(self, server_id: str, role_id: str) -> Role:
        data = await self.request("GET", f"/servers/{server_id}/roles/{role_id}")
        return Role(self.client, data)  # type: ignore[arg-type]

    async def create_role(self, server_id: str, name: str, **fields: Any) -> Role:
        payload = {"name": name, **fields}
        data = await self.request("POST", f"/servers/{server_id}/roles", payload=_clean(payload))
        role = data.get("role", data) if isinstance(data, dict) else data
        return Role(self.client, role)  # type: ignore[arg-type]

    async def edit_role(self, server_id: str, role_id: str, **fields: Any) -> Role:
        data = await self.request(
            "PATCH", f"/servers/{server_id}/roles/{role_id}", payload=_clean(fields)
        )
        role = data.get("role", data) if isinstance(data, dict) else data
        return Role(self.client, role)  # type: ignore[arg-type]

    async def delete_role(self, server_id: str, role_id: str) -> None:
        await self.request("DELETE", f"/servers/{server_id}/roles/{role_id}")

    async def edit_role_ranks(self, server_id: str, ranks: Sequence[str]) -> None:
        await self.request("PATCH", f"/servers/{server_id}/roles/ranks", payload={"ranks": list(ranks)})

    async def set_server_permissions(self, server_id: str, role_id: str, allow: int = 0, deny: int = 0) -> None:
        await self.request(
            "PUT",
            f"/servers/{server_id}/permissions/{role_id}",
            payload={"permissions": {"allow": allow, "deny": deny}},
        )

    async def set_server_default_permissions(self, server_id: str, permissions: int) -> None:
        await self.request(
            "PUT", f"/servers/{server_id}/permissions/default", payload={"permissions": permissions}
        )

    async def fetch_server_invites(self, server_id: str) -> list[Invite]:
        data = await self.request("GET", f"/servers/{server_id}/invites")
        return [Invite.from_dict(item) for item in data]

    async def fetch_server_emojis(self, server_id: str) -> list[Emoji]:
        data = await self.request("GET", f"/servers/{server_id}/emojis")
        return [Emoji.from_dict(item) for item in data]

    async def fetch_audit_logs(self, server_id: str, **params: Any) -> Any:
        return await self.request("GET", f"/servers/{server_id}/audit_logs", params=_clean(params))

    # ---- invites / emoji
    async def fetch_invite(self, code: str) -> Invite:
        return Invite.from_dict(await self.request("GET", f"/invites/{code}"))

    async def delete_invite(self, code: str) -> None:
        await self.request("DELETE", f"/invites/{code}")

    async def fetch_emoji(self, emoji_id: str) -> Emoji:
        return Emoji.from_dict(await self.request("GET", f"/custom/emoji/{emoji_id}"))

    async def create_emoji(self, emoji_id: str, name: str, parent: dict[str, Any], nsfw: bool = False) -> Emoji:
        data = await self.request(
            "PUT",
            f"/custom/emoji/{emoji_id}",
            payload={"name": name, "parent": parent, "nsfw": nsfw},
        )
        return Emoji.from_dict(data)

    async def edit_emoji(self, emoji_id: str, name: str) -> Emoji:
        return Emoji.from_dict(
            await self.request("PATCH", f"/custom/emoji/{emoji_id}", payload={"name": name})
        )

    async def delete_emoji(self, emoji_id: str) -> None:
        await self.request("DELETE", f"/custom/emoji/{emoji_id}")

    # ---- webhooks (only when the instance enables webhooks)
    async def create_webhook(self, channel_id: str, name: str, avatar: str | None = None) -> Webhook:
        return Webhook.from_dict(
            await self.request(
                "POST", f"/channels/{channel_id}/webhooks", payload=_clean({"name": name, "avatar": avatar})
            )
        )

    async def fetch_webhooks(self, channel_id: str) -> list[Webhook]:
        data = await self.request("GET", f"/channels/{channel_id}/webhooks")
        return [Webhook.from_dict(item) for item in data]

    async def execute_webhook(
        self,
        webhook_id: str,
        token: str,
        content: str | None = None,
        *,
        embed: Embed | dict[str, Any] | None = None,
        embeds: Sequence[Embed | dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> Message:
        embed_values = [embed] if embed is not None else list(embeds or [])
        payload = _clean(
            {
                "content": content,
                "embeds": [_embed_payload(item) for item in embed_values] or None,
                **kwargs,
            }
        )
        data = await self.request("POST", f"/webhooks/{webhook_id}/{token}", payload=payload)
        return Message(self.client, data)  # type: ignore[arg-type]

    # ---- uploads
    async def upload(self, value: File | str | Path, tag: str = "attachments") -> File:
        file = value if isinstance(value, File) else File(path=value)
        if file.id:
            return file
        if not self._autumn_url:
            await self.fetch_node()
        if not self._autumn_url:
            raise RuntimeError("This instance does not advertise an Autumn upload URL")

        data = file.read_bytes()
        if self._session is None:
            raise RuntimeError("HTTPClient.start() has not been called")
        form = aiohttp.FormData()
        form.add_field(
            "file",
            data,
            filename=file.resolved_filename(),
            content_type=file.resolved_content_type(),
        )
        url = f"{self._autumn_url.rstrip('/')}/{tag}"
        async with self.session.post(url, data=form, headers={"x-bot-token": self.token}) as response:
            text = await response.text()
            if response.status >= 400:
                try:
                    decoded = _json.loads(text) if text else {}
                except ValueError:
                    decoded = text
                _raise_http(response.status, decoded, response)
            result = _json.loads(text) if text else {}
        file.id = str(result.get("id") or "")
        file.tag = tag
        file.size = len(data)
        file.url = f"{self._autumn_url.rstrip('/')}/{tag}/{file.id}/{file.resolved_filename()}"
        return file


def _quote(value: str) -> str:
    from urllib.parse import quote

    return quote(value, safe="")


def _find_user(users: list[dict[str, Any]], user_id: str | None) -> dict[str, Any] | None:
    for user in users:
        if str(user.get("_id") or user.get("id")) == str(user_id):
            return user
    return None


# ----------------------------------------------------------------- bot commands
class Context:
    def __init__(self, client: "Bot", message: Message, command: str, args: list[str], prefix: str):
        self.client = client
        self.message = message
        self.command = command
        self.args = args
        self.prefix = prefix
        self.channel = message.channel
        self.author = message.author
        self.server = self.channel.server if self.channel else None

    async def send(self, content: str | None = None, **kwargs: Any) -> Message:
        return await self.message.channel.send(content, **kwargs)

    async def reply(self, content: str | None = None, **kwargs: Any) -> Message:
        return await self.message.reply(content, **kwargs)

    @property
    def raw(self) -> str:
        return self.message.content


class Bot:
    """Optional prefix-command Bot built on Client.

    This is deliberately small: it gives discord.py users a familiar
    ``@bot.command()`` and ``ctx.send()`` without hiding the HTTP client.
    """

    def __init__(self, *, prefix: str = "!", **client_kwargs: Any):
        self.prefix = prefix
        self.client = Client(**client_kwargs)
        self.commands: dict[str, Callable[..., Any]] = {}
        self.client.add_listener("message", self._on_message)

    def command(self, name: str | None = None, *, aliases: Sequence[str] = ()):
        def decorator(func: Callable[..., Any]):
            command_name = name or func.__name__
            self.commands[command_name.lower()] = func
            for alias in aliases:
                self.commands[alias.lower()] = func
            return func

        return decorator

    def event(self, func: Callable[..., Any]):
        return self.client.event(func)

    async def _on_message(self, message: Message) -> None:
        if not message.content.startswith(self.prefix):
            return
        parts = message.content[len(self.prefix) :].split()
        if not parts:
            return
        name, *args = parts
        command = self.commands.get(name.lower())
        if command is None:
            return
        ctx = Context(self, message, name.lower(), args, self.prefix)
        result = command(ctx)
        if asyncio.iscoroutine(result):
            await result

    def run(self) -> None:
        self.client.run()

    async def start(self) -> None:
        await self.client.start()

    async def close(self) -> None:
        await self.client.close()

    async def wait_until_ready(self) -> None:
        await self.client.wait_until_ready()

    @property
    def user(self) -> User | None:
        return self.client.user

    @property
    def http(self) -> HTTPClient:
        return self.client.http


# ----------------------------------------------------------------- client
class Client:
    def __init__(
        self,
        token: str | None = None,
        *,
        api_url: str = DEFAULT_API_URL,
        ws_url: str | None = None,
        prefix: str = "!",
        session: Any = None,
    ):
        token = token or os.environ.get("NULLCORD_BOT_TOKEN") or os.environ.get("NULLCORD_TOKEN")
        if not token:
            raise ValueError("A NullCord bot token is required")
        self.token = token
        self.prefix = prefix
        self.http = HTTPClient(token, api_url, session=session)
        self.http.client = self
        if ws_url:
            self.http.ws_url = ws_url
        self.user: User | None = None
        self.users: dict[str, User] = {}
        self.channels: dict[str, Channel] = {}
        self.servers: dict[str, Server] = {}
        self.members: dict[tuple[str, str], Member] = {}
        self._listeners: dict[str, list[Callable[..., Any]]] = {}
        self._ready = asyncio.Event()
        self._closing = False
        self._message_cache_data: dict[str, Message] = {}
        self._ws: Any = None
        self._heartbeat_task: asyncio.Task[Any] | None = None
        self.latency = 0.0
        self.app_url = ""

    @property
    def guilds(self) -> dict[str, Server]:
        return self.servers

    @property
    def autumn_url(self) -> str | None:
        return self.http.autumn_url

    @property
    def ws(self) -> Any:
        return self._ws

    async def start(self) -> None:
        await self.http.start()
        await self.http.fetch_node()
        self.app_url = self.http.app_url
        self.user = await self.http.fetch_self()
        self.users[self.user.id] = self.user
        self._closing = False
        ws_url = self.http.ws_url
        if not ws_url:
            raise RuntimeError("The API root did not advertise a WebSocket URL")

        backoff = 1.0
        while not self._closing:
            try:
                await self._connect(ws_url)
                backoff = 1.0
            except asyncio.CancelledError:
                raise
            except Exception as error:
                if self._closing:
                    break
                await self.dispatch("error", error)
                log.warning("gateway disconnected: %s; reconnecting in %.1fs", error, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    def run(self) -> None:
        asyncio.run(self.start())

    async def close(self) -> None:
        self._closing = True
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            await asyncio.gather(self._heartbeat_task, return_exceptions=True)
            self._heartbeat_task = None
        if self._ws is not None:
            await self._ws.close()
            self._ws = None
        await self.http.close()

    async def wait_until_ready(self) -> None:
        await self._ready.wait()

    # ---- gateway
    async def _connect(self, ws_url: str) -> None:
        if aiohttp is None:
            raise RuntimeError("aiohttp is required for the gateway: pip install aiohttp")
        params = {"version": "1", "format": "json", "token": self.token}
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(ws_url, params=params, heartbeat=25) as ws:
                self._ws = ws
                self._heartbeat_task = asyncio.create_task(self._heartbeat(ws))
                try:
                    async for packet in ws:
                        if packet.type == aiohttp.WSMsgType.TEXT:
                            await self._handle_packet(_json.loads(packet.data))
                        elif packet.type in (
                            aiohttp.WSMsgType.CLOSED,
                            aiohttp.WSMsgType.CLOSING,
                            aiohttp.WSMsgType.ERROR,
                        ):
                            break
                finally:
                    if self._heartbeat_task:
                        self._heartbeat_task.cancel()
                        await asyncio.gather(self._heartbeat_task, return_exceptions=True)
                        self._heartbeat_task = None
                    self._ws = None
                    self._ready.clear()

    async def _heartbeat(self, ws: Any) -> None:
        while True:
            await asyncio.sleep(20)
            try:
                await ws.send_json({"type": "Ping", "data": int(time.time())})
            except Exception:
                return

    async def _handle_packet(self, packet: dict[str, Any]) -> None:
        event_type = packet.get("type")
        if event_type == "Bulk":
            for event in packet.get("v", []):
                await self._handle_packet(event)
            return

        if event_type == "Pong":
            data = packet.get("data")
            if isinstance(data, (int, float)):
                self.latency = max(0.0, time.time() - float(data))
            return
        if event_type == "Authenticated":
            await self.dispatch("authenticated")
            return
        if event_type == "Ready":
            self._populate_ready(packet)
            self._ready.set()
            await self.dispatch("ready")
            return
        if event_type == "Error":
            await self.dispatch("error", packet.get("data") or packet)
            return
        if event_type == "Logout":
            self._closing = True
            await self.dispatch("logout")
            return

        await self._dispatch_event(event_type or "", packet)

    def _populate_ready(self, packet: dict[str, Any]) -> None:
        for item in packet.get("users") or []:
            user = User(self, item)
            self.users[user.id] = user
            if self.user is None or user.id == getattr(self.user, "id", None):
                self.user = user
        for item in packet.get("servers") or []:
            server = Server(self, item)
            self.servers[server.id] = server
        for item in packet.get("channels") or []:
            channel = Channel(self, item)
            self.channels[channel.id] = channel
        for item in packet.get("members") or []:
            key = item.get("_id") or {}
            server_id = str(key.get("server") or item.get("server") or "")
            server = self.servers.get(server_id)
            if server:
                member = Member(self, server, item)
                self.members[(member.server_id, member.user_id)] = member

    async def _dispatch_event(self, event_type: str, packet: dict[str, Any]) -> None:
        await self.dispatch("event", event_type, packet)
        name = _EVENT_NAMES.get(event_type)
        if not name:
            return

        if name == "message":
            message = Message(self, packet)
            self._cache_message(message)
            return await self.dispatch(name, message)
        if name == "message_update":
            message_id = packet.get("id")
            before = self._message_cache.get(message_id)
            after = before
            if before is not None and isinstance(packet.get("data"), dict):
                merged = {**before.raw, **packet["data"]}
                for field_name in packet.get("clear") or []:
                    merged.pop(field_name, None)
                after = Message(self, merged)
                self._cache_message(after)
            return await self.dispatch(name, before, after, packet)
        if name == "message_delete":
            message = self._message_cache.pop(packet.get("id"), None)
            return await self.dispatch(name, message, packet)
        if name in ("reaction_add", "reaction_remove"):
            message = self._message_cache.get(packet.get("id"))
            user = self.get_user(packet.get("user_id"))
            return await self.dispatch(name, message, user, packet.get("emoji_id"), packet)
        if name == "member_join":
            server_id = packet.get("id")
            server = self.servers.get(server_id)
            if server:
                member = Member(self, server, packet.get("member") or {})
                self.members[(member.server_id, member.user_id)] = member
                return await self.dispatch(name, member)
            return
        if name == "member_leave":
            server_id = packet.get("id")
            user_id = packet.get("user")
            member = self.members.pop((server_id, user_id), None)
            return await self.dispatch(name, member, user_id, packet.get("reason"))
        if name == "server_create":
            server = Server(self, packet.get("server") or {})
            self.servers[server.id] = server
            for item in packet.get("channels") or []:
                channel = Channel(self, item)
                self.channels[channel.id] = channel
            return await self.dispatch(name, server)
        if name == "server_delete":
            server = self.servers.pop(packet.get("id"), None)
            return await self.dispatch(name, server)
        if name == "channel_create":
            channel = Channel(self, packet)
            self.channels[channel.id] = channel
            return await self.dispatch(name, channel)
        if name == "channel_delete":
            channel = self.channels.pop(packet.get("id"), None)
            return await self.dispatch(name, channel)
        if name == "role_update":
            server = self.servers.get(packet.get("id"))
            return await self.dispatch(name, server, packet.get("role_id"), packet.get("data") or {})
        if name == "role_delete":
            server = self.servers.get(packet.get("id"))
            return await self.dispatch(name, server, packet.get("role_id"))
        return await self.dispatch(name, packet)

    def _cache_message(self, message: Message) -> None:
        self._message_cache[message.id] = message
        if message.user:
            message.user.client = self
            self.users[message.user.id] = message.user

    @property
    def _message_cache(self) -> dict[str, Message]:
        return self._message_cache_data

    # ---- events
    def event(self, func: Callable[..., Any]) -> Callable[..., Any]:
        self.add_listener(func.__name__.removeprefix("on_"), func)
        return func

    def on(self, name: str):
        def decorator(func: Callable[..., Any]):
            self.add_listener(name, func)
            return func

        return decorator

    def add_listener(self, name: str, func: Callable[..., Any]) -> None:
        self._listeners.setdefault(name, []).append(func)

    async def dispatch(self, name: str, *args: Any) -> None:
        for listener in list(self._listeners.get(name, [])):
            try:
                result = listener(*args)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:
                log.exception("event handler %s failed", getattr(listener, "__name__", listener))

    # ---- cache getters
    def get_user(self, user_id: str | None) -> User | None:
        if not user_id:
            return None
        return self.users.get(str(user_id))

    def get_channel(self, channel_id: str | None) -> Channel | None:
        if not channel_id:
            return None
        return self.channels.get(str(channel_id))

    def get_server(self, server_id: str | None) -> Server | None:
        if not server_id:
            return None
        return self.servers.get(str(server_id))

    def get_member(self, server_id: str, user_id: str) -> Member | None:
        return self.members.get((str(server_id), str(user_id)))

    async def fetch_user(self, user_id: str) -> User:
        user = await self.http.fetch_user(user_id)
        self.users[user.id] = user
        return user

    async def fetch_channel(self, channel_id: str) -> Channel:
        channel = await self.http.fetch_channel(channel_id)
        self.channels[channel.id] = channel
        return channel

    async def fetch_server(self, server_id: str) -> Server:
        server = await self.http.fetch_server(server_id)
        self.servers[server.id] = server
        return server

    async def fetch_member(self, server_id: str, user_id: str) -> Member:
        member = await self.http.fetch_member(server_id, user_id)
        self.members[(member.server_id, member.user_id)] = member
        return member

    # ---- gateway actions
    async def send_typing(self, channel_id: str) -> None:
        if self._ws is not None:
            await self._ws.send_json({"type": "BeginTyping", "channel": channel_id})

    async def stop_typing(self, channel_id: str) -> None:
        if self._ws is not None:
            await self._ws.send_json({"type": "EndTyping", "channel": channel_id})

    async def subscribe(self, server_id: str) -> None:
        if self._ws is not None:
            await self._ws.send_json({"type": "Subscribe", "server_id": server_id})




_EVENT_NAMES = {
    "Message": "message",
    "MessageUpdate": "message_update",
    "MessageAppend": "message_append",
    "MessageDelete": "message_delete",
    "MessageReact": "reaction_add",
    "MessageUnreact": "reaction_remove",
    "MessageRemoveReaction": "reaction_clear",
    "BulkMessageDelete": "bulk_message_delete",
    "ServerCreate": "server_create",
    "ServerUpdate": "server_update",
    "ServerDelete": "server_delete",
    "ServerMemberUpdate": "member_update",
    "ServerMemberJoin": "member_join",
    "ServerMemberLeave": "member_leave",
    "ServerRoleUpdate": "role_update",
    "ServerRoleDelete": "role_delete",
    "ServerRoleRanksUpdate": "role_ranks",
    "UserUpdate": "user_update",
    "UserRelationship": "relationship_update",
    "UserSettingsUpdate": "settings_update",
    "UserPlatformWipe": "user_platform_wipe",
    "EmojiCreate": "emoji_create",
    "EmojiUpdate": "emoji_update",
    "EmojiDelete": "emoji_delete",
    "ChannelCreate": "channel_create",
    "ChannelUpdate": "channel_update",
    "ChannelDelete": "channel_delete",
    "ChannelGroupJoin": "group_join",
    "ChannelGroupLeave": "group_leave",
    "ChannelStartTyping": "typing_start",
    "ChannelStopTyping": "typing_stop",
    "ChannelAck": "channel_ack",
    "WebhookCreate": "webhook_create",
    "WebhookUpdate": "webhook_update",
    "WebhookDelete": "webhook_delete",
    "VoiceChannelJoin": "voice_join",
    "VoiceChannelLeave": "voice_leave",
    "VoiceChannelMove": "voice_move",
    "UserVoiceStateUpdate": "voice_state_update",
    "VoiceCallUpdate": "voice_call_update",
}
