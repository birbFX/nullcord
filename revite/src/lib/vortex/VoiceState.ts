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
        this.roomId = channel._id;
        this.participantCount = 1;
        this.participants = new Map(
            this.selfId ? [[this.selfId, {}]] : [],
        );
        this.status = VoiceStatus.CONNECTED;
        this.connecting = false;

        return channel;
    }

    @action disconnect() {
        this.connecting = false;
        this.status = this.supported
            ? VoiceStatus.READY
            : VoiceStatus.UNLOADED;
        this.roomId = null;
        this.participants = new Map();
        this.participantCount = 0;
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
