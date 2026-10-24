"""Compatibility import surface checked by the generated Axiom hook.

The real discord.py package remains importable at the top level.  This
submodule only exposes the NullCord shim objects for bridge code that imports
``nullcord_compat.discord`` explicitly.
"""

from __future__ import annotations

try:  # Re-export the real discord.py surface when available.
    from discord import *  # type: ignore[import-not-found]  # noqa: F401,F403
except ImportError:  # pragma: no cover
    pass

from ..interaction import (  # noqa: F401
    INTERACTION_TYPE_COMPONENT,
    InteractionData,
    InteractionMessage,
    InteractionResponse,
    InteractionUser,
    NullCordInteraction,
)

__all__ = [
    "INTERACTION_TYPE_COMPONENT",
    "InteractionData",
    "InteractionMessage",
    "InteractionResponse",
    "InteractionUser",
    "NullCordInteraction",
]
