import asyncio
import unittest

import nullcord


class ModelTests(unittest.TestCase):
    def test_embed_payload(self):
        embed = nullcord.Embed(
            title="Title",
            description="Body",
            url="https://example.com",
            colour=nullcord.Colour.green,
        )
        self.assertEqual(
            embed.to_dict(),
            {
                "title": "Title",
                "description": "Body",
                "url": "https://example.com",
                "colour": "#57f287",
            },
        )

    def test_embed_media_accepts_file_dict(self):
        embed = nullcord.Embed(title="x", media={"_id": "file-id"})
        self.assertEqual(embed.to_dict()["media"], "file-id")

    def test_message_ulid_time(self):
        message = nullcord.Message(
            None,
            {
                "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                "channel": "c",
                "author": "u",
                "content": "hi",
            },
        )
        self.assertEqual(message.created_at.year, 2016)
        self.assertEqual(message.id, "01ARZ3NDEKTSV4RRFFQ69G5FAV")

    def test_message_embed_round_trip(self):
        message = nullcord.Message(
            None,
            {
                "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                "channel": "c",
                "author": "u",
                "embeds": [{"title": "t", "description": "d", "media": {"_id": "f"}}],
            },
        )
        self.assertEqual(message.embeds[0].title, "t")
        self.assertEqual(message.embeds[0].to_dict()["media"], "f")

    def test_user_tag_and_mention(self):
        user = nullcord.User(
            None, {"_id": "u", "username": "birb", "discriminator": "0001"}
        )
        self.assertEqual(user.tag, "birb#0001")
        self.assertEqual(user.mention, "<@u>")


class ClientEventTests(unittest.IsolatedAsyncioTestCase):
    async def test_message_event_dispatch(self):
        client = nullcord.Client("dummy")
        received = []

        @client.event
        async def on_message(message):
            received.append(message)

        await client._handle_packet(
            {
                "type": "Message",
                "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                "channel": "c",
                "author": "u",
                "content": "hello",
                "user": {"_id": "u", "username": "birb", "discriminator": "0001"},
            }
        )

        self.assertEqual(len(received), 1)
        self.assertEqual(received[0].content, "hello")
        self.assertEqual(received[0].author.username, "birb")
        self.assertEqual(client.get_user("u").id, received[0].author.id)

    async def test_message_update_uses_cache(self):
        client = nullcord.Client("dummy")
        before_after = []

        @client.event
        async def on_message_update(before, after, packet):
            before_after.append((before, after, packet))

        await client._handle_packet(
            {
                "type": "Message",
                "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                "channel": "c",
                "author": "u",
                "content": "old",
            }
        )
        await client._handle_packet(
            {
                "type": "MessageUpdate",
                "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                "channel": "c",
                "data": {"content": "new"},
            }
        )

        self.assertEqual(before_after[0][0].content, "old")
        self.assertEqual(before_after[0][1].content, "new")

    async def test_unknown_event_reaches_on_event(self):
        client = nullcord.Client("dummy")
        events = []

        @client.event
        async def on_event(event_type, payload):
            events.append((event_type, payload))

        await client._handle_packet({"type": "SomethingNew", "value": 1})
        self.assertEqual(events[0][0], "SomethingNew")
        self.assertEqual(events[0][1]["value"], 1)


class HTTPModelTests(unittest.TestCase):
    def test_file_from_dict(self):
        file = nullcord.File.from_dict(
            {
                "_id": "file",
                "tag": "attachments",
                "filename": "a.txt",
                "content_type": "text/plain",
                "size": 5,
            },
            "https://autumn.example",
        )
        self.assertEqual(file.id, "file")
        self.assertEqual(file.url, "https://autumn.example/attachments/file/a.txt")

    def test_file_resolution(self):
        file = nullcord.File(data=b"abc", filename="x.txt")
        self.assertEqual(file.read_bytes(), b"abc")
        self.assertEqual(file.resolved_filename(), "x.txt")
        self.assertEqual(file.resolved_content_type(), "text/plain")


if __name__ == "__main__":
    unittest.main()


# ---------------------------------------------------------------------------
# Extended compatibility tests
# ---------------------------------------------------------------------------
import time
from unittest.mock import AsyncMock

import discord
from discord.ext import commands


class FakeHTTPResponse:
    def __init__(self, status=200, text="{}", headers=None):
        self.status = status
        self._text = text
        self.headers = headers or {}

    async def text(self):
        return self._text

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None


class FakeHTTPSession:
    def __init__(self, responses):
        self.responses = list(responses)

    def request(self, *args, **kwargs):
        return self.responses.pop(0)


class EmbedCompatibilityTests(unittest.TestCase):
    def test_native_flat_embed_and_folded_parts(self):
        embed = nullcord.Embed(
            title="Axiom Commands",
            description="Prefix: `?`",
            url="https://example.com",
            colour=discord.Color.dark_teal(),
        )
        embed.add_field(name="Core", value="**?help**", inline=False)
        embed.set_footer(text="footer")
        embed.set_author(name="Axiom", icon_url="https://example.com/icon.png")
        payload = embed.to_dict()

        self.assertNotIn("type", payload)
        self.assertEqual(payload["title"], "Axiom Commands")
        self.assertIn("**Core**", payload["description"])
        self.assertIn("_footer_", payload["description"])
        self.assertIn("**Axiom**", payload["description"])
        self.assertEqual(payload["colour"], "#1f8b8b")
        self.assertEqual(payload["url"], "https://example.com")

    def test_embed_limits_and_split(self):
        embed = nullcord.Embed(title="T" * 150, description="D" * 4500)
        payloads = embed.to_embeds()
        self.assertGreaterEqual(len(payloads), 2)
        self.assertLessEqual(len(payloads), 10)
        for payload in payloads:
            self.assertLessEqual(len(payload["title"]), 100)
            self.assertLessEqual(len(payload["description"]), 2000)
            self.assertNotIn("type", payload)

    def test_image_thumbnail_and_media(self):
        embed = nullcord.Embed(title="x")
        embed.set_image(url="file-id")
        self.assertEqual(embed.to_dict()["media"], "file-id")

        embed = nullcord.Embed(title="x")
        embed.set_image(url="https://example.com/a.png")
        self.assertIn("![Image]", embed.to_dict()["description"])


class ClientSafetyTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_component_payload(self):
        http = nullcord.HTTPClient("dummy")
        captured = []

        async def fake_request(method, path, **kwargs):
            captured.append(kwargs["payload"])
            return {"_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV", "channel": "c", "author": "bot"}

        http.request = fake_request
        view = discord.ui.View(timeout=None)
        view.add_item(
            discord.ui.Select(
                placeholder="Browse a category...",
                options=[
                    discord.SelectOption(label="General", value="general", emoji="⚙️", description="Core commands"),
                    discord.SelectOption(label="Moderation", value="mod", emoji="🔨"),
                ],
            )
        )
        view.add_item(
            discord.ui.Button(label="Home", emoji="🏠", style=discord.ButtonStyle.primary)
        )
        await http.send_message("c", "help", view=view)
        components = captured[0]["components"]
        self.assertEqual([c["type"] for c in components], ["select", "button"])
        self.assertEqual(components[0]["options"][0]["value"], "general")
        self.assertEqual(components[1]["label"], "Home")

    async def test_interaction_create_gateway(self):
        bot = nullcord.Client("dummy")
        bot.user = nullcord.User(bot, {"_id": "bot", "username": "Bot", "discriminator": "0001", "bot": {}})
        seen = []
        view = discord.ui.View(timeout=None)
        button = discord.ui.Button(label="Go", custom_id="go")
        async def callback(interaction):
            seen.append((interaction.data.custom_id, interaction.data.values))
        button.callback = callback
        view.add_item(button)
        message = nullcord.Message(
            bot,
            {"_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV", "channel": "c", "author": "bot", "content": "x"},
        )
        await bot.attach_view(message, view)
        await bot._handle_packet(
            {
                "type": "InteractionCreate",
                "custom_id": "go",
                "values": [],
                "message": {"_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV", "channel": "c", "author": "bot"},
                "user": {"_id": "u", "username": "User", "discriminator": "0001"},
            }
        )
        self.assertEqual(seen, [("go", [])])

    async def test_bot_token_verification_rejects_user(self):
        client = nullcord.Client("secret-token")
        client.http.start = AsyncMock()
        client.http.fetch_node = AsyncMock(return_value={})
        client.http.fetch_self = AsyncMock(
            return_value=nullcord.User(
                client,
                {"_id": "u", "username": "normal", "discriminator": "0001"},
            )
        )
        client.http.close = AsyncMock()

        with self.assertRaises(RuntimeError) as error:
            await client.start()
        self.assertNotIn("secret-token", str(error.exception))
        client.http.close.assert_awaited_once()

    async def test_ready_caches(self):
        client = nullcord.Client("dummy")
        await client._handle_packet(
            {
                "type": "Ready",
                "users": [{"_id": "u", "username": "birb", "discriminator": "0001"}],
                "servers": [{"_id": "s", "name": "CLL", "owner": "u", "channels": ["c"], "roles": {}}],
                "channels": [{"_id": "c", "channel_type": "TextChannel", "server": "s", "name": "general"}],
                "members": [{"_id": {"server": "s", "user": "u"}, "joined_at": "now", "roles": []}],
            }
        )
        self.assertIn("u", client.users)
        self.assertIn("s", client.servers)
        self.assertIn("c", client.channels)
        self.assertIsNotNone(client.get_member("s", "u"))
        self.assertTrue(client._ready.is_set())

    async def test_gateway_auth_ping_pong(self):
        client = nullcord.Client("dummy")
        seen = []
        client.add_listener("authenticated", lambda: seen.append("auth"))
        await client._handle_packet({"type": "Authenticated"})
        await client._handle_packet({"type": "Pong", "data": time.time() - 0.5})
        self.assertEqual(seen, ["auth"])
        self.assertGreaterEqual(client.latency, 0.4)

    async def test_status_mapping(self):
        user = nullcord.User(
            None,
            {
                "_id": "u",
                "username": "x",
                "discriminator": "0001",
                "status": {"presence": "Busy", "text": "busy"},
            },
        )
        self.assertEqual(user.status, nullcord.Status.dnd)
        self.assertEqual(user.status_text, "busy")

    async def test_gateway_client_packets(self):
        class FakeWS:
            def __init__(self):
                self.sent = []

            async def send_json(self, value):
                self.sent.append(value)

        client = nullcord.Client("dummy")
        client._ws = FakeWS()
        await client.send_typing("c")
        await client.stop_typing("c")
        await client.subscribe("s")
        self.assertEqual(
            client._ws.sent,
            [
                {"type": "BeginTyping", "channel": "c"},
                {"type": "EndTyping", "channel": "c"},
                {"type": "Subscribe", "server_id": "s"},
            ],
        )

    async def test_duplicate_gateway_message_dispatched_once(self):
        client = nullcord.Client("dummy")
        seen = []
        client.add_listener("message", lambda message: seen.append(message.id))
        packet = {
            "type": "Message",
            "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
            "channel": "c",
            "author": "u",
            "content": "hi",
        }
        await client._handle_packet(packet)
        await client._handle_packet(packet)
        self.assertEqual(seen, ["01ARZ3NDEKTSV4RRFFQ69G5FAV"])

    async def test_idempotency_and_bot_header(self):
        http = nullcord.HTTPClient("secret-token")
        captured = []

        async def fake_request(method, path, **kwargs):
            captured.append((method, path, kwargs))
            return {
                "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                "channel": "c",
                "author": "bot",
                "content": "hi",
            }

        http.request = fake_request
        await http.send_message("c", "hi", idempotency_key="fixed-key")
        self.assertEqual(http._headers()["x-bot-token"], "secret-token")
        self.assertEqual(captured[0][2]["headers"]["Idempotency-Key"], "fixed-key")

    async def test_blocked_api_is_explicit(self):
        http = nullcord.HTTPClient("dummy")
        with self.assertRaises(NotImplementedError):
            await http.search_messages("c")
        with self.assertRaises(NotImplementedError):
            await http.create_invite("c")

    async def test_reconnect_backoff_is_bounded(self):
        self.assertEqual(nullcord.Client._next_backoff(1.0), 2.0)
        self.assertEqual(nullcord.Client._next_backoff(16.0), 30.0)
        self.assertEqual(nullcord.Client._next_backoff(30.0), 30.0)

    async def test_rate_limit_backoff(self):
        http = nullcord.HTTPClient("dummy")
        http._session = FakeHTTPSession(
            [
                FakeHTTPResponse(429, '{"retry_after": 0.01}'),
                FakeHTTPResponse(200, '{"ok": true}'),
            ]
        )
        result = await http.request("GET", "/test")
        self.assertEqual(result, {"ok": True})

    @unittest.skipUnless(nullcord.aiohttp is not None, "aiohttp is required for uploads")
    async def test_autumn_upload_mock(self):
        http = nullcord.HTTPClient("dummy")
        http._autumn_url = "https://autumn.example"
        class UploadSession:
            def post(self, url, data, headers):
                return FakeHTTPResponse(200, '{"id": "uploaded"}')
        http._session = UploadSession()
        file = await http.upload(nullcord.File(data=b"abc", filename="a.txt"))
        self.assertEqual(file.id, "uploaded")
        self.assertEqual(file.url, "https://autumn.example/attachments/uploaded/a.txt")


class CommandCompatibilityTests(unittest.IsolatedAsyncioTestCase):
    async def _bot(self):
        bot = commands.Bot("?", token="dummy")
        bot.user = nullcord.User(
            bot, {"_id": "bot", "username": "Bot", "discriminator": "0001", "bot": {}}
        )
        server = nullcord.Server(
            bot,
            {
                "_id": "s",
                "name": "CLL",
                "owner": "owner",
                "channels": ["c"],
                "roles": {"r": {"_id": "r", "name": "Mod", "permissions": {"allow": 0, "deny": 0}}},
            },
        )
        bot.servers["s"] = server
        bot.channels["c"] = nullcord.Channel(
            bot, {"_id": "c", "channel_type": "TextChannel", "server": "s", "name": "general"}
        )
        user = nullcord.User(
            bot, {"_id": "u", "username": "User", "discriminator": "0001", "online": True}
        )
        bot.users["u"] = user
        member = nullcord.Member(
            bot, server, {"_id": {"server": "s", "user": "u"}, "joined_at": "now", "roles": []}
        )
        bot.members[("s", "u")] = member
        return bot, server, user

    async def test_groups_greedy_optional_and_reason(self):
        bot, _server, user = await self._bot()
        seen = []

        @bot.command(name="args")
        async def args(ctx, first: int, *, reason=None):
            seen.append(("args", ctx.author.id, first, reason, ctx.command.qualified_name))

        @bot.group(invoke_without_command=True)
        async def group(ctx):
            seen.append(("group",))

        @group.command(name="sub")
        async def sub(ctx, *, reason=None):
            seen.append(("sub", reason))

        await bot.process_commands(
            nullcord.Message(
                bot,
                {
                    "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                    "channel": "c",
                    "author": "u",
                    "content": "?args 5 because yes",
                    "user": user.raw,
                },
            )
        )
        await bot.process_commands(
            nullcord.Message(
                bot,
                {
                    "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAW",
                    "channel": "c",
                    "author": "u",
                    "content": "?group sub hello world",
                    "user": user.raw,
                },
            )
        )
        self.assertEqual(seen[0], ("args", "u", 5, "because yes", "args"))
        self.assertEqual(seen[1], ("sub", "hello world"))

    async def test_greedy_and_optional(self):
        bot, _server, user = await self._bot()
        seen = []

        @bot.command(name="nums")
        async def nums(ctx, values: commands.Greedy[int]):
            seen.append(values)

        await bot.process_commands(
            nullcord.Message(
                bot,
                {
                    "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                    "channel": "c",
                    "author": "u",
                    "content": "?nums 1 2 3",
                    "user": user.raw,
                },
            )
        )
        self.assertEqual(seen, [[1, 2, 3]])

    async def test_command_error_and_prefix_callable(self):
        bot, _server, user = await self._bot()
        errors = []

        @bot.event
        async def on_command_error(ctx, error):
            errors.append(type(error).__name__)

        bot.command_prefix = lambda _bot, _message: ["?", "!"]

        message = nullcord.Message(
            bot,
            {
                "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                "channel": "c",
                "author": "u",
                "content": "!missing",
                "user": user.raw,
            },
        )
        await bot.process_commands(message)
        self.assertEqual(errors, ["CommandNotFound"])

    async def test_optional_converter(self):
        bot, _server, user = await self._bot()
        seen = []

        @bot.command(name="opt")
        async def opt(ctx, value: commands.Optional[int] = None):
            seen.append(value)

        for index, text in enumerate(("?opt 7", "?opt")):
            await bot.process_commands(
                nullcord.Message(
                    bot,
                    {
                        "_id": f"01ARZ3NDEKTSV4RRFFQ69G5FA{chr(86 + index)}",
                        "channel": "c",
                        "author": "u",
                        "content": text,
                        "user": user.raw,
                    },
                )
            )
        self.assertEqual(seen, [7, None])

    async def test_self_and_duplicate_message_ignored(self):
        bot, _server, user = await self._bot()
        seen = []

        @bot.command(name="ping")
        async def ping(ctx):
            seen.append(1)

        self_message = nullcord.Message(
            bot,
            {
                "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                "channel": "c",
                "author": "bot",
                "content": "?ping",
            },
        )
        await bot._process_message(self_message)
        user_message = nullcord.Message(
            bot,
            {
                "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAW",
                "channel": "c",
                "author": "u",
                "content": "?ping",
                "user": user.raw,
            },
        )
        await bot._process_message(user_message)
        await bot._process_message(user_message)
        self.assertEqual(len(seen), 1)


class HelpViewAcceptanceTests(unittest.IsolatedAsyncioTestCase):
    async def test_large_select_paginates_under_reaction_limit(self):
        bot = discord.Client(token="dummy")
        bot.native_components = False
        bot.user = nullcord.User(
            bot, {"_id": "bot", "username": "Axiom", "discriminator": "0001", "bot": {}}
        )
        channel = nullcord.Channel(
            bot, {"_id": "c", "channel_type": "TextChannel", "server": "s", "name": "general"}
        )
        bot.channels["c"] = channel
        message = nullcord.Message(
            bot,
            {"_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV", "channel": "c", "author": "u", "content": ""},
        )
        message.reactions = {}

        async def react(emoji):
            message.reactions.setdefault(emoji, set()).add("bot")

        async def unreact(emoji):
            message.reactions.pop(emoji, None)

        message.react = react
        message.unreact = unreact
        view = discord.ui.View(timeout=None)
        view.add_item(
            discord.ui.Select(
                options=[
                    discord.SelectOption(label=f"Category {i}", value=str(i), emoji=chr(0x1F600 + i))
                    for i in range(25)
                ]
            )
        )
        view.add_item(discord.ui.Button(label="Home", emoji="🏠"))
        view.add_item(discord.ui.Button(label="Prev", emoji="◀️"))
        view.add_item(discord.ui.Button(label="Next", emoji="▶️"))

        await bot.attach_view(message, view)
        self.assertLessEqual(len(message.reactions), 20)
        self.assertIn("📄", message.reactions)
        await bot._handle_view_reaction(
            message,
            nullcord.User(bot, {"_id": "u", "username": "User", "discriminator": "0001"}),
            "📄",
        )
        self.assertEqual(view._select_page, 1)
        self.assertLessEqual(len(message.reactions), 20)

    async def test_axiom_style_help_view_select_and_navigation(self):
        bot = discord.Client(token="dummy")
        bot.user = nullcord.User(
            bot, {"_id": "bot", "username": "Axiom", "discriminator": "0001", "bot": {}}
        )
        server = nullcord.Server(
            bot, {"_id": "s", "name": "CLL", "owner": "owner", "channels": ["c"], "roles": {}}
        )
        bot.servers["s"] = server
        channel = nullcord.Channel(
            bot, {"_id": "c", "channel_type": "TextChannel", "server": "s", "name": "general"}
        )
        bot.channels["c"] = channel
        user = nullcord.User(bot, {"_id": "u", "username": "User", "discriminator": "0001"})
        message = nullcord.Message(
            bot,
            {
                "_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                "channel": "c",
                "author": "u",
                "content": "?help",
            },
        )
        reactions = []
        edits = []

        async def react(emoji):
            reactions.append(emoji)

        async def edit(content=None, embed=None, embeds=None, view=None, **kwargs):
            edits.append((content, embed.to_dict() if hasattr(embed, "to_dict") else embed, view))
            if view is not None:
                await bot.attach_view(message, view)
            return message

        message.react = react
        message.edit = edit

        class AxHelpView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=None)
                self.index = -1
                self.categories = ["Core", "Moderation"]
                self.select = discord.ui.Select(
                    options=[
                        discord.SelectOption(label="Core", value="core", emoji="⚙️"),
                        discord.SelectOption(label="Moderation", value="mod", emoji="🔨"),
                    ]
                )
                self.select.callback = self._on_select
                self.home = discord.ui.Button(label="Home", emoji="🏠", style=discord.ButtonStyle.primary)
                self.home.callback = self._on_home
                self.prev = discord.ui.Button(label="Prev", emoji="◀️")
                self.prev.callback = self._on_prev
                self.next = discord.ui.Button(label="Next", emoji="▶️")
                self.next.callback = self._on_next
                for item in (self.select, self.home, self.prev, self.next):
                    self.add_item(item)

            def _current_embed(self):
                return discord.Embed(
                    title="Axiom Commands",
                    description=f"index={self.index}",
                    colour=discord.Color.dark_teal(),
                )

            async def _render(self, interaction):
                await interaction.response.edit_message(embed=self._current_embed(), view=self)

            async def _on_select(self, interaction):
                self.index = self.categories.index("Core")
                await self._render(interaction)

            async def _on_home(self, interaction):
                self.index = -1
                await self._render(interaction)

            async def _on_prev(self, interaction):
                self.index = max(0, self.index - 1)
                await self._render(interaction)

            async def _on_next(self, interaction):
                self.index = min(len(self.categories) - 1, self.index + 1)
                await self._render(interaction)

        interactions = []

        @bot.event
        async def on_interaction(interaction):
            interactions.append(interaction)

        view = AxHelpView()
        await bot.attach_view(message, view)
        self.assertEqual(reactions, [])
        self.assertIn(view.select.custom_id, bot.view_custom_ids)

        await bot.handle_component_interaction(
            view.select.custom_id, message=message, user=user, values=["core"]
        )
        self.assertEqual(view.index, 0)
        self.assertNotIn("type", edits[-1][1])
        self.assertEqual(edits[-1][1]["title"], "Axiom Commands")

        await bot.handle_component_interaction(
            view.home.custom_id, message=message, user=user
        )
        self.assertEqual(view.index, -1)
        await bot.handle_component_interaction(
            view.next.custom_id, message=message, user=user
        )
        self.assertEqual(view.index, 0)
        self.assertGreaterEqual(len(interactions), 3)
        self.assertEqual(interactions[-1].type, discord.InteractionType.component)
