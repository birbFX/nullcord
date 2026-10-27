import EventEmitter from "eventemitter3";
import {
    ConnectionState,
    LocalTrackPublication,
    Participant,
    Room,
    RoomEvent,
    Track,
    VideoPresets,
} from "livekit-client";

import { useApplicationState } from "../../mobx/State";

import { ProduceType, VoiceError, VoiceUser } from "./Types";

interface VoiceEvents {
    ready: () => void;
    error: (error: Error) => void;
    close: (error?: VoiceError) => void;

    startProduce: (type: ProduceType) => void;
    stopProduce: (type: ProduceType) => void;

    userJoined: (userId: string) => void;
    userLeft: (userId: string) => void;

    userStartProduce: (userId: string, type: ProduceType) => void;
    userStopProduce: (userId: string, type: ProduceType) => void;
}

type VideoSource = "camera" | "screen";

function sourceType(source: Track.Source): ProduceType | undefined {
    switch (source) {
        case Track.Source.Microphone:
        case Track.Source.ScreenShareAudio:
            return "audio";
        case Track.Source.Camera:
            return "video";
        case Track.Source.ScreenShare:
            return "screen";
        default:
            return undefined;
    }
}

/**
 * LiveKit voice/video client.
 *
 * The old client spoke the mediasoup-based Vortex protocol. NullCord's
 * backend is Stoat, which uses LiveKit, so this class wraps the official
 * `livekit-client` SDK while keeping the small event surface the rest of the
 * app already consumes.
 */
export default class VoiceClient extends EventEmitter<VoiceEvents> {
    private _supported: boolean;
    private address?: string;
    private attachedAudio = new Map<string, HTMLMediaElement>();

    room: Room;

    isDeaf = false;
    userId?: string;
    roomId?: string;

    participants = new Map<string, VoiceUser>();

    audioProducer?: LocalTrackPublication;
    cameraPublication?: LocalTrackPublication;
    screenPublication?: LocalTrackPublication;

    constructor() {
        super();

        this._supported =
            typeof window !== "undefined" &&
            typeof window.RTCPeerConnection !== "undefined" &&
            !!navigator.mediaDevices?.getUserMedia;

        const audioDevice = window.localStorage.getItem("audioInputDevice");
        const videoDevice = window.localStorage.getItem("videoInputDevice");

        this.room = new Room({
            adaptiveStream: true,
            dynacast: true,
            audioCaptureDefaults: {
                ...(audioDevice ? { deviceId: audioDevice } : {}),
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
            videoCaptureDefaults: {
                ...(videoDevice ? { deviceId: videoDevice } : {}),
                resolution: VideoPresets.h720.resolution,
            },
        });

        this.room
            .on(RoomEvent.ParticipantConnected, (participant) => {
                this.sync();
                useApplicationState().settings.sounds.playSound("call_join");
                this.emit("userJoined", participant.identity);
            })
            .on(RoomEvent.ParticipantDisconnected, (participant) => {
                this.detachParticipantAudio(participant.identity);
                this.sync();
                useApplicationState().settings.sounds.playSound("call_leave");
                this.emit("userLeft", participant.identity);
            })
            .on(
                RoomEvent.TrackSubscribed,
                (track, publication, participant) => {
                    if (track.kind === Track.Kind.Audio) {
                        this.attachAudio(track, publication.trackSid, participant);
                    }

                    this.sync();

                    const type = sourceType(publication.source);
                    if (type)
                        this.emit("userStartProduce", participant.identity, type);
                },
            )
            .on(
                RoomEvent.TrackUnsubscribed,
                (track, publication, participant) => {
                    if (track.kind === Track.Kind.Audio) {
                        this.detachAudio(
                            audioKey(participant.identity, publication.trackSid),
                        );
                    }

                    this.sync();

                    const type = sourceType(publication.source);
                    if (type)
                        this.emit("userStopProduce", participant.identity, type);
                },
            )
            .on(RoomEvent.TrackMuted, () => this.sync())
            .on(RoomEvent.TrackUnmuted, () => this.sync())
            .on(RoomEvent.LocalTrackPublished, (publication) => {
                this.trackLocalPublication(publication);
                this.sync();
                const type = sourceType(publication.source);
                if (type) this.emit("startProduce", type);
            })
            .on(RoomEvent.LocalTrackUnpublished, (publication) => {
                this.trackLocalPublication(publication, true);
                this.sync();
                const type = sourceType(publication.source);
                if (type) this.emit("stopProduce", type);
            })
            .on(RoomEvent.ActiveSpeakersChanged, () => this.sync())
            .on(RoomEvent.Disconnected, () => {
                if (this.roomId) this.disconnect(undefined, true);
            })
            .on(RoomEvent.TrackSubscriptionFailed, (_sid, participant) => {
                console.warn(
                    `Could not subscribe to ${participant?.identity ?? "unknown"}'s track`,
                );
            })
            .on(RoomEvent.MediaDevicesError, (error) => {
                this.emit("error", error);
            });
    }

    private trackLocalPublication(
        publication: LocalTrackPublication,
        removed = false,
    ) {
        switch (publication.source) {
            case Track.Source.Microphone:
                this.audioProducer = removed ? undefined : publication;
                break;
            case Track.Source.Camera:
                this.cameraPublication = removed ? undefined : publication;
                break;
            case Track.Source.ScreenShare:
                this.screenPublication = removed ? undefined : publication;
                break;
        }
    }

    private attachAudio(
        track: Track,
        sid: string,
        participant: Participant,
    ) {
        const key = audioKey(participant.identity, sid);
        if (this.attachedAudio.has(key)) return;

        const element = track.attach() as HTMLMediaElement;
        element.autoplay = true;
        element.style.display = "none";
        element.muted = this.isDeaf;
        document.body.appendChild(element);
        this.attachedAudio.set(key, element);
    }

    private detachAudio(key: string) {
        const element = this.attachedAudio.get(key);
        if (!element) return;
        element.pause();
        element.srcObject = null;
        element.remove();
        this.attachedAudio.delete(key);
    }

    private detachParticipantAudio(identity: string) {
        for (const key of [...this.attachedAudio.keys()]) {
            if (key.startsWith(`${identity}:`)) this.detachAudio(key);
        }
    }

    private detachAllAudio() {
        for (const key of [...this.attachedAudio.keys()]) this.detachAudio(key);
    }

    private stateFor(participant: Participant): VoiceUser {
        let audio = false;
        let video = false;
        let screen = false;

        for (const publication of participant.getTrackPublications()) {
            if (publication.isMuted || !publication.track) continue;
            switch (publication.source) {
                case Track.Source.Microphone:
                case Track.Source.ScreenShareAudio:
                    audio = true;
                    break;
                case Track.Source.Camera:
                    video = true;
                    break;
                case Track.Source.ScreenShare:
                    screen = true;
                    break;
            }
        }

        return {
            audio,
            video,
            screen,
            speaking: participant.isSpeaking,
        };
    }

    private sync() {
        const participants = new Map<string, VoiceUser>();
        const local = this.room.localParticipant;

        if (local?.identity) {
            participants.set(local.identity, this.stateFor(local));
        }

        this.room.remoteParticipants.forEach((participant) => {
            participants.set(participant.identity, this.stateFor(participant));
        });

        this.participants = participants;
    }

    supported() {
        return this._supported;
    }

    async connect(address: string, roomId: string) {
        this.address = address.replace(/^http/, "ws");
        this.roomId = roomId;
    }

    async authenticate(token: string) {
        if (!this.address) throw new ReferenceError("Voice client is not configured");
        if (!this.roomId) throw new ReferenceError("Voice client has no room");

        await this.room.connect(this.address, token, {
            autoSubscribe: true,
        });

        this.userId = this.room.localParticipant.identity;

        try {
            await this.room.startAudio();
        } catch {
            // Autoplay can still be blocked on strict browsers. The call UI
            // calls startAudio again from a user gesture when needed.
        }

        this.sync();
    }

    async initializeTransports() {
        this.emit("ready");
    }

    disconnect(error?: VoiceError, ignoreDisconnected = false) {
        if (
            !ignoreDisconnected &&
            this.room.state === ConnectionState.Disconnected
        )
            return;

        this.detachAllAudio();
        void this.room.disconnect();

        this.participants = new Map();
        this.userId = undefined;
        this.roomId = undefined;

        this.audioProducer = undefined;
        this.cameraPublication = undefined;
        this.screenPublication = undefined;

        this.emit("close", error);
    }

    setDeafened(deaf: boolean) {
        this.isDeaf = deaf;
        this.attachedAudio.forEach((element) => {
            element.muted = deaf;
        });

        this.room.remoteParticipants.forEach((participant) => {
            participant.getTrackPublications().forEach((publication) => {
                const track = publication.audioTrack;
                if (track) track.setVolume(deaf ? 0 : 1);
            });
        });

        this.sync();
    }

    async startProduce(track: MediaStreamTrack, type: ProduceType) {
        switch (type) {
            case "audio": {
                if (this.audioProducer) return;
                this.audioProducer =
                    await this.room.localParticipant.publishTrack(track, {
                        source: Track.Source.Microphone,
                    });
                break;
            }
            case "video":
                await this.startCamera();
                break;
            case "screen":
                await this.startScreenShare();
                break;
        }

        this.sync();
        this.emit("startProduce", type);
    }

    async stopProduce(type: ProduceType) {
        switch (type) {
            case "audio": {
                await this.room.localParticipant
                    .setMicrophoneEnabled(false)
                    .catch(() => undefined);
                this.audioProducer = undefined;
                break;
            }
            case "video":
                await this.stopCamera();
                return;
            case "screen":
                await this.stopScreenShare();
                return;
        }

        this.sync();
        this.emit("stopProduce", type);
    }

    async startCamera() {
        try {
            this.cameraPublication =
                await this.room.localParticipant.setCameraEnabled(
                    true,
                    this.room.options.videoCaptureDefaults,
                );
            this.sync();
            this.emit("startProduce", "video");
        } catch (error) {
            this.emit("error", error as Error);
            throw error;
        }
    }

    async stopCamera() {
        await this.room.localParticipant
            .setCameraEnabled(false)
            .catch(() => undefined);
        this.cameraPublication = undefined;
        this.sync();
        this.emit("stopProduce", "video");
    }

    async startScreenShare() {
        try {
            try {
                this.screenPublication =
                    await this.room.localParticipant.setScreenShareEnabled(
                        true,
                        { audio: true },
                    );
            } catch {
                // Some browsers cannot capture tab audio; share video only.
                this.screenPublication =
                    await this.room.localParticipant.setScreenShareEnabled(
                        true,
                        { audio: false },
                    );
            }
            this.sync();
            this.emit("startProduce", "screen");
        } catch (error) {
            this.emit("error", error as Error);
            throw error;
        }
    }

    async stopScreenShare() {
        await this.room.localParticipant
            .setScreenShareEnabled(false)
            .catch(() => undefined);
        this.screenPublication = undefined;
        this.sync();
        this.emit("stopProduce", "screen");
    }

    getVideoTrack(identity: string, source: VideoSource) {
        const trackSource =
            source === "camera" ? Track.Source.Camera : Track.Source.ScreenShare;

        if (identity === this.userId) {
            return this.room.localParticipant.getTrackPublication(trackSource)
                ?.videoTrack;
        }

        return this.room.remoteParticipants
            .get(identity)
            ?.getTrackPublication(trackSource)?.videoTrack;
    }

    async startAudioPlayback() {
        try {
            await this.room.startAudio();
        } catch {
            this.emit(
                "error",
                new Error("Tap the call to enable audio playback."),
            );
        }
    }

    async switchDevice(kind: MediaDeviceKind, deviceId: string) {
        if (!deviceId) return;
        try {
            await this.room.switchActiveDevice(kind, deviceId);
        } catch (error) {
            // No active track for that kind yet; the stored preference is
            // picked up when the device is first used.
            console.warn("Could not switch device:", error);
        }
    }
}

function audioKey(identity: string, sid: string) {
    return `${identity}:${sid}`;
}
