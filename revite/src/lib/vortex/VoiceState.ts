import { action, makeAutoObservable, runInAction } from "mobx";
import { Channel, Nullable } from "revolt.js";

import { modalController } from "../../controllers/modals/ModalController";

export enum VoiceStatus {
    LOADING = 0,
    UNAVAILABLE,
    ERRORED,
    READY = 3,
    CONNECTING = 4,
    UNLOADED = 5,
    AUTHENTICATING,
    RTC_CONNECTING,
    CONNECTED,
}

/**
 * Call state for the Jitsi-relayed voice room.
 *
 * Media, screen sharing and NAT traversal are handled by Jitsi's public
 * infrastructure (meet.element.io). NullCord only tracks whether the call
 * view is open and how many people Jitsi reports in the room.
 */
class VoiceStateReference {
    connecting?: boolean;
    error?: string;

    status: VoiceStatus;
    roomId: Nullable<string>;
    participants: Map<string, Record<string, never>>;
    participantCount = 0;

    private selfId?: string;
    private supported = false;
    private clientChannel?: Channel;
    private heartbeat?: number;
    private unloadHandler?: () => void;

    constructor() {
        this.roomId = null;
        this.status = VoiceStatus.UNLOADED;
        this.participants = new Map();

        this.syncState = this.syncState.bind(this);
        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);

        makeAutoObservable(this, {
            connecting: false,
            supported: false,
            selfId: false,
            clientChannel: false,
            heartbeat: false,
            unloadHandler: false,
        });
    }

    @action syncState() {
        this.participantCount = Math.max(1, this.participantCount);
    }

    @action async loadVoice() {
        if (this.status !== VoiceStatus.UNLOADED) return;

        this.supported =
            typeof window !== "undefined" &&
            typeof window.RTCPeerConnection !== "undefined";

        runInAction(() => {
            this.status = this.supported
                ? VoiceStatus.READY
                : VoiceStatus.UNAVAILABLE;
        });

        if (!this.supported) {
            this.error =
                "This browser cannot make calls (WebRTC is unavailable).";
            modalController.push({ type: "error", error: this.error });
        }
    }

    @action async connect(channel: Channel) {
        if (!this.supported) await this.loadVoice();
        if (!this.supported) {
            this.error =
                "This browser cannot make calls (WebRTC is unavailable).";
            modalController.push({ type: "error", error: this.error });
            return channel;
        }

        if (this.roomId === channel._id) return channel;

        this.disconnect();
        this.error = undefined;
        this.selfId = channel.client.user?._id;
        this.clientChannel = channel;

        // Register the call so other DM/group recipients receive the
        // VoiceCallUpdate ring event. Jitsi handles the media itself, so a
        // failure here must not prevent the call from opening.
        try {
            const api = channel.client.api as unknown as {
                post: (
                    path: string,
                    params?: unknown,
                    config?: { data?: unknown },
                ) => Promise<unknown>;
            };
            await api.post(
                `/channels/${channel._id}/voice/join`,
                undefined,
                {
                    data: {
                        peer_id: `jitsi-${Date.now().toString(36)}${Math.random()
                            .toString(36)
                            .slice(2, 8)}`,
                    },
                },
            );
        } catch (err) {
            console.warn("Could not register the call for ringing:", err);
        }

        this.roomId = channel._id;
        this.participantCount = 1;
        this.participants = new Map(
            this.selfId ? [[this.selfId, {}]] : [],
        );
        this.status = VoiceStatus.CONNECTED;
        this.connecting = false;
        this.startHeartbeat(channel);

        return channel;
    }

    private startHeartbeat(channel: Channel) {
        this.stopHeartbeat();
        const api = channel.client.api as unknown as {
            post: (path: string) => Promise<unknown>;
        };

        this.heartbeat = window.setInterval(() => {
            void api
                .post(`/channels/${channel._id}/voice/heartbeat`)
                .catch(() => undefined);
        }, 60_000);

        const session = (channel.client as unknown as {
            session?: { token?: string } | string;
        }).session;
        const token =
            typeof session === "string" ? session : session?.token;
        const baseURL = (channel.client.api as unknown as { baseURL?: string })
            .baseURL;

        if (token && baseURL) {
            this.unloadHandler = () => {
                fetch(`${baseURL}/channels/${channel._id}/voice/leave`, {
                    method: "POST",
                    headers: { "x-session-token": token },
                    keepalive: true,
                }).catch(() => undefined);
            };
            window.addEventListener("pagehide", this.unloadHandler);
        }
    }

    private stopHeartbeat() {
        if (this.heartbeat !== undefined) {
            window.clearInterval(this.heartbeat);
            this.heartbeat = undefined;
        }
        if (this.unloadHandler) {
            window.removeEventListener("pagehide", this.unloadHandler);
            this.unloadHandler = undefined;
        }
    }

    @action disconnect() {
        this.stopHeartbeat();
        const roomId = this.roomId;
        const channel = this.clientChannel;

        if (roomId && channel) {
            try {
                const api = channel.client.api as unknown as {
                    post: (path: string) => Promise<unknown>;
                };
                void api
                    .post(`/channels/${roomId}/voice/leave`)
                    .catch(() => undefined);
            } catch {
                // best effort cleanup
            }
        }

        this.connecting = false;
        this.status = this.supported
            ? VoiceStatus.READY
            : VoiceStatus.UNLOADED;
        this.roomId = null;
        this.participants = new Map();
        this.participantCount = 0;
        this.clientChannel = undefined;
    }

    @action setParticipantCount(count: number) {
        this.participantCount = Math.max(1, count);
        const next = new Map<string, Record<string, never>>();
        if (this.selfId) next.set(this.selfId, {});
        for (let i = 1; i < this.participantCount; i += 1) {
            next.set(`remote-${i}`, {});
        }
        this.participants = next;
    }

    isProducing(_type: "audio" | "video" | "screen") {
        // Jitsi owns the media tracks and its own mute/camera controls.
        return false;
    }

    isDeaf() {
        return false;
    }

    async startAudioPlayback() {
        // Jitsi handles audio playback inside its iframe.
    }

    async switchDevice(_kind: MediaDeviceKind, _deviceId: string) {
        // Use Jitsi's own device settings inside the call.
    }

    async startDeafen() {}
    async stopDeafen() {}
    async startProducing(_type: "audio" | "video" | "screen") {}
    async stopProducing(_type: "audio" | "video" | "screen") {}
}

export const voiceState = new VoiceStateReference();
