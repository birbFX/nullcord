# NullCord voice, video and screen sharing

NullCord calls are **peer-to-peer WebRTC**. There is no Jitsi iframe and no
third-party media relay.

- The browser captures microphone/camera/screen tracks.
- Every participant connects directly to every other participant (mesh).
- SDP offers/answers and ICE candidates are relayed through the NullCord API
  and gateway (no media passes through the server).
- Public STUN servers are used for NAT address discovery.
- Public TURN relays are configured as a fallback for symmetric NAT/CGNAT.
  Media uses a relay only when a direct path cannot be established.

## Host / master role

The first participant to join is the **host**. Host is a coordination/UI role,
not a media hub:

- media keeps flowing directly between every pair of participants
- when the host leaves, the next participant by join time becomes host
- explicit leave updates the host immediately
- a crashed tab is pruned after the 45-second presence TTL

The API returns an ordered participant list and the current `master`; the
client shows a **Host** badge.

## Features

- direct WebRTC audio/video between participants
- camera grid with active speaker tiles
- multiple simultaneous screen shares (one per participant)
- host badge and automatic host failover
- quality tiers:
  - **Nitro:** up to 2560×1440 @ 60fps (8 Mbps)
  - **Basic / non-Nitro:** up to 1280×720 @ 30fps (2.5 Mbps)
- quality label in the call bar and server-authoritative tier lookup from
  `/users/@me/economy`
- mute, camera, screen share, leave
- incoming DM/group call card with ringtone
- 15-second presence heartbeat; explicit leave is immediate

The quality limits are applied by the official client's capture constraints
and sender bitrate caps. A modified client could ignore them; true server-side
enforcement would require a media server or a track-inspection bot.

## Signalling

`POST /channels/:id/voice/join`

- registers the browser peer id
- returns ordered members, peers and the current host

`POST /channels/:id/voice/signal`

- body: `{ "to": "<user id>", "data": { ... } }`
- only call members can be targeted
- payload is limited to 64 KiB
- the API publishes a user-targeted `VoiceSignal` gateway event

`POST /channels/:id/voice/heartbeat`

- keeps presence alive
- stale callers are pruned automatically

`POST /channels/:id/voice/leave`

- removes presence and broadcasts a leave event so the next host is elected

`GET /channels/:id/voice/peers`

- returns the current ordered participants and host

## NAT / network requirements

WebRTC needs a path between participants. This deployment uses public STUN
only:

- `stun.l.google.com:19302`
- `stun1.l.google.com:19302`

STUN handles many home networks. Symmetric NAT, CGNAT and some corporate
networks require TURN; NullCord ships with public TURN fallbacks. If those
public relays are blocked or rate-limited, the call shows:

> Direct P2P connection failed. Both users may be behind restrictive NAT; try
> a different network or mobile hotspot.

The NullCord host itself is behind CGNAT, so a call involving a browser on the
same network may also need the TURN fallback. Public relays are best-effort;
for dependable production relay capacity, add a dedicated Cloudflare Realtime
TURN, Metered, Twilio NTS or self-hosted coturn credential endpoint.

## Privacy

Direct media is sent between participants, so each participant can see the IP
addresses of the others (inherent to peer-to-peer WebRTC). When a TURN fallback
is used, the encrypted media is relayed by that TURN provider; the provider
cannot decrypt DTLS-SRTP. NullCord does not record or store calls.

## Troubleshooting

| Symptom | Check |
|---|---|
| No one connects | Both users online; restrictive NAT? Try a mobile hotspot |
| "Direct P2P connection failed" | TURN relays blocked/unreachable; check firewall UDP/TCP 3478, 80, 443 |
| No microphone | Browser permission; site must be HTTPS (or localhost) |
| No camera | Camera permission; another app may be using it |
| Screen share black | Browser display-capture permission |
| Host does not change | Wait up to 45s after a crash; explicit Leave is immediate |
| Call joins then drops | API/gateway reachable; check `/api/health` |
