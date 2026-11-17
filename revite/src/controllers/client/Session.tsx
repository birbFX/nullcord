import { action, computed, makeAutoObservable } from "mobx";
import { API, Client } from "revolt.js";

import { state } from "../../mobx/State";

import { resetMemberSidebarFetched } from "../../components/navigation/right/MemberSidebar";
import { modalController } from "../modals/ModalController";

/**
 * How often to retry a dropped connection
 */
const RETRY_MS = 3000;

/**
 * Current lifecycle state
 */
type State = "Ready" | "Connecting" | "Online" | "Disconnected" | "Offline";

/**
 * Possible transitions between states
 */
type Transition =
    | {
          action: "LOGIN";
          apiUrl?: string;
          session: SessionPrivate;
          configuration?: API.RevoltConfig;

          knowledge: "new" | "existing";
      }
    | {
          action:
              | "SUCCESS"
              | "DISCONNECT"
              | "RETRY"
              | "LOGOUT"
              | "ONLINE"
              | "OFFLINE";
      };

/**
 * Client lifecycle finite state machine
 */
export default class Session {
    state: State = window.navigator.onLine ? "Ready" : "Offline";
    user_id: string | null = null;
    client: Client | null = null;

    private retryTimer?: ReturnType<typeof setTimeout>;
    private watchdog?: ReturnType<typeof setInterval>;
    private lastPacket = Date.now();
    private lastTick = Date.now();
    private connectingSince = 0;

    /**
     * Create a new Session
     */
    constructor() {
        makeAutoObservable(this, {
            // plain bookkeeping, nothing observes these
            retryTimer: false,
            watchdog: false,
            lastPacket: false,
            lastTick: false,
            connectingSince: false,
        } as never);

        this.onDropped = this.onDropped.bind(this);
        this.onReady = this.onReady.bind(this);
        this.onOnline = this.onOnline.bind(this);
        this.onOffline = this.onOffline.bind(this);

        window.addEventListener("online", this.onOnline);
        window.addEventListener("offline", this.onOffline);

        this.nudge = this.nudge.bind(this);
        this.tick = this.tick.bind(this);
        window.addEventListener("focus", this.nudge);
        document.addEventListener("visibilitychange", this.nudge);
        this.watchdog = setInterval(this.tick, RETRY_MS);
    }

    /**
     * Retry right away if we are not connected (tab focused, wake from sleep).
     */
    private nudge() {
        if (document.visibilityState === "hidden") return;
        if (this.client && this.state !== "Online" && this.state !== "Ready") {
            this.retryNow();
        }
    }

    /**
     * Runs every few seconds: detects dead sockets (sleep, reboot, server
     * restart) and keeps retrying until we are back online.
     */
    private tick() {
        const now = Date.now();
        const slept = now - this.lastTick > RETRY_MS * 3;
        this.lastTick = now;
        if (!this.client || this.state === "Ready") return;

        if (this.state === "Online") {
            const heartbeat = (this.client.heartbeat || 30) * 1000;
            if (slept || now - this.lastPacket > heartbeat * 2 + 5000) {
                this.client.websocket.disconnect();
                this.emit({ action: "DISCONNECT" });
            }
        } else if (
            this.state === "Connecting" &&
            now - this.connectingSince > 10_000
        ) {
            this.emit({ action: "DISCONNECT" });
        } else if (this.state === "Disconnected" || this.state === "Offline") {
            this.retryNow();
        }
    }

    private retryNow() {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
        this.emit({ action: "RETRY" });
    }

    private scheduleRetry() {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            this.emit({ action: "RETRY" });
        }, RETRY_MS);
    }

    /**
     * Initiate logout and destroy client
     */
    @action destroy() {
        if (this.client) {
            this.client.logout(false);
            this.state = "Ready";
            this.client = null;
        }
    }

    /**
     * Called when user's browser signals it is online
     */
    private onOnline() {
        this.emit({
            action: "ONLINE",
        });
    }

    /**
     * Called when user's browser signals it is offline
     */
    private onOffline() {
        this.emit({
            action: "OFFLINE",
        });
    }

    /**
     * Called when the client signals it has disconnected
     */
    private onDropped() {
        this.emit({
            action: "DISCONNECT",
        });
    }

    /**
     * Called when the client signals it has received the Ready packet
     */
    private onReady() {
        resetMemberSidebarFetched();
        this.emit({
            action: "SUCCESS",
        });
    }

    /**
     * Create a new Revolt.js Client for this Session
     * @param apiUrl Optionally specify an API URL
     */
    private createClient(apiUrl?: string) {
        this.client = new Client({
            unreads: true,
            autoReconnect: false,
            apiURL: apiUrl ?? import.meta.env.VITE_API_URL,
        });

        this.client.addListener("dropped", this.onDropped);
        this.client.addListener("ready", this.onReady);
        this.client.addListener("packet", () => {
            this.lastPacket = Date.now();
        });
    }

    /**
     * Destroy the client including any listeners.
     */
    private destroyClient() {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
        this.client!.removeAllListeners();
        this.client!.logout();
        this.user_id = null;
        this.client = null;
    }

    /**
     * Ensure we are in one of the given states
     * @param state Possible states
     */
    private assert(...state: State[]) {
        let found = false;
        for (const target of state) {
            if (this.state === target) {
                found = true;
                break;
            }
        }

        if (!found) {
            throw `State must be ${state} in order to transition! (currently ${this.state})`;
        }
    }

    /**
     * Continue logging in provided onboarding is successful
     * @param data Transition Data
     */
    private async continueLogin(data: Transition & { action: "LOGIN" }) {
        try {
            await this.client!.useExistingSession(data.session);
            this.user_id = this.client!.user!._id;
            state.auth.setSession(data.session);
        } catch (err) {
            this.state = "Ready";
            throw err;
        }
    }

    /**
     * Transition to a new state by a certain action
     * @param data Transition Data
     */
    @action async emit(data: Transition) {
        console.info(`[FSM ${this.user_id ?? "Anonymous"}]`, data);

        switch (data.action) {
            // Login with session
            case "LOGIN": {
                this.assert("Ready");
                this.state = "Connecting";
                this.connectingSince = Date.now();
                this.lastPacket = Date.now();
                this.createClient(data.apiUrl);

                try {
                    if (data.configuration) {
                        this.client!.configuration = data.configuration;
                    }

                    if (data.knowledge === "new") {
                        await this.client!.fetchConfiguration();
                        this.client!.session = data.session;
                        (this.client! as any).$updateHeaders();

                        const { onboarding } = await this.client!.api.get(
                            "/onboard/hello",
                        );

                        if (onboarding) {
                            modalController.push({
                                type: "onboarding",
                                callback: async (username: string) =>
                                    this.client!.completeOnboarding(
                                        { username },
                                        false,
                                    ).then(() => this.continueLogin(data)),
                            });

                            return;
                        }
                    }

                    await this.continueLogin(data);
                } catch (err) {
                    // Leave a clean slate so the caller can retry.
                    this.state = "Ready";
                    this.client?.removeAllListeners();
                    this.client = null;
                    throw err;
                }

                break;
            }
            // Ready successfully received
            case "SUCCESS": {
                if (this.state === "Ready") break;
                this.state = "Online";
                this.lastPacket = Date.now();
                break;
            }
            // Client got disconnected
            case "DISCONNECT": {
                if (!this.client) break;
                if (this.state === "Ready" || this.state === "Offline") break;
                this.state = "Disconnected";
                this.scheduleRetry();
                break;
            }
            // We should try reconnecting
            case "RETRY": {
                if (!this.client) break;
                if (this.state !== "Disconnected" && this.state !== "Offline")
                    break;
                if (!navigator.onLine) {
                    this.state = "Offline";
                    break;
                }

                this.state = "Connecting";
                this.connectingSince = Date.now();
                this.lastPacket = Date.now();

                const client = this.client;
                try {
                    client.websocket.disconnect();
                } catch (_) {}

                // The API may still be down (reboot, restart): keep trying.
                client.websocket.connect().catch(() => {
                    if (this.client === client && this.state === "Connecting") {
                        this.emit({ action: "DISCONNECT" });
                    }
                });
                break;
            }
            // User instructed logout
            case "LOGOUT": {
                if (this.state === "Ready" || !this.client) break;
                this.state = "Ready";
                this.destroyClient();
                break;
            }
            // Browser went offline
            case "OFFLINE": {
                if (this.state !== "Ready") this.state = "Offline";
                break;
            }
            // Browser went online
            case "ONLINE": {
                if (this.client) {
                    this.state = "Disconnected";
                    this.emit({ action: "RETRY" });
                } else {
                    this.state = "Ready";
                }
                break;
            }
        }
    }

    /**
     * Whether we are ready to render.
     * @returns Boolean
     */
    @computed get ready() {
        return !!this.client?.user;
    }
}
