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
        self.assertIs(client.get_user("u"), received[0].author)

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
