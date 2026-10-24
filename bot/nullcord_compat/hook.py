"""Hook helpers for the NullCord component bridge.

The bridge should call :func:`hook_message_kwargs` when sending/editing a
message that has a discord.ui.View, then call
:func:`handle_component_interaction` for every incoming component event.

No transport is assumed here.  A payload looks like::

    {
      "id": "interaction-id",
      "type": 2,
      "data": {
        "custom_id": "axhelp:select",
        "values": ["general"]
      },
      "message": {
        "id": "message-id",
        "channel_id": "channel-id"
      },
      "user": {
        "id": "user-id",
        "username": "birb"
      }
    }
"""

from __future__ import annotations

import inspect
from typing import Any

from .interaction import NullCordInteraction
from .registry import ComponentBinding, ComponentRegistry
from .components import ComponentRenderer

_renderer = ComponentRenderer()
_registry = ComponentRegistry(_renderer)


def get_registry() -> ComponentRegistry:
    return _registry


def render_components(view: Any) -> list[dict[str, Any]]:
    return _renderer.render(view)


def register_view(
    view: Any,
    *,
    message_id: str | None = None,
    channel_id: str | None = None,
    owner_id: str | None = None,
) -> dict[str, ComponentBinding]:
    """Register a live AxHelpView (or any discord.ui.View) for callbacks."""
    return _registry.register_view(
        view,
        message_id=message_id,
        channel_id=channel_id,
        owner_id=owner_id,
    )


def hook_message_kwargs(kwargs: dict[str, Any], view: Any) -> dict[str, Any]:
    """Add rendered NullCord components to a message send/edit payload."""
    if view is None:
        return kwargs
    kwargs = dict(kwargs)
    kwargs["components"] = render_components(view)
    return kwargs


def _custom_id_from_payload(payload: dict[str, Any]) -> str:
    data = payload.get("data")
    if isinstance(data, dict):
        custom_id = data.get("custom_id")
        if custom_id:
            return str(custom_id)
    return str(payload.get("custom_id") or "")


def _values_from_payload(payload: dict[str, Any]) -> list[str]:
    data = payload.get("data")
    if isinstance(data, dict):
        return [str(value) for value in (data.get("values") or [])]
    return [str(value) for value in (payload.get("values") or [])]


def _apply_values(binding: ComponentBinding, values: list[str]) -> None:
    if binding.kind != "select":
        return
    try:
        binding.item.values = list(values)
    except Exception:
        try:
            setattr(binding.item, "_values", list(values))
        except Exception:
            pass


async def _invoke_callback(binding: ComponentBinding, interaction: NullCordInteraction) -> Any:
    callback = getattr(binding.item, "callback", None)
    if not callable(callback):
        return None
    result = callback(interaction)
    if inspect.isawaitable(result):
        return await result
    return result


async def handle_component_interaction(
    payload: dict[str, Any],
    bridge: Any,
    *,
    registry: ComponentRegistry | None = None,
) -> NullCordInteraction | None:
    """Resolve an incoming component event and invoke its live callback.

    Returns the constructed interaction shim, or ``None`` if the custom ID is
    no longer registered (for example after the message was deleted).
    """
    registry = registry or _registry
    custom_id = _custom_id_from_payload(payload)
    if not custom_id:
        return None

    binding = registry.resolve(custom_id)
    if binding is None:
        return None

    interaction = NullCordInteraction.from_payload(
        payload,
        bridge=bridge,
        renderer=registry.renderer,
    )
    _apply_values(binding, _values_from_payload(payload))

    owner_id = binding.owner_id
    if owner_id and interaction.user.id and interaction.user.id != owner_id:
        return interaction

    await _invoke_callback(binding, interaction)
    return interaction


__all__ = [
    "get_registry",
    "handle_component_interaction",
    "hook_message_kwargs",
    "register_view",
    "render_components",
]
