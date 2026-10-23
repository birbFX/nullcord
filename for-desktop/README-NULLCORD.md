# NullCord Desktop

Source mirror of [stoatchat/for-desktop](https://github.com/stoatchat/for-desktop)
with NullCord RPC branding and environment configuration.

## RPC

The Electron main process enables Discord Rich Presence when both of these
environment variables are set before starting/building:

```bash
export NULLCORD_DISCORD_CLIENT_ID="your Discord application client id"
export NULLCORD_PUBLIC_URL="https://<your-nullcord-host>/"
```

Then:

```bash
pnpm install
pnpm start
```

The desktop settings expose the existing `discordRpc` toggle. RPC shows a
NullCord activity/button instead of the upstream Stoat presence.
