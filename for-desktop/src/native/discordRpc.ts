import { Client } from "discord-rpc";

import { config } from "./config";

// internal state
let rpc: Client;

export async function initDiscordRpc() {
  if (!config.discordRpc) return;

  // clean up existing client if one exists
  rpc?.removeAllListeners();

  try {
    rpc = new Client({ transport: "ipc" });

    rpc.on("ready", () =>
      rpc.setActivity({
        state: "NullCord",
        details: "Chatting on NullCord",
        largeImageKey: "qr",
        largeImageText: "Join NullCord!",
        buttons: [
          {
            label: "Open NullCord",
            url: process.env.NULLCORD_PUBLIC_URL || "https://nullcord.example/",
          },
        ],
      }),
    );

    rpc.on("disconnected", reconnect);

    rpc.login({ clientId: process.env.NULLCORD_DISCORD_CLIENT_ID || "" });
  } catch (err) {
    reconnect();
  }
}

const reconnect = () => setTimeout(() => initDiscordRpc(), 1e4);

export async function destroyDiscordRpc() {
  rpc?.destroy();
}
