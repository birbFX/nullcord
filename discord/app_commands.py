"""Import-safe app_commands shim.

NullCord does not expose Discord slash-command registration. The decorators
preserve the original callable and register nothing, so Axiom's module can
import and run its prefix commands without pretending slash commands exist.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Iterable, Optional


def _identity_decorator(*args: Any, **kwargs: Any):
    def decorator(func: Any) -> Any:
        return func

    if len(args) == 1 and callable(args[0]) and not kwargs:
        return args[0]
    return decorator


def command(*args: Any, **kwargs: Any):
    return _identity_decorator(*args, **kwargs)


def describe(**kwargs: Any):
    return _identity_decorator()


def default_permissions(**kwargs: Any):
    return _identity_decorator()


def guild_only():
    return _identity_decorator()


def dm_only():
    return _identity_decorator()


def autocomplete(**kwargs: Any):
    return _identity_decorator()


def check(predicate: Any):
    return _identity_decorator()


def cooldown(*args: Any, **kwargs: Any):
    return _identity_decorator()


def rename(**kwargs: Any):
    return _identity_decorator()


def choices(**kwargs: Any):
    return _identity_decorator()


@dataclass
class Choice:
    name: str
    value: Any


@dataclass
class Range:
    min: Any = None
    max: Any = None


@dataclass
class Namespace:
    values: dict[str, Any]

    def __getattr__(self, name: str) -> Any:
        try:
            return self.values[name]
        except KeyError as error:
            raise AttributeError(name) from error


class Group:
    def __init__(self, *, name: str, description: str = "", **kwargs: Any) -> None:
        self.name = name
        self.description = description
        self.commands: dict[str, Any] = {}

    def command(self, *args: Any, **kwargs: Any):
        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            name = kwargs.get("name") or func.__name__
            self.commands[name] = func
            return func

        return decorator

    def add_command(self, command: Any) -> None:
        self.commands[getattr(command, "name", str(command))] = command


class CommandTree:
    def __init__(self, client: Any = None) -> None:
        self.client = client
        self.commands: dict[str, Any] = {}

    def command(self, *args: Any, **kwargs: Any):
        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            name = kwargs.get("name") or func.__name__
            self.commands[name] = func
            return func

        return decorator

    def add_command(self, command: Any, /, **kwargs: Any) -> None:
        self.commands[getattr(command, "name", str(command))] = command

    async def sync(self, *args: Any, **kwargs: Any) -> list[Any]:
        return []

    async def fetch_commands(self, *args: Any, **kwargs: Any) -> list[Any]:
        return []


__all__ = [
    "Choice",
    "CommandTree",
    "Group",
    "Namespace",
    "Range",
    "autocomplete",
    "check",
    "choices",
    "command",
    "cooldown",
    "default_permissions",
    "describe",
    "dm_only",
    "guild_only",
    "rename",
]
