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
2. NullCord opens a Jitsi room named `nullcord-<channelId>` in the call view.
3. Jitsi joins the room with the user's display name.
4. The Jitsi toolbar provides microphone, camera, screen share, settings,
   participant list and hang-up.
5. Jitsi's `videoConferenceLeft` event closes the NullCord call view.

Because every participant opens the same deterministic room name, no
NullCord-side signalling or peer registry is needed.

## Features

- microphone, camera and screen share (Jitsi toolbar)
- remote participants and audio/video through Jitsi's global SFU
- device selection in Jitsi settings
- participant count in the NullCord overlay
- hang-up synchronises back to NullCord
- works from remote networks without port forwarding, UPnP or a public IP

## Requirements

The browser must reach:

- `https://meet.element.io` (the app and `external_api.js`)
- Jitsi's media/TURN endpoints (HTTPS/WSS, TCP/UDP as configured by Jitsi)

No inbound ports are required on the NullCord host. `meet.element.io`
allows anonymous, embedded rooms; no Jitsi account is required.

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
