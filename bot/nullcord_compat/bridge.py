"""Transport-neutral bridge adapter for NullCord component interactions.

A real NullCord connection can pass its API send/edit functions here.  The
bridge does not open a socket itself, which keeps it usable from Axiom's
existing Discord loop and from tests.

Typical wiring::

    bridge = NullCordComponentBridge(
        send_message=api_send_message,
        edit_message=api_edit_message,
    )

    kwargs = bridge.message_kwargs({"embeds": [embed]}, view)
    message = await api_send_message(channel_id, kwargs)
    bridge.register_view(view, message_id=message["id"], channel_id=channel_id,
                          owner_id=interaction_user_id)

    # When NullCord reports a component interaction:
    await bridge.on_component_event(payload)
"""

from __future__ import annotations

import inspect
from typing import Any, Callable

from .components import ComponentRenderer
from .hook import handle_component_interaction
from .registry import ComponentBinding, ComponentRegistry


class NullCordComponentBridge:
    def __init__(
        self,
        *,
        send_message: Callable[..., Any] | None = None,
        edit_message: Callable[..., Any] | None = None,
        renderer: ComponentRenderer | None = None,
    ) -> None:
        self.renderer = renderer or ComponentRenderer()
        self.registry = ComponentRegistry(self.renderer)
        self._send_message = send_message
        self._edit_message = edit_message

    def render_components(self, view: Any) -> list[dict[str, Any]]:
        return self.renderer.render(view)

    def message_kwargs(self, kwargs: dict[str, Any], view: Any) -> dict[str, Any]:
        kwargs = dict(kwargs)
        kwargs["components"] = self.render_components(view)
        return kwargs

    def register_view(
        self,
        view: Any,
        *,
        message_id: str | None = None,
        channel_id: str | None = None,
        owner_id: str | None = None,
    ) -> dict[str, ComponentBinding]:
        return self.registry.register_view(
            view,
            message_id=message_id,
            channel_id=channel_id,
            owner_id=owner_id,
        )

    async def send_message(self, channel_id: str, payload: dict[str, Any]) -> Any:
        if not callable(self._send_message):
            raise RuntimeError("NullCordComponentBridge has no send_message callback")
        result = self._send_message(channel_id, payload)
        if inspect.isawaitable(result):
            result = await result
        return result

    async def edit_message(self, channel_id: str, message_id: str, payload: dict[str, Any]) -> Any:
        if not callable(self._edit_message):
            raise RuntimeError("NullCordComponentBridge has no edit_message callback")
        result = self._edit_message(channel_id, message_id, payload)
        if inspect.isawaitable(result):
            result = await result
        return result

    async def on_component_event(self, payload: dict[str, Any]) -> Any:
        return await handle_component_interaction(
            payload,
            self,
            registry=self.registry,
        )


__all__ = ["NullCordComponentBridge"]
