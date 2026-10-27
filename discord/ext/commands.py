"""discord.ext.commands-compatible layer for NullCord."""
from __future__ import annotations

import asyncio
import inspect
import shlex
import time
import typing
from dataclasses import dataclass
from typing import Any, Callable, Iterable, Optional, Sequence

import nullcord as nc
from nullcord import Client, Embed


# ------------------------------------------------------------------ errors
class CommandError(Exception):
    pass


class CommandNotFound(CommandError):
    pass


class CheckFailure(CommandError):
    pass


class MissingPermissions(CheckFailure):
    def __init__(self, missing_permissions: Sequence[str] | None = None, *args: Any):
        self.missing_permissions = list(missing_permissions or [])
        super().__init__(*args or ("Missing permissions",))


class NoPrivateMessage(CheckFailure):
    pass


class MissingRequiredArgument(CommandError):
    def __init__(self, param: Any):
        self.param = param
        super().__init__(f"Missing required argument: {getattr(param, 'name', param)}")


class BadArgument(CommandError):
    pass


class MemberNotFound(BadArgument):
    pass


class UserNotFound(BadArgument):
    pass


class RoleNotFound(BadArgument):
    pass


class ChannelNotFound(BadArgument):
    pass


class CommandOnCooldown(CommandError):
    def __init__(self, retry_after: float):
        self.retry_after = retry_after
        super().__init__(f"Command on cooldown; retry in {retry_after:.2f}s")


class CommandInvokeError(CommandError):
    def __init__(self, original: Exception):
        self.original = original
        super().__init__(str(original))


# --------------------------------------------------------------- converters
class Converter:
    async def convert(self, ctx: "Context", argument: str) -> Any:
        return argument


class MemberConverter(Converter):
    async def convert(self, ctx: "Context", argument: str) -> nc.Member:
        if ctx.guild is None:
            raise MemberNotFound("No guild context")
        raw = argument.strip()
        if raw.startswith("<@") and raw.endswith(">"):
            raw = raw[2:-1].lstrip("!")
        member = ctx.guild.get_member(raw) or ctx.client.get_member(ctx.guild.id, raw)
        if member is None and raw:
            try:
                member = await ctx.guild.fetch_member(raw)
            except Exception:
                member = None
        if member is None:
            raise MemberNotFound(argument)
        return member


class UserConverter(Converter):
    async def convert(self, ctx: "Context", argument: str) -> nc.User:
        raw = argument.strip()
        if raw.startswith("<@") and raw.endswith(">"):
            raw = raw[2:-1].lstrip("!")
        user = ctx.client.get_user(raw)
        if user is None:
            try:
                user = await ctx.client.fetch_user(raw)
            except Exception:
                user = None
        if user is None:
            raise UserNotFound(argument)
        return user


class RoleConverter(Converter):
    async def convert(self, ctx: "Context", argument: str) -> nc.Role:
        if ctx.guild is None:
            raise RoleNotFound("No guild context")
        raw = argument.strip()
        if raw.startswith("<@&") and raw.endswith(">"):
            raw = raw[3:-1]
        for role in ctx.guild.roles.values():
            if role.id == raw or role.name.lower() == raw.lower():
                return role
        raise RoleNotFound(argument)


class ChannelConverter(Converter):
    async def convert(self, ctx: "Context", argument: str) -> nc.Channel:
        raw = argument.strip()
        if raw.startswith("<#") and raw.endswith(">"):
            raw = raw[2:-1]
        channel = ctx.client.get_channel(raw)
        if channel is None:
            for candidate in ctx.client.channels.values():
                if candidate.name and candidate.name.lower() == raw.lower():
                    channel = candidate
                    break
        if channel is None:
            raise ChannelNotFound(argument)
        return channel


class TextChannelConverter(ChannelConverter):
    pass


class GreedyAnnotation:
    def __init__(self, converter: Any) -> None:
        self.converter = converter


class Greedy:
    def __class_getitem__(cls, item: Any) -> GreedyAnnotation:
        return GreedyAnnotation(item)


class OptionalAnnotation:
    def __init__(self, converter: Any) -> None:
        self.converter = converter


class Optional:
    def __class_getitem__(cls, item: Any) -> OptionalAnnotation:
        return OptionalAnnotation(item)


# ---------------------------------------------------------------- checks
def check(predicate: Callable[["Context"], Any]):
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        checks = getattr(func, "__commands_checks__", [])
        checks.append(predicate)
        setattr(func, "__commands_checks__", checks)
        return func

    return decorator


def has_permissions(**permissions: bool):
    def predicate(ctx: "Context") -> bool:
        if ctx.guild is None:
            raise NoPrivateMessage()
        member = ctx.author
        perms = getattr(member, "guild_permissions", None)
        if perms is None:
            return False
        return all(bool(getattr(perms, name, False)) == value for name, value in permissions.items())

    return check(predicate)


def bot_has_permissions(**permissions: bool):
    return check(lambda ctx: True)


def guild_only():
    return check(lambda ctx: ctx.guild is not None)


def dm_only():
    return check(lambda ctx: ctx.guild is None)


def is_owner():
    return check(lambda ctx: getattr(ctx.author, "id", None) == getattr(ctx.guild, "owner_id", None))


def cooldown(rate: int = 1, per: float = 0, type: Any = None):
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        setattr(func, "__commands_cooldown__", (rate, per))
        return func

    return decorator


# ---------------------------------------------------------------- commands
class Command:
    def __init__(
        self,
        func: Callable[..., Any],
        *,
        name: Optional[str] = None,
        aliases: Sequence[str] = (),
        description: Optional[str] = None,
        usage: Optional[str] = None,
        hidden: bool = False,
        parent: Optional["Group"] = None,
        **attrs: Any,
    ) -> None:
        self.callback = func
        self.name = name or func.__name__
        self.aliases = list(aliases)
        self.description = description or inspect.getdoc(func) or ""
        self.usage = usage
        self.hidden = hidden
        self.parent = parent
        self.checks = list(getattr(func, "__commands_checks__", []))
        self.cooldown = getattr(func, "__commands_cooldown__", None)
        self.before_invoke = None
        self.after_invoke = None
        self._cooldowns: dict[Any, list[float]] = {}
        self.__doc__ = func.__doc__
        self.__name__ = getattr(func, "__name__", self.name)
        for key, value in attrs.items():
            setattr(self, key, value)

    @property
    def qualified_name(self) -> str:
        if self.parent:
            return f"{self.parent.qualified_name} {self.name}"
        return self.name

    @property
    def signature(self) -> inspect.Signature:
        return inspect.signature(self.callback)

    async def invoke(self, ctx: "Context") -> Any:
        for handler in ctx.bot._before_invoke + ([self.before_invoke] if self.before_invoke else []):
            if handler:
                result = handler(ctx)
                if asyncio.iscoroutine(result):
                    await result

        self._check_cooldown(ctx)
        try:
            result = self.callback(ctx, *ctx.args, **ctx.kwargs)
            if asyncio.iscoroutine(result):
                result = await result
            return result
        except CommandError:
            raise
        except Exception as error:
            raise CommandInvokeError(error) from error
        finally:
            for handler in ([self.after_invoke] if self.after_invoke else []) + list(reversed(ctx.bot._after_invoke)):
                if handler:
                    result = handler(ctx)
                    if asyncio.iscoroutine(result):
                        await result

    def _check_cooldown(self, ctx: "Context") -> None:
        if not self.cooldown:
            return
        rate, per = self.cooldown
        key = (ctx.guild.id if ctx.guild else None, ctx.author.id, self.qualified_name)
        now = time.monotonic()
        entries = [stamp for stamp in self._cooldowns.get(key, []) if now - stamp < per]
        if len(entries) >= rate:
            raise CommandOnCooldown(per - (now - entries[0]))
        entries.append(now)
        self._cooldowns[key] = entries

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        return self.callback(*args, **kwargs)

    def __repr__(self) -> str:
        return f"<Command {self.qualified_name}>"


class Group(Command):
    def __init__(self, *args: Any, invoke_without_command: bool = False, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.invoke_without_command = invoke_without_command
        self.commands: dict[str, Command] = {}

    def add_command(self, command: Command) -> None:
        command.parent = self
        self.commands[command.name] = command
        for alias in command.aliases:
            self.commands[alias] = command

    def command(self, name: Optional[str] = None, cls: type[Command] = Command, **kwargs: Any):
        def decorator(func: Callable[..., Any]) -> Command:
            cmd = cls(func, name=name, parent=self, **kwargs)
            self.add_command(cmd)
            return cmd

        return decorator

    def group(self, name: Optional[str] = None, **kwargs: Any):
        def decorator(func: Callable[..., Any]) -> "Group":
            group = Group(func, name=name, parent=self, **kwargs)
            self.add_command(group)
            return group

        return decorator

    async def invoke(self, ctx: "Context") -> Any:
        return await super().invoke(ctx)


class Cog:
    def __init__(self, bot: "Bot") -> None:
        self.bot = bot

    def get_commands(self) -> list[Command]:
        return list(getattr(self, "__cog_commands__", []))

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        commands = []
        for value in cls.__dict__.values():
            if isinstance(value, Command):
                commands.append(value)
        cls.__cog_commands__ = commands


class CogMeta(type):
    pass


# ----------------------------------------------------------------- context
class Typing:
    def __init__(self, ctx: "Context") -> None:
        self.ctx = ctx

    async def __aenter__(self) -> "Typing":
        await self.ctx.client.send_typing(self.ctx.channel.id)
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.ctx.client.stop_typing(self.ctx.channel.id)


class Context:
    def __init__(self, bot: "Bot", message: nc.Message, prefix: str, command: Command, invoked_with: str):
        self.bot = bot
        self.client = bot
        self.message = message
        self.prefix = prefix
        self.command = command
        self.invoked_with = invoked_with
        self.invoked_subcommand: Optional[str] = None
        self.channel = message.channel
        self.author = message.author
        self.guild = self.channel.server if self.channel else None
        self.server = self.guild
        if self.guild is not None and self.author is not None:
            self.author = self.guild.get_member(self.author.id) or self.author
        self.args: list[Any] = []
        self.kwargs: dict[str, Any] = {}

    async def send(self, content: str | None = None, **kwargs: Any) -> nc.Message:
        return await self.channel.send(content, **kwargs)

    async def reply(self, content: str | None = None, **kwargs: Any) -> nc.Message:
        return await self.message.reply(content, **kwargs)

    def typing(self) -> Typing:
        return Typing(self)

    @property
    def raw(self) -> str:
        return self.message.content


# --------------------------------------------------------------------- bot
class Bot(Client):
    def __init__(
        self,
        command_prefix: Any = "!",
        *,
        intents: Any = None,
        **kwargs: Any,
    ) -> None:
        kwargs.pop("command_prefix", None)
        for ignored in (
            "case_insensitive", "help_command", "allowed_mentions", "activity",
            "status", "owner_ids", "max_messages", "strip_after_prefix",
            "enable_debug_events", "chunk_guilds_at_startup", "member_cache_flags",
            "http_trace", "proxy", "proxy_auth", "loop", "shard_id", "shard_count",
            "assume_unsync", "reconnect", "fetch_offline_members", "heartbeat_timeout",
        ):
            kwargs.pop(ignored, None)
        super().__init__(**kwargs)
        self.command_prefix = command_prefix
        self.intents = intents
        self.commands: dict[str, Command] = {}
        self.cogs: dict[str, Cog] = {}
        self._checks: list[Callable[["Context"], Any]] = []
        self._before_invoke: list[Callable[["Context"], Any]] = []
        self._after_invoke: list[Callable[["Context"], Any]] = []
        self.tree = _Tree(self)
        self._processed_messages: set[str] = set()
        self.add_listener("message", self._process_message)
        self.add_listener("ready", self._on_ready_internal)

    async def _on_ready_internal(self) -> None:
        return None

    # ---- registration
    def command(self, name: Optional[str] = None, cls: type[Command] = Command, **kwargs: Any):
        def decorator(func: Callable[..., Any]) -> Command:
            cmd = cls(func, name=name, **kwargs)
            self.add_command(cmd)
            return cmd

        return decorator

    def group(self, name: Optional[str] = None, **kwargs: Any):
        def decorator(func: Callable[..., Any]) -> Group:
            group = Group(func, name=name, invoke_without_command=kwargs.pop("invoke_without_command", False), **kwargs)
            self.add_command(group)
            return group

        return decorator

    def hybrid_command(self, name: Optional[str] = None, **kwargs: Any):
        return self.command(name=name, **kwargs)

    def add_command(self, command: Command) -> None:
        self.commands[command.name] = command
        for alias in command.aliases:
            self.commands[alias] = command

    def remove_command(self, name: str) -> Optional[Command]:
        command = self.commands.pop(name, None)
        if command:
            for alias in list(command.aliases):
                self.commands.pop(alias, None)
        return command

    def get_command(self, name: str) -> Optional[Command]:
        command = self.commands.get(name)
        if command:
            return command
        for candidate in set(self.commands.values()):
            if isinstance(candidate, Group) and name in candidate.commands:
                return candidate.commands[name]
        return None

    @property
    def all_commands(self) -> list[Command]:
        return list(set(self.commands.values()))

    def add_cog(self, cog: Cog) -> None:
        self.cogs[type(cog).__name__] = cog
        for command in cog.get_commands():
            self.add_command(command)

    def get_cog(self, name: str) -> Optional[Cog]:
        return self.cogs.get(name)

    def remove_cog(self, name: str) -> Optional[Cog]:
        return self.cogs.pop(name, None)

    async def load_extension(self, name: str, **kwargs: Any) -> None:
        __import__(name)

    async def unload_extension(self, name: str, **kwargs: Any) -> None:
        return None

    async def reload_extension(self, name: str, **kwargs: Any) -> None:
        return None

    # ---- checks/hooks
    def check(self, predicate: Callable[["Context"], Any]):
        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            checks = getattr(func, "__commands_checks__", [])
            checks.append(predicate)
            setattr(func, "__commands_checks__", checks)
            return func

        return decorator

    def add_check(self, predicate: Callable[["Context"], Any]) -> None:
        self._checks.append(predicate)

    def remove_check(self, predicate: Callable[["Context"], Any]) -> None:
        try:
            self._checks.remove(predicate)
        except ValueError:
            pass

    def before_invoke(self, coro: Callable[["Context"], Any]) -> Callable[["Context"], Any]:
        self._before_invoke.append(coro)
        return coro

    def after_invoke(self, coro: Callable[["Context"], Any]) -> Callable[["Context"], Any]:
        self._after_invoke.append(coro)
        return coro

    # ---- command processing
    async def _get_prefix(self, message: nc.Message) -> str | list[str] | None:
        prefix = self.command_prefix
        if callable(prefix):
            result = prefix(self, message)
            if inspect.isawaitable(result):
                result = await result
            return result
        return prefix

    async def _process_message(self, message: nc.Message) -> None:
        if not message or not message.id or message.id in self._processed_messages:
            return
        self._processed_messages.add(message.id)
        try:
            await self.process_commands(message)
        except Exception:
            nc.log.exception("command processing failed")

    async def process_commands(self, message: nc.Message) -> None:
        if not message or not message.content:
            return
        author = message.author
        if author is None or author.bot or (self.user and author.id == self.user.id):
            return
        prefixes = await self._get_prefix(message)
        if not prefixes:
            return
        if isinstance(prefixes, str):
            prefixes = [prefixes]
        used = next((prefix for prefix in prefixes if message.content.startswith(prefix)), None)
        if not used:
            return
        content = message.content[len(used) :].strip()
        if not content:
            return
        parts = content.split()
        invoked_with, *args = parts
        command = self.commands.get(invoked_with)
        if command is None:
            await self.dispatch("command_error", None, CommandNotFound(invoked_with))
            return
        invoked_subcommand = None
        if isinstance(command, Group):
            if args and args[0] in command.commands:
                invoked_subcommand = args[0]
                invoked_with = args[0]
                command = command.commands[args[0]]
                args = args[1:]
            elif not command.invoke_without_command:
                await self.dispatch("command_error", None, CommandNotFound(invoked_with))
                return
        ctx = Context(self, message, used, command, invoked_with)
        ctx.invoked_subcommand = invoked_subcommand
        try:
            parsed_args, parsed_kwargs = await self._parse_arguments(command, ctx, args)
            ctx.args, ctx.kwargs = parsed_args, parsed_kwargs
            for predicate in self._checks + command.checks:
                result = predicate(ctx)
                if inspect.isawaitable(result):
                    result = await result
                if result is False:
                    raise CheckFailure(f"Check failed for {command.qualified_name}")
            await command.invoke(ctx)
            await self.dispatch("command", ctx)
        except CommandError as error:
            await self.dispatch("command_error", ctx, error)
        except Exception as error:
            await self.dispatch("command_error", ctx, CommandInvokeError(error))

    async def _parse_arguments(
        self, command: Command, ctx: Context, tokens: list[str]
    ) -> tuple[list[Any], dict[str, Any]]:
        signature = inspect.signature(command.callback)
        params = [p for p in signature.parameters.values() if p.name != "ctx"]
        args: list[Any] = []
        kwargs: dict[str, Any] = {}
        index = 0

        for param in params:
            if param.kind is inspect.Parameter.VAR_KEYWORD:
                if index < len(tokens):
                    kwargs[param.name] = " ".join(tokens[index:])
                else:
                    kwargs[param.name] = None
                index = len(tokens)
                continue
            if param.kind is inspect.Parameter.KEYWORD_ONLY:
                if index < len(tokens):
                    kwargs[param.name] = await self._convert_argument(param, ctx, " ".join(tokens[index:]))
                    index = len(tokens)
                elif param.default is not inspect.Parameter.empty:
                    kwargs[param.name] = param.default
                else:
                    kwargs[param.name] = None
                continue
            if index >= len(tokens):
                if param.default is not inspect.Parameter.empty:
                    args.append(param.default)
                    continue
                raise MissingRequiredArgument(param)
            if _is_greedy(param.annotation):
                remaining = tokens[index:]
                values = []
                annotation = param.annotation.converter
                for token in remaining:
                    values.append(await self._convert_value(annotation, ctx, token))
                args.append(values)
                index = len(tokens)
            else:
                args.append(await self._convert_argument(param, ctx, tokens[index]))
                index += 1
        return args, kwargs

    async def _convert_argument(self, param: inspect.Parameter, ctx: Context, value: str) -> Any:
        return await self._convert_value(param.annotation, ctx, value)

    async def _convert_value(self, annotation: Any, ctx: Context, value: str) -> Any:
        annotation = _unwrap_annotation(annotation)
        if annotation in (inspect.Parameter.empty, str, Any):
            return value
        if annotation is bool:
            return value.lower() in ("1", "true", "yes", "y", "on")
        if annotation is int:
            try:
                return int(value)
            except ValueError as error:
                raise BadArgument(value) from error
        if annotation is float:
            try:
                return float(value)
            except ValueError as error:
                raise BadArgument(value) from error
        if annotation is nc.Member or annotation is MemberConverter:
            return await MemberConverter().convert(ctx, value)
        if annotation is nc.User or annotation is UserConverter:
            return await UserConverter().convert(ctx, value)
        if annotation is nc.Role or annotation is RoleConverter:
            return await RoleConverter().convert(ctx, value)
        if annotation is nc.Channel or annotation in (ChannelConverter, TextChannelConverter):
            return await ChannelConverter().convert(ctx, value)
        if isinstance(annotation, type) and issubclass(annotation, Converter):
            return await annotation().convert(ctx, value)
        if callable(annotation):
            result = annotation(value)
            if inspect.isawaitable(result):
                result = await result
            return result
        return value

    # ---- app command tree
    async def start(self, token: str | None = None, *, reconnect: bool = True) -> None:
        await super().start(token, reconnect=reconnect)

    def run(self, token: str | None = None) -> None:
        super().run(token)

    async def close(self) -> None:
        await super().close()


class _Tree:
    def __init__(self, bot: Bot) -> None:
        self.client = bot
        self.commands: dict[str, Any] = {}

    def command(self, *args: Any, **kwargs: Any):
        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            name = kwargs.get("name") or func.__name__
            self.commands[name] = func
            return func

        return decorator

    def add_command(self, command: Any, **kwargs: Any) -> None:
        self.commands[getattr(command, "name", str(command))] = command

    async def sync(self, *args: Any, **kwargs: Any) -> list[Any]:
        return []


def _is_greedy(annotation: Any) -> bool:
    return isinstance(annotation, GreedyAnnotation)


def _unwrap_annotation(annotation: Any) -> Any:
    if isinstance(annotation, GreedyAnnotation):
        return annotation.converter
    if isinstance(annotation, OptionalAnnotation):
        return annotation.converter
    origin = typing.get_origin(annotation)
    if origin is typing.Union:
        args = [arg for arg in typing.get_args(annotation) if arg is not type(None)]
        return args[0] if args else str
    return annotation


__all__ = [
    "BadArgument",
    "Bot",
    "ChannelConverter",
    "CheckFailure",
    "Cog",
    "Command",
    "CommandError",
    "CommandInvokeError",
    "CommandNotFound",
    "CommandOnCooldown",
    "Context",
    "Converter",
    "Greedy",
    "Group",
    "MemberConverter",
    "MemberNotFound",
    "MissingPermissions",
    "MissingRequiredArgument",
    "NoPrivateMessage",
    "Optional",
    "RoleConverter",
    "RoleNotFound",
    "TextChannelConverter",
    "UserConverter",
    "UserNotFound",
    "bot_has_permissions",
    "check",
    "cooldown",
    "dm_only",
    "guild_only",
    "has_permissions",
    "is_owner",
]
