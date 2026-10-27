"""discord.abc aliases for NullCord models."""
from nullcord import Channel as GuildChannel  # noqa: F401
from nullcord import Channel as Messageable  # noqa: F401
from nullcord import Channel as Connectable  # noqa: F401
from nullcord import User as Snowflake  # noqa: F401

__all__ = ["Connectable", "GuildChannel", "Messageable", "Snowflake"]
