"""NullCord <-> discord.py compatibility helpers.

This package is intentionally independent of the Axiom source file.  It
converts discord.ui components into a small, stable NullCord component
payload and converts incoming component interaction payloads back into an
object that behaves like ``discord.Interaction`` for existing views.

The transport (WebSocket, HTTP callback, or another bridge) is responsible
for delivering payloads to :func:`nullcord_compat.hook.handle_component_interaction`.
"""

from .components import ComponentRenderer, NullCordComponent
from .bridge import NullCordComponentBridge
from .interaction import NullCordInteraction
from .registry import ComponentBinding, ComponentRegistry
from .hook import (
    get_registry,
    handle_component_interaction,
    hook_message_kwargs,
    register_view,
    render_components,
)

__all__ = [
    "ComponentRenderer",
    "NullCordComponentBridge",
    "NullCordComponent",
    "NullCordInteraction",
    "ComponentBinding",
    "ComponentRegistry",
    "get_registry",
    "handle_component_interaction",
    "hook_message_kwargs",
    "register_view",
    "render_components",
]
