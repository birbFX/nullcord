"""Constructible discord.Interaction shim for NullCord component events.

Axiom's views only use a small part of discord.py's interaction object:

* ``interaction.type``
* ``interaction.response.edit_message(...)``
* ``interaction.edit_original_response(...)``
* ``interaction.message``
* ``interaction.user``
* ``interaction.data``

The classes below implement that surface without requiring a real Discord
gateway.  If discord.py is installed, ``type`` uses the real
``discord.InteractionType.component`` value; otherwise it falls back to 2.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

try:  # pragma: no cover - exercised in production where discord.py exists
    import discord as _discord
except ImportError:  # pragma: no cover
    _discord = None

from .components import ComponentRenderer


INTERACTION_TYPE_COMPONENT = getattr(
    getattr(_discord, "InteractionType", None),
    "component",
    2,
)


def _value(value: Any, default: Any = None) -> Any:
    return default if value is None else value


def _embed_to_dict(embed: Any) -> Any:
    if embed is None:
        return None
    to_dict = getattr(embed, "to_dict", None)
    if callable(to_dict):
        try:
            return to_dict()
        except Exception:
            pass
    return embed


def _embeds_to_list(embeds: Any) -> list[Any]:
    if embeds is None:
        return []
    return [_embed_to_dict(embed) for embed in embeds]


@dataclass
class InteractionUser:
    id: str
    username: str = ""
    discriminator: str = "0"
    display_name: str | None = None
    avatar: Any = None
    bot: bool = False
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def mention(self) -> str:
        return f"<@{self.id}>"

    @property
    def global_name(self) -> str | None:
        return self.display_name

    @classmethod
    def from_payload(cls, data: dict[str, Any] | None) -> "InteractionUser":
        data = data or {}
        user_id = str(data.get("id") or data.get("user_id") or "")
        return cls(
            id=user_id,
            username=str(data.get("username") or ""),
            discriminator=str(data.get("discriminator") or "0"),
            display_name=data.get("display_name") or data.get("global_name"),
            avatar=data.get("avatar"),
            bot=bool(data.get("bot")),
            raw=dict(data),
        )


@dataclass
class InteractionMessage:
    id: str
    channel_id: str = ""
    content: str | None = None
    embeds: list[Any] = field(default_factory=list)
    components: list[Any] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def channel(self) -> Any:
        return _ChannelRef(self.channel_id)

    @property
    def guild_id(self) -> str | None:
        return self.raw.get("guild_id")

    @classmethod
    def from_payload(cls, data: dict[str, Any] | None) -> "InteractionMessage":
        data = data or {}
        return cls(
            id=str(data.get("id") or data.get("message_id") or ""),
            channel_id=str(
                data.get("channel_id")
                or (data.get("channel") or {}).get("id")
                or ""
            ),
            content=data.get("content"),
            embeds=list(data.get("embeds") or []),
            components=list(data.get("components") or []),
            raw=dict(data),
        )


@dataclass
class InteractionData:
    custom_id: str
    component_type: int | None = None
    values: list[str] = field(default_factory=list)
    resolved: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_payload(cls, data: dict[str, Any] | None) -> "InteractionData":
        data = data or {}
        return cls(
            custom_id=str(data.get("custom_id") or ""),
            component_type=data.get("component_type"),
            values=[str(value) for value in (data.get("values") or [])],
            resolved=dict(data.get("resolved") or {}),
            raw=dict(data),
        )


@dataclass
class _ChannelRef:
    id: str

    @property
    def mention(self) -> str:
        return f"<#{self.id}>"


class InteractionResponse:
    """Mirror of the parts of discord.InteractionResponse that views use."""

    def __init__(self, interaction: "NullCordInteraction") -> None:
        self.interaction = interaction
        self._responded = False

    async def edit_message(self, **kwargs: Any) -> Any:
        self._responded = True
        return await self.interaction._edit_message(**kwargs)

    async def send_message(self, **kwargs: Any) -> Any:
        self._responded = True
        return await self.interaction._send_message(**kwargs)

    async def defer(self, *args: Any, **kwargs: Any) -> None:
        self._responded = True

    @property
    def is_done(self) -> bool:
        return self._responded


if _discord is not None:
    _InteractionBase = _discord.Interaction
else:
    _InteractionBase = object


class NullCordInteraction(_InteractionBase):
    """Small, constructible stand-in for ``discord.Interaction``.

    When discord.py is installed this is a real ``discord.Interaction``
    subclass, so existing ``isinstance`` checks keep working.  The Discord
    gateway is never involved; all state is populated from the NullCord event.
    """

    def __init__(
        self,
        *,
        bridge: Any,
        data: dict[str, Any],
        message: dict[str, Any] | InteractionMessage | None = None,
        user: dict[str, Any] | InteractionUser | None = None,
        renderer: ComponentRenderer | None = None,
    ) -> None:
        self.bridge = bridge
        self.id = str(data.get("id") or "")
        self.application_id = str(data.get("application_id") or "")
        self.type = INTERACTION_TYPE_COMPONENT
        self.data = InteractionData.from_payload(data.get("data") or data)
        self.message = (
            message
            if isinstance(message, InteractionMessage)
            else InteractionMessage.from_payload(message or data.get("message"))
        )
        self.user = (
            user
            if isinstance(user, InteractionUser)
            else InteractionUser.from_payload(user or data.get("user") or data.get("member", {}).get("user"))
        )
        self.guild_id = self.message.guild_id or data.get("guild_id")
        self.channel = self.message.channel
        self.response = InteractionResponse(self)
        if _discord is None:
            self.channel_id = self.message.channel_id
            self.guild = _GuildRef(self.guild_id) if self.guild_id else None
        self.renderer = renderer or ComponentRenderer()
        self.raw = dict(data)

    @classmethod
    def from_payload(
        cls,
        payload: dict[str, Any],
        *,
        bridge: Any,
        renderer: ComponentRenderer | None = None,
    ) -> "NullCordInteraction":
        return cls(bridge=bridge, data=payload, renderer=renderer)

    async def _render_view(self, view: Any) -> list[dict[str, Any]]:
        if view is None:
            return []
        renderer = getattr(self.bridge, "render_components", None)
        if callable(renderer):
            return renderer(view)
        return self.renderer.render(view)

    async def _edit_message(self, **kwargs: Any) -> Any:
        view = kwargs.pop("view", None)
        embed = kwargs.pop("embed", None)
        embeds = kwargs.pop("embeds", None)

        payload: dict[str, Any] = {}
        if "content" in kwargs:
            payload["content"] = kwargs.pop("content")
        if embed is not None:
            payload["embeds"] = [_embed_to_dict(embed)]
        elif embeds is not None:
            payload["embeds"] = _embeds_to_list(embeds)
        if view is not None:
            payload["components"] = await self._render_view(view)
        elif "components" in kwargs:
            payload["components"] = kwargs.pop("components")

        # Forward any remaining simple fields so the bridge can use them.
        payload.update(kwargs)

        edit = getattr(self.bridge, "edit_message", None)
        if not callable(edit):
            raise RuntimeError("NullCord bridge does not implement edit_message")

        result = edit(
            self.message.channel_id,
            self.message.id,
            payload,
        )
        if hasattr(result, "__await__"):
            result = await result
        return result

    async def _send_message(self, **kwargs: Any) -> Any:
        view = kwargs.pop("view", None)
        payload: dict[str, Any] = dict(kwargs)
        if view is not None:
            payload["components"] = await self._render_view(view)

        send = getattr(self.bridge, "send_message", None)
        if not callable(send):
            raise RuntimeError("NullCord bridge does not implement send_message")

        result = send(self.message.channel_id, payload)
        if hasattr(result, "__await__"):
            result = await result
        return result

    async def edit_original_response(self, **kwargs: Any) -> Any:
        return await self._edit_message(**kwargs)

    async def followup_send(self, **kwargs: Any) -> Any:
        return await self._send_message(**kwargs)


class _GuildRef:
    def __init__(self, guild_id: str) -> None:
        self.id = guild_id


__all__ = [
    "INTERACTION_TYPE_COMPONENT",
    "InteractionData",
    "InteractionMessage",
    "InteractionResponse",
    "InteractionUser",
    "NullCordInteraction",
]
