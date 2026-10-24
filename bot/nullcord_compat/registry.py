"""Live custom_id -> view/item registry for component interactions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .components import ComponentRenderer


@dataclass
class ComponentBinding:
    custom_id: str
    view: Any
    item: Any
    kind: str
    message_id: str | None = None
    channel_id: str | None = None
    owner_id: str | None = None
    payload: dict[str, Any] | None = None


class ComponentRegistry:
    """Keeps the live discord.ui.View behind every custom ID.

    A view can be rendered more than once.  ``register_view`` replaces the
    previous binding for the same custom ID; this is what keeps Home/Prev/Next
    callbacks pointed at the live AxHelpView instance.
    """

    def __init__(self, renderer: ComponentRenderer | None = None) -> None:
        self.renderer = renderer or ComponentRenderer()
        self._bindings: dict[str, ComponentBinding] = {}
        self._message_ids: dict[str, set[str]] = {}

    def register_view(
        self,
        view: Any,
        *,
        message_id: str | None = None,
        channel_id: str | None = None,
        owner_id: str | None = None,
    ) -> dict[str, ComponentBinding]:
        bindings: dict[str, ComponentBinding] = {}
        for payload, item in self.renderer.iter_components(view):
            custom_id = payload["custom_id"]
            binding = ComponentBinding(
                custom_id=custom_id,
                view=view,
                item=item,
                kind=payload["type"],
                message_id=message_id,
                channel_id=channel_id,
                owner_id=owner_id,
                payload=payload,
            )
            self._bindings[custom_id] = binding
            bindings[custom_id] = binding
            if message_id:
                self._message_ids.setdefault(message_id, set()).add(custom_id)
        return bindings

    def resolve(self, custom_id: str) -> ComponentBinding | None:
        return self._bindings.get(custom_id)

    def unregister_custom_id(self, custom_id: str) -> None:
        self._bindings.pop(custom_id, None)
        for ids in self._message_ids.values():
            ids.discard(custom_id)

    def unregister_message(self, message_id: str) -> None:
        for custom_id in self._message_ids.pop(message_id, set()):
            self._bindings.pop(custom_id, None)

    def clear(self) -> None:
        self._bindings.clear()
        self._message_ids.clear()

    def __len__(self) -> int:
        return len(self._bindings)


__all__ = ["ComponentBinding", "ComponentRegistry"]
