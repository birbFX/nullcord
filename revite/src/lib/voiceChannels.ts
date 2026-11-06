import { action, observable } from "mobx";
import { Channel, Server } from "revolt.js";

/**
 * Voice channel tracking.
 *
 * The Stoat backend models a server voice channel as a TextChannel with a
 * `voice` object, but revolt.js drops that field. We record it from raw
 * gateway packets (and a one-off server fetch as a fallback) so the UI can
 * treat those channels as voice channels.
 */
const voiceIds = observable.set<string>();
const syncedServers = new Set<string>();

type RawChannel = { _id: string; voice?: unknown };

const record = action((raw: RawChannel) => {
    if (!raw?._id) return;
    if (raw.voice) voiceIds.add(raw._id);
    else voiceIds.delete(raw._id);
});

export function isVoiceChannel(channel?: Channel | null) {
    if (!channel) return false;
    return (
        channel.channel_type === "VoiceChannel" ||
        (channel.channel_type === "TextChannel" && voiceIds.has(channel._id))
    );
}

export const onVoicePacket = action((packet: Record<string, any>) => {
    switch (packet.type) {
        case "Ready":
            (packet.channels as RawChannel[] | undefined)?.forEach(record);
            break;
        case "ChannelCreate":
            record(packet as RawChannel);
            break;
        case "ChannelUpdate":
            if (packet.data?.voice) voiceIds.add(packet.id);
            if ((packet.clear as string[] | undefined)?.includes("Voice")) {
                voiceIds.delete(packet.id);
            }
            break;
        case "ChannelDelete":
            voiceIds.delete(packet.id);
            break;
    }
});

/**
 * Fetch a server's channels once per session to learn which are voice
 * channels, in case the Ready packet arrived before we were listening.
 */
export async function syncServerVoiceChannels(server: Server) {
    if (syncedServers.has(server._id)) return;
    syncedServers.add(server._id);

    try {
        const api = server.client.api as unknown as {
            get: (path: string, params?: unknown) => Promise<unknown>;
        };
        const data = (await api.get(`/servers/${server._id}`, {
            include_channels: true,
        })) as { channels?: (RawChannel | string)[] };

        for (const entry of data.channels ?? []) {
            if (typeof entry === "object") record(entry);
        }
    } catch {
        syncedServers.delete(server._id);
    }
}
