"""Drop-in ``discord`` facade for NullCord.

Importing this package in a NullCord bot routes the familiar discord.py names
to the NullCord SDK. It intentionally does not import the real discord.py.
"""
from __future__ import annotations

import enum
import types
from dataclasses import dataclass, field
from typing import Any, Optional

import nullcord as _nc
from nullcord import *  # noqa: F401,F403

__version__ = "2.7.1-nullcord"

# Explicit re-exports (import * above is convenient but we want aliases).
from nullcord import (  # noqa: E402,F401
    Button,
    ButtonStyle,
    Channel,
    Client,
    Colour,
    Color,
    Embed,
    Emoji,
    File,
    HTTPClient,
    HTTPException,
    Interaction,
    InteractionData,
    InteractionType,
    Member,
    Message,
    Modal,
    Role,
    Select,
    SelectOption,
    Server,
    Status,
    TextInput,
    TextStyle,
    User,
    View,
    Bot as SimpleBot,
    Forbidden,
    NotFound,
    Unauthorized,
    RateLimited,
    BotBlocked,
)

class Client(_nc.Client):
    def __init__(self, token: str | None = None, *, intents: Any = None, **kwargs: Any) -> None:
        self.intents = intents
        super().__init__(token, **kwargs)


AutoShardedClient = Client

Guild = Server
TextChannel = Channel
DMChannel = Channel
GroupChannel = Channel
CategoryChannel = Channel
VoiceChannel = Channel
StageChannel = Channel
Thread = Channel
ForumChannel = Channel
Messageable = Channel
abc = types.ModuleType("discord.abc")
abc.GuildChannel = Channel
abc.Messageable = Channel


class DiscordException(Exception):
    pass


class LoginFailure(DiscordException):
    pass


Attachment = File
DiscordException = DiscordException
LoginFailure = LoginFailure


class Intents:
    """Minimal Intents object; NullCord gateway sends all compatible events."""

    def __init__(self, **kwargs: Any) -> None:
        self._values = dict(kwargs)
        for key, value in kwargs.items():
            setattr(self, key, value)

    @classmethod
    def default(cls) -> "Intents":
        return cls()

    @classmethod
    def all(cls) -> "Intents":
        return cls()

    @classmethod
    def none(cls) -> "Intents":
        return cls()


@dataclass(frozen=True)
class Object:
    id: str | int

    def __post_init__(self) -> None:
        # NullCord IDs are ULIDs. Never coerce them to int.
        object.__setattr__(self, "id", str(self.id))


class Status(enum.IntEnum):
    online = 1
    idle = 2
    dnd = 3
    offline = 4
    invisible = 5


class ActivityType(enum.IntEnum):
    playing = 0
    streaming = 1
    listening = 2
    watching = 3
    custom = 4
    competing = 5


@dataclass
class Activity:
    name: str = ""
    type: ActivityType = ActivityType.playing
    url: Optional[str] = None


Game = Activity


@dataclass
class AllowedMentions:
    everyone: bool = False
    users: bool = False
    roles: bool = False
    replied_user: bool = False


class Permissions:
    """Small bitfield-compatible permission object."""

    def __init__(self, permissions: int = 0, **flags: Any) -> None:
        self.value = int(permissions)
        for key, enabled in flags.items():
            if enabled:
                self.value |= 1 << (abs(hash(key)) % 60)

    def __getattr__(self, name: str) -> bool:
        if name.startswith("_"):
            raise AttributeError(name)
        return False

    def __int__(self) -> int:
        return self.value

    def __or__(self, other: "Permissions") -> "Permissions":
        return Permissions(int(self) | int(other))

    def __and__(self, other: "Permissions") -> "Permissions":
        return Permissions(int(self) & int(other))

    def __repr__(self) -> str:
        return f"<Permissions value={self.value}>"


class PermissionOverwrite:
    def __init__(self, **kwargs: Any) -> None:
        self.allow = Permissions()
        self.deny = Permissions()
        for key, value in kwargs.items():
            if value is True:
                self.allow = self.allow | Permissions(**{key: True})
            elif value is False:
                self.deny = self.deny | Permissions(**{key: True})

    def to_dict(self) -> dict[str, int]:
        return {"allow": int(self.allow), "deny": int(self.deny)}


class ChannelType(enum.IntEnum):
    text = 0
    voice = 2
    category = 4
    news = 5
    store = 6
    stage = 13
    forum = 15


class AuditLogAction(enum.IntEnum):
    kick = 20
    member_ban_add = 22
    member_ban_remove = 23
    member_update = 24
    member_role_update = 25
    member_move = 26
    member_disconnect = 27
    bot_add = 28
    role_create = 30
    role_update = 31
    role_delete = 32
    channel_create = 10
    channel_update = 11
    channel_delete = 12
    message_delete = 72
    message_bulk_delete = 73
    message_pin = 74
    message_unpin = 75


class FFmpegPCMAudio:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        raise NotImplementedError("NullCord voice audio is not implemented by this SDK")


class PCMVolumeTransformer:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        raise NotImplementedError("NullCord voice audio is not implemented by this SDK")


def __getattr__(name: str) -> Any:
    if name in {"AutoShardedClient", "AutoShardedBot"}:
        return Client
    if name in {"Thread", "PartialMessageable"}:
        return Channel
    raise AttributeError(name)


from . import ui as ui  # noqa: E402
from . import ext as ext  # noqa: E402
from . import app_commands as app_commands  # noqa: E402
from . import utils as utils  # noqa: E402

try:
    from .ext.commands import Bot as Bot  # noqa: E402
except Exception:  # pragma: no cover - keep import safe during partial installs
    Bot = SimpleBot  # type: ignore[assignment]

AutoShardedBot = Bot

Object.__module__ = __name__
