# NullCord voice, video and screen sharing

NullCord uses [LiveKit](https://livekit.io/) as its SFU. The Rust API mints a
short-lived LiveKit JWT, the browser connects with the official
`livekit-client` SDK, and `revolt-voice-ingress` receives LiveKit webhooks so
channel voice state, call system messages and permissions stay in sync.

## Components

| Component | Port | Purpose |
|---|---|---|
| `revolt-delta` | `14702` | `POST /channels/:id/join_call` mints the room token |
| LiveKit | `7880` | HTTP + WebSocket signalling (`/rtc`) |
| LiveKit | `7881` | WebRTC ICE/TCP fallback |
| LiveKit | `50000-50015` | WebRTC UDP media (muxed range) |
| `revolt-voice-ingress` | `8500` | LiveKit webhook receiver (`/worldwide`) |
| Cloudflare tunnel | `443` | Public `wss://nullcord-livekit...` signalling |

The client features live in:

- `revite/src/lib/vortex/VoiceClient.ts` — LiveKit wrapper (audio, camera,
  screen share, deafen, device switching)
- `revite/src/lib/vortex/VoiceState.ts` — MobX state and call lifecycle
- `revite/src/pages/channels/voice/VoiceHeader.tsx` — call UI and video grid

## Required configuration

`stoat-backend/livekit.yml`:

```yaml
port: 7880
rtc:
  udp_port: 50000-50015
  tcp_port: 7881
webhook:
  api_key: worldwide
  urls:
    - http://localhost:8500/worldwide
keys:
  worldwide: <same secret as Revolt.toml>
```

`stoat-backend/Revolt.toml`:

```toml
[hosts.livekit]
worldwide = "wss://your-livekit-host"

[api.livekit.nodes.worldwide]
url = "http://127.0.0.1:7880"
key = "worldwide"
secret = "<same secret as livekit.yml>"
```

The key/secret pair **must match**. A mismatch produces
`could not validate token` / `401` on `/rtc/validate`.

## NAT and CGNAT

Signalling always works through the Cloudflare tunnel because it is ordinary
HTTPS/WebSocket. Media is WebRTC and needs a route to the RTC ports:

- **Same LAN:** works out of the box. LiveKit advertises its LAN address
  (`192.168.x.x`) and browsers on the LAN connect directly.
- **Public internet, public IP / forwarded ports:** forward UDP
  `50000-50015` and TCP `7881` to the host and set
  `rtc.use_external_ip: true` in `livekit.yml`.
- **Carrier-grade NAT / double NAT:** inbound forwarding is not possible.
  Use one of:
  1. a small public VPS running LiveKit (recommended, then point
     `Revolt.toml` at it and `hosts.livekit` at its public URL);
  2. a TURN/TLS server with a public address, or a paid TCP tunnel that can
     expose a fixed port;
  3. a LAN/VPN deployment for participants.

The current Canyon Lake Labs line is behind CGNAT, so LAN calls work and
remote participants need one of the options above. LiveKit still gathers
STUN candidates, but those mappings are not reachable from the internet.

## Health checks

```bash
curl -s http://127.0.0.1:14702/            # API config
curl -s http://127.0.0.1:7880/             # LiveKit
ss -ltnp | grep -E ':(14702|7880|7881|8500)'
docker logs --tail 50 stoat-backend-livekit-1
tail -f stoat-backend/logs/revolt-voice-ingress.log
```

The admin panel exposes the same checks at `/panel/dev` and an unauthenticated
JSON probe at `/api/health`.

## Troubleshooting

| Symptom | Check |
|---|---|
| "RTC is unavailable" | Browser has no `RTCPeerConnection` / `getUserMedia` |
| Call button does nothing | `revolt-voice-ingress` is running on `8500` |
| Connects then no audio | Autoplay blocked; click the call area to unlock audio |
| Camera/screen button errors | Browser permission; token must include `canPublishSources` |
| Remote users cannot connect | RTC ports unreachable (CGNAT) — see above |
| `401` on camera publish | Re-join the call; tokens expire after 10 seconds |
