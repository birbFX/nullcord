import asyncio
import unittest

from nullcord_compat.components import ComponentRenderer
from nullcord_compat.hook import handle_component_interaction
from nullcord_compat.registry import ComponentRegistry


class FakeEmoji:
    def __init__(self, name):
        self.name = name


class FakeOption:
    def __init__(self, label, value, emoji=None):
        self.label = label
        self.value = value
        self.emoji = FakeEmoji(emoji) if emoji else None
        self.description = None
        self.default = False


class FakeSelect:
    def __init__(self, custom_id="select", options=None, callback=None, row=0):
        self.custom_id = custom_id
        self.options = options or []
        self.placeholder = "Browse a category..."
        self.min_values = 1
        self.max_values = 1
        self.disabled = False
        self.row = row
        self.values = []
        self.callback = callback


class FakeButton:
    def __init__(self, custom_id="button", label="Home", callback=None, row=1):
        self.custom_id = custom_id
        self.label = label
        self.style = "primary"
        self.emoji = FakeEmoji("🏠")
        self.disabled = False
        self.row = row
        self.url = None
        self.callback = callback


class FakeView:
    def __init__(self, *children):
        self.children = list(children)


class FakeEmbed:
    def to_dict(self):
        return {"title": "Help", "description": "General commands"}


class FakeBridge:
    def __init__(self):
        self.calls = []

    async def edit_message(self, channel_id, message_id, payload):
        self.calls.append((channel_id, message_id, payload))
        return {"ok": True}


class ComponentRendererTests(unittest.TestCase):
    def test_renders_select_and_buttons(self):
        select = FakeSelect(options=[FakeOption("General", "general", "1")])
        button = FakeButton()
        view = FakeView(select, button)

        rendered = ComponentRenderer().render(view)

        self.assertEqual([item["type"] for item in rendered], ["select", "button"])
        self.assertEqual(rendered[0]["custom_id"], "select")
        self.assertEqual(rendered[0]["options"][0]["label"], "General")
        self.assertEqual(rendered[0]["options"][0]["emoji"], "1")
        self.assertEqual(rendered[1]["custom_id"], "button")
        self.assertEqual(rendered[1]["style"], "primary")
        self.assertEqual(rendered[1]["row"], 1)

    def test_missing_custom_id_is_stable(self):
        button = FakeButton(custom_id=None)
        view = FakeView(button)
        renderer = ComponentRenderer()

        first = renderer.render(view)[0]["custom_id"]
        second = renderer.render(view)[0]["custom_id"]

        self.assertTrue(first)
        self.assertEqual(first, second)


class ComponentInteractionTests(unittest.IsolatedAsyncioTestCase):
    async def test_dispatch_calls_live_view_callback_and_edits_message(self):
        bridge = FakeBridge()
        seen = {}

        async def on_home(interaction):
            seen["interaction"] = interaction
            await interaction.response.edit_message(embed=FakeEmbed(), view=view)

        home = FakeButton(custom_id="home", callback=on_home)
        view = FakeView(home)
        registry = ComponentRegistry()
        registry.register_view(view, message_id="m1", channel_id="c1")

        interaction = await handle_component_interaction(
            {
                "id": "i1",
                "data": {"custom_id": "home"},
                "message": {"id": "m1", "channel_id": "c1"},
                "user": {"id": "u1", "username": "birb"},
            },
            bridge,
            registry=registry,
        )

        self.assertIsNotNone(interaction)
        self.assertIs(seen["interaction"], interaction)
        self.assertEqual(interaction.type, 2)
        self.assertEqual(interaction.data.custom_id, "home")
        self.assertEqual(interaction.user.id, "u1")
        self.assertEqual(interaction.message.id, "m1")
        self.assertEqual(len(bridge.calls), 1)
        channel_id, message_id, payload = bridge.calls[0]
        self.assertEqual((channel_id, message_id), ("c1", "m1"))
        self.assertEqual(payload["embeds"][0]["title"], "Help")
        self.assertEqual(payload["components"][0]["custom_id"], "home")

    async def test_select_values_are_applied_before_callback(self):
        bridge = FakeBridge()
        seen = {}

        async def on_select(interaction):
            seen["value"] = select.values[0]
            await interaction.edit_original_response(content="selected")

        select = FakeSelect(custom_id="category", callback=on_select)
        view = FakeView(select)
        registry = ComponentRegistry()
        registry.register_view(view, message_id="m2", channel_id="c2")

        await handle_component_interaction(
            {
                "data": {"custom_id": "category", "values": ["general"]},
                "message": {"id": "m2", "channel_id": "c2"},
                "user": {"id": "u2"},
            },
            bridge,
            registry=registry,
        )

        self.assertEqual(seen["value"], "general")
        self.assertEqual(bridge.calls[0][2]["content"], "selected")

    async def test_unknown_custom_id_is_ignored(self):
        bridge = FakeBridge()
        interaction = await handle_component_interaction(
            {"data": {"custom_id": "nope"}},
            bridge,
            registry=ComponentRegistry(),
        )
        self.assertIsNone(interaction)


if __name__ == "__main__":
    unittest.main()
