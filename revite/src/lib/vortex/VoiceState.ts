import { action, makeAutoObservable, runInAction } from "mobx";
import { Channel, Nullable, toNullable } from "revolt.js";

import { takeError } from "../../controllers/client/jsx/error";
import { modalController } from "../../controllers/modals/ModalController";

import type { ProduceType, VoiceUser } from "./Types";
import type VoiceClient from "./VoiceClient";

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
    // RECONNECTING
}

/**
 * MobX-facing state for the LiveKit voice client.
 */
class VoiceStateReference {
    client?: VoiceClient;
    connecting?: boolean;
    error?: string;

    status: VoiceStatus;
    roomId: Nullable<string>;
    participants: Map<string, VoiceUser>;

    constructor() {
        this.roomId = null;
        this.status = VoiceStatus.UNLOADED;
        this.participants = new Map();

        this.syncState = this.syncState.bind(this);
        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);

        makeAutoObservable(this, {
            client: false,
            connecting: false,
        });
    }

    @action syncState() {
        if (!this.client) return;
        this.roomId = toNullable(this.client.roomId);
        this.participants.clear();
        this.client.participants.forEach((v, k) => this.participants.set(k, v));
    }

    @action async loadVoice() {
        if (this.status !== VoiceStatus.UNLOADED) return;
        this.status = VoiceStatus.LOADING;

        try {
            const { default: VoiceClient } = await import("./VoiceClient");
            const client = new VoiceClient();

            client.on("startProduce", this.syncState);
            client.on("stopProduce", this.syncState);
            client.on("userJoined", this.syncState);
            client.on("userLeft", this.syncState);
            client.on("userStartProduce", this.syncState);
            client.on("userStopProduce", this.syncState);
            client.on("close", () => {
                runInAction(() => {
                    this.connecting = false;
                    this.status =
                        this.status === VoiceStatus.UNAVAILABLE
                            ? VoiceStatus.UNAVAILABLE
                            : VoiceStatus.READY;
                    this.roomId = null;
                    this.participants.clear();
                });
            });
            client.on("error", (error) => {
                console.error("Voice error:", error);
                runInAction(() => {
                    this.error = error.message;
                });
            });

            runInAction(() => {
                if (!client.supported()) {
                    this.status = VoiceStatus.UNAVAILABLE;
                } else {
                    this.status = VoiceStatus.READY;
                    this.client = client;
                }
            });
        } catch (err) {
            console.error("Failed to load voice library!", err);
            runInAction(() => {
                this.status = VoiceStatus.UNAVAILABLE;
                this.error =
                    "Voice failed to load. Reload the page and try again.";
            });
            modalController.push({
                type: "error",
                error: "Voice failed to load. Reload the page and try again.",
            });
        }
    }

    @action async connect(channel: Channel) {
        if (!this.client) await this.loadVoice();
        if (!this.client?.supported()) {
            this.error =
                "This browser cannot make calls (WebRTC is unavailable).";
            modalController.push({
                type: "error",
                error: this.error,
            });
            return channel;
        }

        if (
            this.roomId === channel._id &&
            this.status === VoiceStatus.CONNECTED
        )
            return channel;

        if (this.roomId) this.disconnect();

        this.connecting = true;
        this.error = undefined;
        this.status = VoiceStatus.CONNECTING;

        try {
            const call = await channel.joinCall();

            await this.client.connect(call.url, channel._id);
            runInAction(() => {
                this.roomId = channel._id;
                this.status = VoiceStatus.AUTHENTICATING;
            });

            await this.client.authenticate(call.token);
            this.syncState();

            runInAction(() => {
                this.status = VoiceStatus.RTC_CONNECTING;
            });

            await this.client.initializeTransports();

            runInAction(() => {
                this.status = VoiceStatus.CONNECTED;
                this.connecting = false;
            });
        } catch (err) {
            console.error("Failed to join voice channel:", err);
            const raw = takeError(err);
            const message =
                raw === "AlreadyConnected"
                    ? "You are already in a call. Leave it and try again."
                    : raw === "NetworkError"
                      ? "Could not reach the voice server. Check your connection."
                      : raw;

            runInAction(() => {
                this.status = VoiceStatus.READY;
                this.connecting = false;
                this.error = message;
            });

            modalController.push({
                type: "error",
                error: message,
            });

            try {
                this.client.disconnect();
            } catch {
                // already closed
            }
        }

        this.syncState();
        return channel;
    }

    @action disconnect() {
        this.connecting = false;
        this.status = this.client ? VoiceStatus.READY : VoiceStatus.UNLOADED;

        this.client?.disconnect();
        this.syncState();
    }

    isProducing(type: ProduceType) {
        switch (type) {
            case "audio":
                return this.client?.audioProducer !== undefined;
            case "video":
                return this.client?.cameraPublication !== undefined;
            case "screen":
                return this.client?.screenPublication !== undefined;
        }
    }

    isDeaf() {
        if (!this.client) return false;
        return this.client.isDeaf;
    }

    getVideoTrack(identity: string, source: "camera" | "screen") {
        return this.client?.getVideoTrack(identity, source);
    }

    async startAudioPlayback() {
        await this.client?.startAudioPlayback();
    }

    async switchDevice(kind: MediaDeviceKind, deviceId: string) {
        await this.client?.switchDevice(kind, deviceId);
    }

    async startDeafen() {
        if (!this.client) return;
        if (this.client.isDeaf) return;
        this.client.setDeafened(true);
        this.syncState();
    }

    async stopDeafen() {
        if (!this.client) return;
        if (!this.client.isDeaf) return;
        this.client.setDeafened(false);
        this.syncState();
    }

    async startProducing(type: ProduceType) {
        if (!this.client) return;

        try {
            switch (type) {
                case "audio": {
                    if (this.client.audioProducer !== undefined) return;

                    if (navigator.mediaDevices === undefined)
                        throw new Error("No media devices.");

                    const mediaDevice =
                        window.localStorage.getItem("audioInputDevice");

                    const mediaStream =
                        await navigator.mediaDevices.getUserMedia({
                            audio: mediaDevice
                                ? { deviceId: mediaDevice }
                                : true,
                        });

                    await this.client.startProduce(
                        mediaStream.getAudioTracks()[0],
                        "audio",
                    );
                    break;
                }
                case "video":
                    await this.client.startCamera();
                    break;
                case "screen":
                    await this.client.startScreenShare();
                    break;
            }
        } catch (err) {
            console.error("Failed to start producing:", err);
            runInAction(() => {
                this.error = err instanceof Error ? err.message : String(err);
            });
        }

        this.syncState();
    }

    async stopProducing(type: ProduceType) {
        if (!this.client) return;

        switch (type) {
            case "audio":
                await this.client.stopProduce("audio");
                break;
            case "video":
                await this.client.stopCamera();
                break;
            case "screen":
                await this.client.stopScreenShare();
                break;
        }

        this.syncState();
    }
}

export const voiceState = new VoiceStateReference();
