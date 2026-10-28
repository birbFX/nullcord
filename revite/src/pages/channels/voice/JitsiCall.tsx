import { useEffect, useRef, useState } from "preact/hooks";
import styled from "styled-components/macro";

import {
    BarChartAlt2,
    Microphone,
    MicrophoneOff,
    PhoneOff,
    Video,
    VideoOff,
} from "@styled-icons/boxicons-solid";
import { Desktop } from "@styled-icons/boxicons-regular";

import { Button } from "@revoltchat/ui";

import { voiceState } from "../../../lib/vortex/VoiceState";

const JITSI_HOST = "meet.element.io";
const SCRIPT_ID = "nullcord-jitsi-external-api";

declare global {
    interface Window {
        JitsiMeetExternalAPI?: new (
            domain: string,
            options: Record<string, unknown>,
        ) => any;
        __nullcordJitsiPromise?: Promise<void>;
    }
}

function loadJitsiApi() {
    if (window.JitsiMeetExternalAPI) return Promise.resolve();
    if (window.__nullcordJitsiPromise) return window.__nullcordJitsiPromise;

    window.__nullcordJitsiPromise = new Promise<void>((resolve, reject) => {
        const existing = document.getElementById(
            SCRIPT_ID,
        ) as HTMLScriptElement | null;
        if (existing) {
            if (window.JitsiMeetExternalAPI) return resolve();
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener(
                "error",
                () => reject(new Error("Could not load the call relay.")),
                { once: true },
            );
            return;
        }

        const script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.async = true;
        script.src = `https://${JITSI_HOST}/external_api.js`;
        script.onload = () => resolve();
        script.onerror = () =>
            reject(new Error("Could not load the call relay."));
        document.head.appendChild(script);
    });

    return window.__nullcordJitsiPromise;
}

function formatDuration(total: number) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const Wrap = styled.div`
    position: relative;
    flex-grow: 1;
    min-height: 0;
    background: #000;

    .jitsi {
        position: absolute;
        inset: 0;
    }

    .jitsi iframe {
        width: 100% !important;
        height: 100% !important;
        border: 0;
    }

    .status {
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 10px;
        border-radius: 12px;
        color: #fff;
        background: rgba(0, 0, 0, 0.68);
        backdrop-filter: blur(8px);
        font-size: 13px;
        font-weight: 600;
        user-select: none;
        pointer-events: none;
    }

    .count {
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
    }

    .controls {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 6px;
        pointer-events: auto;
    }

    .control {
        all: unset;
        box-sizing: border-box;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        color: #fff;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.14);

        &:hover {
            background: rgba(255, 255, 255, 0.24);
        }

        &.active {
            background: var(--error);
        }

        &.leave {
            background: var(--error);
        }

        &[disabled] {
            opacity: 0.45;
            cursor: default;
        }
    }

    .error {
        position: absolute;
        inset: 0;
        z-index: 3;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 12px;
        padding: 24px;
        color: #fff;
        text-align: center;
        background: var(--primary-background);
    }
`;

export function JitsiCall({
    id,
    displayName,
}: {
    id: string;
    displayName: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const apiRef = useRef<any>(null);
    const [api, setApi] = useState<any>(null);
    const [joined, setJoined] = useState(false);
    const [count, setCount] = useState(1);
    const [seconds, setSeconds] = useState(0);
    const [audioMuted, setAudioMuted] = useState(false);
    const [videoMuted, setVideoMuted] = useState(true);
    const [sharing, setSharing] = useState(false);
    const [error, setError] = useState<string>();

    useEffect(() => {
        let disposed = false;

        loadJitsiApi()
            .then(() => {
                if (disposed || !ref.current || !window.JitsiMeetExternalAPI)
                    return;

                const instance = new window.JitsiMeetExternalAPI(JITSI_HOST, {
                    roomName: `nullcord${id}`,
                    parentNode: ref.current,
                    userInfo: { displayName },
                    configOverwrite: {
                        prejoinPageEnabled: false,
                        prejoinConfig: { enabled: false },
                        requireDisplayName: false,
                        startWithAudioMuted: false,
                        startWithVideoMuted: true,
                        disableDeepLinking: true,
                        enableWelcomePage: false,
                    },
                    interfaceConfigOverwrite: {
                        SHOW_JITSI_WATERMARK: false,
                        SHOW_BRAND_WATERMARK: false,
                        SHOW_POWERED_BY: false,
                        MOBILE_APP_PROMO: false,
                    },
                });

                apiRef.current = instance;
                setApi(instance);

                const updateCount = () => {
                    try {
                        const next = instance.getNumberOfParticipants();
                        setCount(next);
                        voiceState.setParticipantCount(next);
                    } catch {
                        // not joined yet
                    }
                };

                instance.addEventListener("videoConferenceJoined", () => {
                    setJoined(true);
                    updateCount();
                });
                instance.addEventListener("participantJoined", updateCount);
                instance.addEventListener("participantLeft", updateCount);
                instance.addEventListener("audioMuteStatusChanged", (event: any) =>
                    setAudioMuted(!!event.muted),
                );
                instance.addEventListener("videoMuteStatusChanged", (event: any) =>
                    setVideoMuted(!!event.muted),
                );
                instance.addEventListener(
                    "screenSharingStatusChanged",
                    (event: any) => setSharing(!!event.on),
                );
                instance.addEventListener("videoConferenceLeft", () => {
                    if (!disposed) voiceState.disconnect();
                });
                instance.addEventListener("readyToClose", () => {
                    if (!disposed) voiceState.disconnect();
                });
            })
            .catch((err) => {
                console.error("Jitsi failed to load:", err);
                setError(
                    err instanceof Error
                        ? err.message
                        : "Could not start the call relay.",
                );
            });

        return () => {
            disposed = true;
            try {
                apiRef.current?.dispose();
            } catch {
                // already disposed
            }
            apiRef.current = null;
            setApi(null);
        };
    }, [id, displayName]);

    useEffect(() => {
        if (!joined) {
            setSeconds(0);
            return;
        }

        const start = Date.now();
        const timer = window.setInterval(
            () => setSeconds(Math.floor((Date.now() - start) / 1000)),
            1000,
        );
        return () => window.clearInterval(timer);
    }, [joined]);

    const command = (name: string) => {
        if (!joined) return;
        try {
            api?.executeCommand(name);
        } catch (err) {
            console.warn(`Jitsi command ${name} failed:`, err);
        }
    };

    return (
        <Wrap>
            <div ref={ref} className="jitsi" />
            {error ? (
                <div className="error">
                    <div>{error}</div>
                    <Button palette="secondary" onClick={voiceState.disconnect}>
                        Close call
                    </Button>
                </div>
            ) : (
                <div className="status">
                    <div className="count">
                        <BarChartAlt2 size={15} />
                        {count} connected · {formatDuration(seconds)}
                    </div>
                    <div className="controls">
                        <button
                            type="button"
                            className={`control ${audioMuted ? "active" : ""}`}
                            title={audioMuted ? "Unmute" : "Mute"}
                            disabled={!joined}
                            onClick={() => command("toggleAudio")}>
                            {audioMuted ? (
                                <MicrophoneOff size={16} />
                            ) : (
                                <Microphone size={16} />
                            )}
                        </button>
                        <button
                            type="button"
                            className={`control ${videoMuted ? "active" : ""}`}
                            title={videoMuted ? "Start camera" : "Stop camera"}
                            disabled={!joined}
                            onClick={() => command("toggleVideo")}>
                            {videoMuted ? (
                                <VideoOff size={16} />
                            ) : (
                                <Video size={16} />
                            )}
                        </button>
                        <button
                            type="button"
                            className={`control ${sharing ? "active" : ""}`}
                            title={sharing ? "Stop sharing" : "Share screen"}
                            disabled={!joined}
                            onClick={() => command("toggleShareScreen")}>
                            <Desktop size={16} />
                        </button>
                        <button
                            type="button"
                            className="control leave"
                            title="Leave call"
                            onClick={voiceState.disconnect}>
                            <PhoneOff size={16} />
                        </button>
                    </div>
                </div>
            )}
        </Wrap>
    );
}
