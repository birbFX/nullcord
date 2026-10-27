"""Small discord.ext.tasks-compatible loop implementation."""
from __future__ import annotations

import asyncio
import datetime
from typing import Any, Awaitable, Callable, Optional


class Loop:
    def __init__(
        self,
        coro: Callable[..., Awaitable[Any]],
        *,
        seconds: float = 0,
        minutes: float = 0,
        hours: float = 0,
        count: Optional[int] = None,
        reconnect: bool = True,
    ) -> None:
        self.coro = coro
        self.seconds = seconds + minutes * 60 + hours * 3600
        self.count = count
        self.reconnect = reconnect
        self._task: asyncio.Task[Any] | None = None
        self._before_loop: Optional[Callable[..., Any]] = None
        self._after_loop: Optional[Callable[..., Any]] = None
        self._wait_until_ready: Optional[Callable[..., Any]] = None
        self._next_iteration: Optional[datetime.datetime] = None

    @property
    def next_iteration(self) -> Optional[datetime.datetime]:
        return self._next_iteration

    def before_loop(self, coro: Callable[..., Any]) -> Callable[..., Any]:
        self._before_loop = coro
        return coro

    def after_loop(self, coro: Callable[..., Any]) -> Callable[..., Any]:
        self._after_loop = coro
        return coro

    def wait_until_ready(self, coro: Callable[..., Any]) -> Callable[..., Any]:
        self._wait_until_ready = coro
        return coro

    def is_running(self) -> bool:
        return bool(self._task and not self._task.done())

    def start(self, *args: Any, **kwargs: Any) -> None:
        if self.is_running():
            raise RuntimeError("Task is already running")
        self._task = asyncio.create_task(self._runner(*args, **kwargs))

    def cancel(self) -> None:
        if self._task:
            self._task.cancel()
            self._task = None

    async def _runner(self, *args: Any, **kwargs: Any) -> None:
        try:
            if self._before_loop:
                result = self._before_loop(*args, **kwargs)
                if asyncio.iscoroutine(result):
                    await result
            if self._wait_until_ready:
                result = self._wait_until_ready(*args, **kwargs)
                if asyncio.iscoroutine(result):
                    await result

            iterations = 0
            while self.count is None or iterations < self.count:
                self._next_iteration = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
                    seconds=self.seconds
                )
                result = self.coro(*args, **kwargs)
                if asyncio.iscoroutine(result):
                    await result
                iterations += 1
                if self.count is not None and iterations >= self.count:
                    break
                await asyncio.sleep(max(0, self.seconds))
        except asyncio.CancelledError:
            raise
        finally:
            if self._after_loop:
                result = self._after_loop(*args, **kwargs)
                if asyncio.iscoroutine(result):
                    await result


def loop(*, seconds: float = 0, minutes: float = 0, hours: float = 0, count: Optional[int] = None, reconnect: bool = True):
    def decorator(coro: Callable[..., Awaitable[Any]]) -> Loop:
        return Loop(coro, seconds=seconds, minutes=minutes, hours=hours, count=count, reconnect=reconnect)

    return decorator


__all__ = ["Loop", "loop"]
