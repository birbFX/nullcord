# `nullcord_compat`

Small discord.py compatibility layer used by the NullCord bridge.

It provides:

- `components.py` — renders `discord.ui.Select` and `discord.ui.Button` children into a JSON component list.
- `registry.py` — keeps `custom_id → (live View, item)` bindings.
- `interaction.py` — constructs a real `discord.Interaction` subclass when discord.py is available, with:
  - `type == discord.InteractionType.component`
  - `response.edit_message(...)`
  - `edit_original_response(...)`
  - `.message`, `.user`, `.data`
- `hook.py` — the hook entry points:
  - `hook_message_kwargs(kwargs, view)`
  - `register_view(view, message_id=..., channel_id=...)`
  - `handle_component_interaction(payload, bridge)`
- `bridge.py` — transport-neutral adapter; feed it NullCord's send/edit functions and component payloads.

## Integration

```python
from nullcord_compat import NullCordComponentBridge

bridge = NullCordComponentBridge(
    send_message=nullcord_send_message,
    edit_message=nullcord_edit_message,
)

# Sending a message with AxHelpView:
payload = bridge.message_kwargs({"embeds": [embed]}, view)
message = await nullcord_send_message(channel_id, payload)
bridge.register_view(
    view,
    message_id=message["id"],
    channel_id=channel_id,
    owner_id=ctx.author.id,
)

# When NullCord delivers a component click/select:
await bridge.on_component_event(interaction_payload)
```

The bridge callback contract is:

```python
api_send_message(channel_id, payload) -> message dict
api_edit_message(channel_id, message_id, payload) -> message dict
```

`payload` contains `content`, `embeds`, and/or `components`.

## Notes

- Select values are assigned to the original `Select.values` before the callback runs.
- The registry points at the live view instance, so `_on_home`, `_on_prev`,
  `_on_next`, and `_on_select` mutate the same `AxHelpView`.
- The transport is intentionally not implemented here. Wire `on_component_event`
  to the NullCord gateway/HTTP interaction event.
- Run tests with:

```bash
cd bot
python3 -m unittest discover -s nullcord_compat/tests -v
```
