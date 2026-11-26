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

type Tier = "nitro" | "basic" | "none";
type ProduceType = "audio" | "video" | "screen";

interface VoicePeer {
    user_id: string;
    peer_id: string;
    joined_at?: string;
}

interface VoicePeersResponse {
    members: string[];
    peers: VoicePeer[];
    master?: string;
}

interface VoiceApi {
    get: (path: string, params?: unknown) => Promise<any>;
    post: (
        path: string,
        params?: unknown,
        config?: { data?: unknown },
    ) => Promise<any>;
}

interface PeerState {
    userId: string;
    pc: RTCPeerConnection;
    polite: boolean;
    makingOffer: boolean;
    ignoreOffer: boolean;
    settingRemoteAnswer: boolean;
    expectScreen: boolean;
    audioEl: HTMLAudioElement;
    screenAudioEl: HTMLAudioElement;
    failed: boolean;
}

const STUN_SERVERS: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // TURN fallback for symmetric NAT / CGNAT. This is an external relay, but
    // without it a large share of real-world peer pairs cannot connect.
    {
        urls: [
            "turn:openrelay.metered.ca:80",
            "turn:openrelay.metered.ca:443",
            "turn:openrelay.metered.ca:443?transport=tcp",
        ],
        username: "openrelayproject",
        credential: "openrelayproject",
    },
    // PeerJS maintains a shared public TURN relay. It is rate-limited, but it
    // gives restrictive NATs a second path when Open Relay is unavailable.
    {
        urls: [
            "turn:eu-0.turn.peerjs.com:3478",
            "turn:us-0.turn.peerjs.com:3478",
        ],
        username: "peerjs",
        credential: "peerjsp",
    },
];

function randomPeerId() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return `p2p-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Peer-to-peer voice/video.
 *
 * Signalling goes through the NullCord API/gateway; media is direct WebRTC
 * between participants. The first participant is the host; the host role
 * moves to the next participant by join time when the host leaves. Media does
 * not depend on the host, so a host disconnect does not interrupt existing
 * peer connections.
 */
class VoiceStateReference {
    connecting?: boolean;
    error?: string;

    status: VoiceStatus;
    roomId: Nullable<string>;
    participantCount = 0;
    masterId?: string;

    peers = new Map<string, VoicePeer>();
    peerConnections = new Map<string, PeerState>();
    remoteStreams = new Map<string, MediaStream>();
    remoteScreens = new Map<string, MediaStream>();
    audioElements: HTMLAudioElement[] = [];

    localStream?: MediaStream;
    localScreen?: MediaStream;
    mediaVersion = 0;

    muted = true;
    cameraEnabled = false;
    sharing = false;
    deafened = false;
    chatOpen = true;
    tier: Tier = "none";

    private selfId?: string;
    private supported = false;
    private clientChannel?: Channel;
    private heartbeat?: number;
    private refreshTimer?: number;
    private packetHandler?: (packet: any) => void;
    private unloadHandler?: () => void;
    private audioUnlockHandler?: () => void;

    constructor() {
        this.roomId = null;
        this.status = VoiceStatus.UNLOADED;

        this.syncState = this.syncState.bind(this);
        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);

        makeAutoObservable(this, {
            connecting: false,
            supported: false,
            selfId: false,
            clientChannel: false,
            heartbeat: false,
            refreshTimer: false,
            packetHandler: false,
            unloadHandler: false,
            audioUnlockHandler: false,
            peerConnections: false,
            remoteStreams: false,
            remoteScreens: false,
            localStream: false,
            localScreen: false,
            audioElements: false,
        });
    }

    @action syncState() {
        this.participantCount = Math.max(1, this.participantCount);
    }

    get isHost() {
        return !!this.selfId && this.masterId === this.selfId;
    }

    get tierLabel() {
        return this.tier === "nitro"
            ? "Nitro · 1440p60"
            : this.tier === "basic"
              ? "Basic · 720p30"
              : "720p30";
    }

    get remoteParticipants() {
        // Read the observable version so MobX re-renders when streams change.
        void this.mediaVersion;

        const list: {
            userId: string;
            stream: MediaStream;
            screen: boolean;
        }[] = [];

        for (const [userId, stream] of this.remoteStreams) {
            list.push({ userId, stream, screen: false });
        }
        for (const [userId, stream] of this.remoteScreens) {
            list.push({ userId, stream, screen: true });
        }

        return list;
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

    private api(channel: Channel): VoiceApi {
        return channel.client.api as unknown as VoiceApi;
    }

    private videoConstraints(): MediaTrackConstraints {
        const high = this.tier === "nitro";
        return {
            width: { max: high ? 2560 : 1280, ideal: high ? 2560 : 1280 },
            height: { max: high ? 1440 : 720, ideal: high ? 1440 : 720 },
            frameRate: { max: high ? 60 : 30, ideal: high ? 60 : 30 },
        };
    }

    private maxBitrate() {
        return this.tier === "nitro" ? 8_000_000 : 2_500_000;
    }

    private async fetchTier(api: VoiceApi): Promise<Tier> {
        try {
            const economy = await api.get("/users/@me/economy");
            if (economy?.nitro === "nitro") return "nitro";
            if (economy?.nitro === "basic") return "basic";
        } catch {
            // Economy is optional; fall back to the free limits.
        }
        return "none";
    }

    @action async connect(channel: Channel) {
        if (!this.supported) await this.loadVoice();
        if (!this.supported) return channel;
        if (this.roomId === channel._id) return channel;

        this.disconnect();
        this.error = undefined;
        this.selfId = channel.client.user?._id;
        this.clientChannel = channel;
        this.connecting = true;
        this.status = VoiceStatus.CONNECTING;

        const api = this.api(channel);
        const tier = await this.fetchTier(api);
        runInAction(() => {
            this.tier = tier;
        });

        try {
            const response = (await api.post(
                `/channels/${channel._id}/voice/join`,
                undefined,
                { data: { peer_id: randomPeerId() } },
            )) as VoicePeersResponse;

            runInAction(() => {
                this.roomId = channel._id;
                this.masterId = response?.master;
                this.participantCount = Math.max(
                    1,
                    response?.members?.length ?? 1,
                );
                this.peers = new Map(
                    (response?.peers ?? [])
                        .filter((peer) => peer.user_id !== this.selfId)
                        .map((peer) => [peer.user_id, peer]),
                );
                this.connecting = false;
                this.status = VoiceStatus.CONNECTED;
            });

            this.bindGateway(channel);
            this.startHeartbeat(channel);
            this.startRefresh();

            // Browsers can require a gesture before playing a newly attached
            // screen-share audio track. Any click while in the call unlocks it.
            this.audioUnlockHandler = () => {
                void this.startAudioPlayback();
            };
            window.addEventListener("pointerdown", this.audioUnlockHandler);
            await this.reconcilePeers(response);

            // Start with the microphone if the browser allows it; the call
            // still works receive-only if permission is denied.
            void this.startProducing("audio").catch(() => undefined);
        } catch (err) {
            runInAction(() => {
                this.connecting = false;
                this.status = VoiceStatus.ERRORED;
                this.error =
                    "Could not join the call. Check your connection and try again.";
            });
            modalController.push({ type: "error", error: this.error });
        }

        return channel;
    }

    private bindGateway(channel: Channel) {
        this.removePacketHandler();

        const handler = (packet: any) => {
            if (!packet || !this.roomId) return;

            if (packet.type === "VoiceSignal") {
                if (
                    packet.channel_id === this.roomId &&
                    packet.to === this.selfId
                ) {
                    void this.handleSignal(packet);
                }
                return;
            }

            if (
                (packet.type === "VoiceChannelJoin" ||
                    packet.type === "VoiceChannelLeave") &&
                packet.id === this.roomId
            ) {
                void this.refreshPeers();
            }

            if (
                packet.type === "UserVoiceStateUpdate" &&
                packet.channel_id === this.roomId
            ) {
                void this.refreshPeers();
            }
        };

        channel.client.addListener("packet", handler);
        this.packetHandler = handler;
    }

    private removePacketHandler() {
        if (this.packetHandler && this.clientChannel) {
            this.clientChannel.client.removeListener(
                "packet",
                this.packetHandler,
            );
        }
        this.packetHandler = undefined;
    }

    private startRefresh() {
        this.stopRefresh();
        this.refreshTimer = window.setInterval(() => {
            void this.refreshPeers();
        }, 15_000);
    }

    private stopRefresh() {
        if (this.refreshTimer !== undefined) {
            window.clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    }

    private async refreshPeers() {
        const channel = this.clientChannel;
        if (!channel || !this.roomId) return;

        try {
            const response = (await this.api(channel).get(
                `/channels/${this.roomId}/voice/peers`,
            )) as VoicePeersResponse;

            runInAction(() => {
                this.masterId = response?.master;
                this.participantCount = Math.max(
                    1,
                    response?.members?.length ?? 1,
                );
                this.peers = new Map(
                    (response?.peers ?? [])
                        .filter((peer) => peer.user_id !== this.selfId)
                        .map((peer) => [peer.user_id, peer]),
                );
            });

            await this.reconcilePeers(response);
        } catch {
            // A transient polling failure should not drop the call.
        }
    }

    private async reconcilePeers(response?: VoicePeersResponse) {
        const selfId = this.selfId;
        if (!selfId) return;

        const remote = (response?.peers ?? []).filter(
            (peer) => peer.user_id !== selfId,
        );

        for (const peer of remote) {
            this.ensurePeer(peer);
        }

        for (const userId of Array.from(this.peerConnections.keys())) {
            if (!remote.some((peer) => peer.user_id === userId)) {
                this.removePeer(userId);
            }
        }
    }

    private ensurePeer(peer: VoicePeer) {
        if (this.peerConnections.has(peer.user_id)) return;
        if (typeof RTCPeerConnection === "undefined") return;

        const pc = new RTCPeerConnection({
            iceServers: STUN_SERVERS,
            iceCandidatePoolSize: 4,
        });
        const audioEl = document.createElement("audio");
        const screenAudioEl = document.createElement("audio");

        for (const element of [audioEl, screenAudioEl]) {
            element.autoplay = true;
            element.style.display = "none";
            document.body.appendChild(element);
            this.audioElements.push(element);
        }

        const state: PeerState = {
            userId: peer.user_id,
            pc,
            polite: (this.selfId ?? "") > peer.user_id,
            makingOffer: false,
            ignoreOffer: false,
            settingRemoteAnswer: false,
            expectScreen: false,
            audioEl,
            screenAudioEl,
            failed: false,
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal(peer.user_id, {
                    type: "candidate",
                    candidate: event.candidate.toJSON(),
                });
            }
        };

        pc.ontrack = (event) => {
            const stream = event.streams[0];
            if (!stream) return;

            const isScreen = state.expectScreen;
            runInAction(() => {
                if (isScreen) {
                    this.remoteScreens.set(peer.user_id, stream);
                    if (event.track.kind === "video") {
                        state.expectScreen = false;
                    }
                } else {
                    this.remoteStreams.set(peer.user_id, stream);
                }
                this.mediaVersion += 1;
            });

            this.attachAudio(state, stream, isScreen);

            event.track.onended = () => {
                if (!isScreen) return;
                runInAction(() => {
                    const live = stream
                        .getTracks()
                        .some((track) => track.readyState === "live");
                    if (!live) {
                        this.remoteScreens.delete(peer.user_id);
                        state.screenAudioEl.srcObject = null;
                        this.mediaVersion += 1;
                    }
                });
            };
        };

        pc.onnegotiationneeded = async () => {
            if (state.makingOffer) return;
            state.makingOffer = true;
            try {
                await pc.setLocalDescription();
                if (pc.localDescription) {
                    this.sendSignal(state.userId, {
                        type: "description",
                        description: {
                            type: pc.localDescription.type,
                            sdp: pc.localDescription.sdp,
                        },
                    });
                }
            } catch (error) {
                console.warn("P2P negotiation failed", error);
            } finally {
                state.makingOffer = false;
            }
        };

        pc.onconnectionstatechange = () => {
            runInAction(() => {
                if (pc.connectionState === "connected") {
                    state.failed = false;
                    if (this.error?.startsWith("Direct P2P")) {
                        this.error = undefined;
                    }
                } else if (
                    pc.connectionState === "failed" ||
                    (pc.connectionState === "disconnected" && state.failed)
                ) {
                    state.failed = true;
                    this.error =
                        "Direct P2P connection failed. Both users may be behind restrictive NAT; try a different network or mobile hotspot.";
                }
            });
        };

        this.peerConnections.set(peer.user_id, state);
        this.addLocalTracks(state);
    }

    private addLocalTracks(state: PeerState) {
        if (this.localStream) {
            for (const track of this.localStream.getTracks()) {
                state.pc.addTrack(track, this.localStream);
                this.tuneSender(state.pc, track);
            }
        }
        if (this.localScreen) {
            for (const track of this.localScreen.getTracks()) {
                state.pc.addTrack(track, this.localScreen);
                this.tuneSender(state.pc, track);
            }
        }
    }

    private tuneSender(pc: RTCPeerConnection, track: MediaStreamTrack) {
        const sender = pc.getSenders().find((entry) => entry.track === track);
        if (!sender) return;

        try {
            const parameters = sender.getParameters();
            if (!parameters.encodings || parameters.encodings.length === 0) {
                parameters.encodings = [{}];
            }
            parameters.encodings[0].maxBitrate = this.maxBitrate();
            void sender.setParameters(parameters).catch(() => undefined);
        } catch {
            // Some browsers reject parameters before negotiation completes.
        }
    }

    private attachAudio(
        state: PeerState,
        stream: MediaStream,
        screen: boolean,
    ) {
        const element = screen ? state.screenAudioEl : state.audioEl;
        element.srcObject = stream;
        element.muted = this.deafened;
        void element.play().catch(() => undefined);
    }

    private removePeer(userId: string) {
        const state = this.peerConnections.get(userId);
        if (!state) return;

        try {
            state.pc.close();
        } catch {
            // already closed
        }
        state.audioEl.remove();
        state.screenAudioEl.remove();
        this.audioElements = this.audioElements.filter(
            (element) =>
                element !== state.audioEl && element !== state.screenAudioEl,
        );
        this.peerConnections.delete(userId);
        this.remoteStreams.delete(userId);
        this.remoteScreens.delete(userId);
        runInAction(() => {
            this.mediaVersion += 1;
        });
    }

    private sendSignal(to: string, data: unknown) {
        const channel = this.clientChannel;
        if (!channel || !this.roomId) return;

        void this.api(channel)
            .post(`/channels/${this.roomId}/voice/signal`, undefined, {
                data: { to, data },
            })
            .catch(() => undefined);
    }

    private async handleSignal(packet: any) {
        const from = packet.from as string;
        let state = this.peerConnections.get(from);

        if (!state) {
            await this.refreshPeers();
            state = this.peerConnections.get(from);
            if (!state) return;
        }

        const data = packet.data as any;
        if (!data) return;

        if (data.type === "media") {
            if (data.kind === "screen") {
                state.expectScreen = !!data.active;
                if (!data.active) {
                    runInAction(() => {
                        this.remoteScreens.delete(from);
                        state.screenAudioEl.srcObject = null;
                        this.mediaVersion += 1;
                    });
                }
            }
            return;
        }

        if (data.type === "description") {
            const description = data.description as RTCSessionDescriptionInit;
            if (!description?.type || !description.sdp) return;

            const readyForOffer =
                !state.makingOffer &&
                (state.pc.signalingState === "stable" ||
                    state.settingRemoteAnswer);
            const offerCollision =
                description.type === "offer" && !readyForOffer;

            state.ignoreOffer = !state.polite && offerCollision;
            if (state.ignoreOffer) return;

            try {
                state.settingRemoteAnswer = description.type === "answer";
                await state.pc.setRemoteDescription(description);
                state.settingRemoteAnswer = false;

                if (description.type === "offer") {
                    await state.pc.setLocalDescription();
                    if (state.pc.localDescription) {
                        this.sendSignal(from, {
                            type: "description",
                            description: {
                                type: state.pc.localDescription.type,
                                sdp: state.pc.localDescription.sdp,
                            },
                        });
                    }
                }
            } catch (error) {
                console.warn("Could not apply P2P description", error);
            }
            return;
        }

        if (data.type === "candidate" && data.candidate) {
            try {
                await state.pc.addIceCandidate(data.candidate);
            } catch (error) {
                if (!state.ignoreOffer) {
                    console.warn("Could not add ICE candidate", error);
                }
            }
        }
    }

    @action async startProducing(type: ProduceType) {
        try {
            if (type === "audio") {
                if (this.isProducing("audio")) return;
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });
                const track = stream.getAudioTracks()[0];
                if (!track) return;

                if (!this.localStream) this.localStream = new MediaStream();
                this.localStream.addTrack(track);

                for (const state of this.peerConnections.values()) {
                    state.pc.addTrack(track, this.localStream);
                    this.tuneSender(state.pc, track);
                }

                runInAction(() => {
                    this.muted = false;
                    this.mediaVersion += 1;
                });
                return;
            }

            if (type === "video") {
                if (this.isProducing("video")) return;
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { ...this.videoConstraints(), facingMode: "user" },
                });
                const track = stream.getVideoTracks()[0];
                if (!track) return;

                if (!this.localStream) this.localStream = new MediaStream();
                this.localStream.addTrack(track);

                for (const state of this.peerConnections.values()) {
                    state.pc.addTrack(track, this.localStream);
                    this.tuneSender(state.pc, track);
                }

                runInAction(() => {
                    this.cameraEnabled = true;
                    this.mediaVersion += 1;
                });
                track.onended = () => {
                    void this.stopProducing("video");
                };
                return;
            }

            if (type === "screen") {
                if (this.isProducing("screen")) return;
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: this.videoConstraints(),
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                    },
                });

                this.localScreen = stream;
                for (const state of this.peerConnections.values()) {
                    this.sendSignal(state.userId, {
                        type: "media",
                        kind: "screen",
                        active: true,
                    });
                    for (const track of stream.getTracks()) {
                        state.pc.addTrack(track, stream);
                        this.tuneSender(state.pc, track);
                    }
                }

                runInAction(() => {
                    this.sharing = true;
                    this.mediaVersion += 1;
                });
                stream.getVideoTracks().forEach((track) => {
                    track.onended = () => {
                        void this.stopProducing("screen");
                    };
                });
            }
        } catch (err) {
            runInAction(() => {
                this.error =
                    type === "screen"
                        ? "Screen sharing was cancelled or blocked."
                        : "Could not access your microphone/camera.";
            });
        }
    }

    @action async stopProducing(type: ProduceType) {
        if (type === "screen") {
            const stream = this.localScreen;
            if (!stream) return;

            for (const state of this.peerConnections.values()) {
                this.sendSignal(state.userId, {
                    type: "media",
                    kind: "screen",
                    active: false,
                });
                for (const track of stream.getTracks()) {
                    const sender = state.pc
                        .getSenders()
                        .find((entry) => entry.track === track);
                    if (sender) state.pc.removeTrack(sender);
                }
            }

            stream.getTracks().forEach((track) => track.stop());
            this.localScreen = undefined;
            this.sharing = false;
            this.mediaVersion += 1;
            return;
        }

        const stream = this.localStream;
        if (!stream) return;

        const tracks =
            type === "audio"
                ? stream.getAudioTracks()
                : stream.getVideoTracks();

        for (const track of tracks) {
            for (const state of this.peerConnections.values()) {
                const sender = state.pc
                    .getSenders()
                    .find((entry) => entry.track === track);
                if (sender) state.pc.removeTrack(sender);
            }
            track.stop();
            stream.removeTrack(track);
        }

        if (type === "audio") this.muted = true;
        if (type === "video") this.cameraEnabled = false;
        this.mediaVersion += 1;
    }

    isProducing(type: "audio" | "video" | "screen") {
        if (type === "screen") {
            return !!this.localScreen?.getVideoTracks().length;
        }
        if (type === "audio") {
            return !!this.localStream
                ?.getAudioTracks()
                .some((track) => track.readyState === "live");
        }
        return !!this.localStream
            ?.getVideoTracks()
            .some((track) => track.readyState === "live");
    }

    isDeaf() {
        return this.deafened;
    }

    toggleChat() {
        this.chatOpen = !this.chatOpen;
    }

    async startAudioPlayback() {
        for (const element of this.audioElements) {
            void element.play().catch(() => undefined);
        }
    }

    async switchDevice(kind: MediaDeviceKind, deviceId: string) {
        try {
            if (kind === "audiooutput") {
                for (const element of this.audioElements) {
                    const sink = element as HTMLAudioElement & {
                        setSinkId?: (id: string) => Promise<void>;
                    };
                    await sink.setSinkId?.(deviceId);
                }
                return;
            }

            if (kind === "audioinput") {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: { exact: deviceId } },
                });
                const track = stream.getAudioTracks()[0];
                if (!track) return;

                for (const state of this.peerConnections.values()) {
                    const sender = state.pc
                        .getSenders()
                        .find((entry) => entry.track?.kind === "audio");
                    if (sender) await sender.replaceTrack(track);
                }

                const old = this.localStream?.getAudioTracks() ?? [];
                old.forEach((entry) => {
                    this.localStream?.removeTrack(entry);
                    entry.stop();
                });
                if (!this.localStream) this.localStream = new MediaStream();
                this.localStream.addTrack(track);
                runInAction(() => {
                    this.mediaVersion += 1;
                });
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    ...this.videoConstraints(),
                    deviceId: { exact: deviceId },
                },
            });
            const track = stream.getVideoTracks()[0];
            if (!track) return;

            for (const state of this.peerConnections.values()) {
                const sender = state.pc
                    .getSenders()
                    .find((entry) => entry.track?.kind === "video");
                if (sender) await sender.replaceTrack(track);
            }

            const old = this.localStream?.getVideoTracks() ?? [];
            old.forEach((entry) => {
                this.localStream?.removeTrack(entry);
                entry.stop();
            });
            if (!this.localStream) this.localStream = new MediaStream();
            this.localStream.addTrack(track);
            runInAction(() => {
                this.mediaVersion += 1;
            });
        } catch {
            runInAction(() => {
                this.error = "Could not switch media device.";
            });
        }
    }

    async startDeafen() {
        this.deafened = true;
        for (const element of this.audioElements) element.muted = true;
    }

    async stopDeafen() {
        this.deafened = false;
        for (const element of this.audioElements) element.muted = false;
    }

    private startHeartbeat(channel: Channel) {
        this.stopHeartbeat();
        const api = this.api(channel);

        this.heartbeat = window.setInterval(() => {
            void api
                .post(`/channels/${channel._id}/voice/heartbeat`)
                .catch(() => undefined);
        }, 15_000);

        const session = (
            channel.client as unknown as {
                session?: { token?: string } | string;
            }
        ).session;
        const token = typeof session === "string" ? session : session?.token;
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
            window.addEventListener("beforeunload", this.unloadHandler);
        }
    }

    private stopHeartbeat() {
        if (this.heartbeat !== undefined) {
            window.clearInterval(this.heartbeat);
            this.heartbeat = undefined;
        }
        if (this.unloadHandler) {
            window.removeEventListener("pagehide", this.unloadHandler);
            window.removeEventListener("beforeunload", this.unloadHandler);
            this.unloadHandler = undefined;
        }
    }

    @action disconnect() {
        this.stopHeartbeat();
        this.stopRefresh();
        this.removePacketHandler();

        if (this.audioUnlockHandler) {
            window.removeEventListener("pointerdown", this.audioUnlockHandler);
            this.audioUnlockHandler = undefined;
        }

        const roomId = this.roomId;
        const channel = this.clientChannel;

        if (roomId && channel) {
            void this.api(channel)
                .post(`/channels/${roomId}/voice/leave`)
                .catch(() => undefined);
        }

        for (const userId of Array.from(this.peerConnections.keys())) {
            this.removePeer(userId);
        }

        this.localStream?.getTracks().forEach((track) => track.stop());
        this.localScreen?.getTracks().forEach((track) => track.stop());
        this.localStream = undefined;
        this.localScreen = undefined;
        this.remoteStreams.clear();
        this.remoteScreens.clear();
        this.peers.clear();
        this.peerConnections.clear();
        this.audioElements.forEach((element) => element.remove());
        this.audioElements = [];
        this.mediaVersion += 1;

        this.connecting = false;
        this.status = this.supported
            ? VoiceStatus.READY
            : VoiceStatus.UNLOADED;
        this.roomId = null;
        this.masterId = undefined;
        this.participantCount = 0;
        this.muted = true;
        this.cameraEnabled = false;
        this.sharing = false;
        this.deafened = false;
        this.clientChannel = undefined;
        this.error = undefined;
    }
}

export const voiceState = new VoiceStateReference();
