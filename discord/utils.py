"""Small discord.utils-compatible helpers."""
from __future__ import annotations

from typing import Any

from nullcord import _ulid_time


def get(iterable: Any, **attrs: Any) -> Any:
    for item in iterable or []:
        if all(getattr(item, key, None) == value for key, value in attrs.items()):
            return item
    return None


def find(predicate: Any, iterable: Any) -> Any:
    for item in iterable or []:
        if predicate(item):
            return item
    return None


def snowflake_time(value: Any) -> Any:
    return _ulid_time(str(value))


def escape_markdown(text: str, *, as_needed: bool = False, ignore_links: bool = True) -> str:
    return str(text).replace("\\", "\\\\").replace("*", "\\*").replace("_", "\\_")


def format_dt(dt: Any, style: str = "f") -> str:
    return f"<t:{int(dt.timestamp())}:{style}>" if hasattr(dt, "timestamp") else str(dt)


__all__ = ["escape_markdown", "find", "format_dt", "get", "snowflake_time"]
