"""Render discord.ui Select/Button children as NullCord components.

The payload is deliberately plain JSON.  NullCord can store/forward it as-is
and the compatibility bridge can use the same payload for message edits.

Example::

    {
      "components": [
        {
          "type": "select",
          "custom_id": "axhelp:select",
          "placeholder": "Browse a category...",
          "min_values": 1,
          "max_values": 1,
          "disabled": false,
          "row": 0,
          "options": [
            {"label": "General", "value": "general", "emoji": "1"}
          ]
        },
        {
          "type": "button",
          "custom_id": "axhelp:home",
          "label": "Home",
          "style": "primary",
          "emoji": "🏠",
          "disabled": false,
          "row": 1
        }
      ]
    }
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Iterator


def _name(value: Any) -> str:
    """Return a stable string for an enum, emoji, or primitive."""
    if value is None:
        return ""
    name = getattr(value, "name", None)
    if isinstance(name, str) and name:
        return name
    text = str(value)
    # discord.py enum reprs are useful but noisy: ButtonStyle.primary.
    if "." in text:
        text = text.rsplit(".", 1)[-1]
    return text


def _emoji(value: Any) -> str | None:
    if value is None:
        return None
    name = getattr(value, "name", None)
    if isinstance(name, str) and name:
        return name
    return str(value)


def _as_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_bool(value: Any, default: bool = False) -> bool:
    return bool(default if value is None else value)


def _item_kind(item: Any) -> str | None:
    """Classify by behavior first, then by discord.py class name."""
    if hasattr(item, "options") or "select" in type(item).__name__.lower():
        return "select"
    if hasattr(item, "style") or "button" in type(item).__name__.lower():
        return "button"
    return None


def _custom_id(view: Any, item: Any, kind: str, index: int) -> str:
    existing = getattr(item, "custom_id", None)
    if isinstance(existing, str) and existing.strip():
        return existing

    # discord.py normally generates custom IDs, but fake/test items may not.
    # Keep the generated ID on the item so repeated renders stay stable.
    generated = getattr(item, "_nullcord_custom_id", None)
    if isinstance(generated, str) and generated:
        return generated

    view_name = type(view).__name__.lower() or "view"
    generated = f"nc:{view_name}:{id(view):x}:{kind}:{index}"
    try:
        setattr(item, "_nullcord_custom_id", generated)
    except Exception:
        pass
    return generated


def _option_payload(option: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "label": str(getattr(option, "label", "") or ""),
        "value": str(getattr(option, "value", "") or ""),
    }
    description = getattr(option, "description", None)
    if description:
        payload["description"] = str(description)
    emoji = _emoji(getattr(option, "emoji", None))
    if emoji:
        payload["emoji"] = emoji
    if getattr(option, "default", False):
        payload["default"] = True
    return payload


@dataclass
class NullCordComponent:
    """A single rendered select or button."""

    type: str
    custom_id: str
    row: int = 0
    label: str | None = None
    style: str | None = None
    emoji: str | None = None
    disabled: bool = False
    url: str | None = None
    placeholder: str | None = None
    min_values: int | None = None
    max_values: int | None = None
    options: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "type": self.type,
            "custom_id": self.custom_id,
            "row": self.row,
            "disabled": self.disabled,
        }
        if self.type == "select":
            if self.placeholder is not None:
                payload["placeholder"] = self.placeholder
            if self.min_values is not None:
                payload["min_values"] = self.min_values
            if self.max_values is not None:
                payload["max_values"] = self.max_values
            payload["options"] = list(self.options)
        else:
            if self.label is not None:
                payload["label"] = self.label
            if self.style is not None:
                payload["style"] = self.style
            if self.emoji:
                payload["emoji"] = self.emoji
            if self.url:
                payload["url"] = self.url
        return payload


class ComponentRenderer:
    """Turn the children of a discord.ui.View into NullCord components."""

    def iter_components(self, view: Any) -> Iterator[tuple[dict[str, Any], Any]]:
        """Yield ``(component_payload, original_item)`` pairs."""
        children: Iterable[Any] = list(getattr(view, "children", []) or [])
        for index, item in enumerate(children):
            if item is None:
                continue
            kind = _item_kind(item)
            if kind is None:
                continue

            custom_id = _custom_id(view, item, kind, index)
            raw_row = getattr(item, "row", None)
            row = _as_int(raw_row, 0 if kind == "select" else 1)

            if kind == "select":
                options = [
                    _option_payload(option)
                    for option in list(getattr(item, "options", []) or [])[:25]
                ]
                component = NullCordComponent(
                    type="select",
                    custom_id=custom_id,
                    row=row,
                    placeholder=getattr(item, "placeholder", None),
                    min_values=_as_int(getattr(item, "min_values", None), 1),
                    max_values=_as_int(getattr(item, "max_values", None), 1),
                    disabled=_as_bool(getattr(item, "disabled", False)),
                    options=options,
                )
            else:
                component = NullCordComponent(
                    type="button",
                    custom_id=custom_id,
                    row=row,
                    label=str(getattr(item, "label", "") or ""),
                    style=_name(getattr(item, "style", "secondary")) or "secondary",
                    emoji=_emoji(getattr(item, "emoji", None)),
                    disabled=_as_bool(getattr(item, "disabled", False)),
                    url=getattr(item, "url", None),
                )

            payload = component.to_dict()
            yield payload, item

    def render(self, view: Any) -> list[dict[str, Any]]:
        """Return a flat list of NullCord components for a view."""
        return [payload for payload, _item in self.iter_components(view)]

    def render_message(self, view: Any) -> dict[str, Any]:
        """Return the ``components`` field expected by message send/edit."""
        return {"components": self.render(view)}

    def binding_map(self, view: Any) -> dict[str, tuple[dict[str, Any], Any]]:
        """Return ``custom_id -> (component, item)`` for the current render."""
        return {payload["custom_id"]: (payload, item) for payload, item in self.iter_components(view)}


__all__ = ["ComponentRenderer", "NullCordComponent"]
