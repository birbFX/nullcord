# NullCord voice, video and screen sharing

NullCord calls are relayed by **Jitsi** through the public
[`meet.element.io`](https://meet.element.io) deployment. Jitsi handles the
SFU, TURN, NAT traversal, audio/video and screen sharing, so calls work from
remote networks even though the NullCord host is behind CGNAT.

The NullCord call view is the official Jitsi IFrame API:

- call UI: `revite/src/pages/channels/voice/JitsiCall.tsx`
- call state: `revite/src/lib/vortex/VoiceState.ts`
- call button: `revite/src/pages/channels/actions/HeaderActions.tsx`
- call view replacement: `revite/src/pages/channels/Channel.tsx`

## How a call works

1. Clicking the phone icon calls `voiceState.connect(channel)`.
2. NullCord registers the caller with `POST /channels/:id/voice/join` and then
   opens a Jitsi room named `nullcord<channelId>` in the call view.
3. Jitsi joins the room with the user's display name.
4. For a DM or group, the API sends a `VoiceCallUpdate` event to the other
   recipients. Their client shows an **Incoming call** card and plays the ring
   sound.
5. Accepting the card joins the same Jitsi room. Declining dismisses the card.
6. The Jitsi toolbar provides microphone, camera, screen share, settings and
   the participant list.
7. Jitsi's `videoConferenceLeft` event closes the NullCord call view.

Because every participant opens the same deterministic room name, Jitsi does
the signalling and media relay. NullCord only tracks call presence for the
incoming-call ring and stale-session cleanup.

## Features

- incoming call card with caller name, ringtone, **Join** and **Decline**
- persistent in-call bar with participant count and call duration
- quick mute, camera, screen-share and leave buttons
- microphone, camera and screen share (Jitsi toolbar and NullCord bar)
- remote participants and audio/video through Jitsi's global SFU
- device selection in Jitsi settings
- hang-up synchronises back to NullCord
- 60-second presence heartbeat and automatic stale-call pruning
- works from remote networks without port forwarding, UPnP or a public IP

## Requirements

The browser must reach:

- `https://meet.element.io` (the app and `external_api.js`)
- Jitsi's media/TURN endpoints (HTTPS/WSS, TCP/UDP as configured by Jitsi)

No inbound ports are required on the NullCord host. `meet.element.io`
allows anonymous, embedded rooms; no Jitsi account is required.

## Incoming calls and presence

The API keeps a short-lived call record in Redis:

- `vc:<user>` — rooms the user has registered
- `vc_members:<channel>` — users currently registered in the call
- `vc_alive:<user>:<channel>` — 90-second presence heartbeat
- `p2p_peer:*` / `p2p_members:*` — legacy peer registry used by `/voice/peers`

While a call is open, the client POSTs `/channels/:id/voice/heartbeat` every
60 seconds. A member whose heartbeat has expired is pruned the next time the
call is read, so a crashed tab cannot keep a room "busy" forever. Closing the
tab also sends a best-effort `/voice/leave` from the `pagehide` handler.

Only DM and group recipients receive the ring event; server voice channels
still work, but they do not push a ring to every member of a large server.

## Privacy note

Media is relayed by Element's public Jitsi infrastructure. Jitsi uses
DTLS-SRTP between the browser and its SFU; the SFU can decrypt media because
it is an SFU. Do not use the public instance for content that must stay on
your own infrastructure.

To self-host, run Jitsi Meet (or another Jitsi deployment) on a public host
and change `JITSI_HOST` in `JitsiCall.tsx` to its domain. The embedded call
UI and room naming stay the same.

## Why not LiveKit/P2P?

- The host is behind CGNAT, so a self-hosted LiveKit SFU cannot receive
  inbound WebRTC media.
- Public free TURN relays (Open Relay/PeerJS TURN) are unreliable or retired.
- Jitsi's public deployment already provides working TURN/SFU relaying.

The backend still contains the legacy LiveKit and PeerJS/P2P code paths for
LAN or public-SFU deployments, but the web client uses Jitsi.

## Troubleshooting

| Symptom | Check |
|---|---|
| "Could not load the call relay" | `meet.element.io` blocked by network/VPN/firewall |
| Joined but no camera/mic | Browser permission; Jitsi toolbar settings |
| Incoming call card does not appear | Both users online; API/gateway reachable; check `/api/health` |
| Incoming card appears late or never | The caller's heartbeat is stale; retry after ~90 seconds |
| Another tab says the call is already open | Close the other call tab |
| Screen share black | Browser display-capture permission |
| Call view remains after hang-up | Click the NullCord phone/leave button |
| Audio blocked | Click inside the Jitsi frame, then unmute in its toolbar |

## Health checks

```bash
curl -s https://<your-admin-host>/api/health
curl -s https://<your-api-host>/
```

The admin Developer page probes the Jitsi relay alongside the API, gateway,
database and legacy LiveKit services.
