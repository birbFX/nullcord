import { useEffect, useRef, useState } from "preact/hooks";
import styled from "styled-components/macro";

import { BarChartAlt2, PhoneOff } from "@styled-icons/boxicons-solid";

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
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 999px;
        color: #fff;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(6px);
        font-size: 13px;
        font-weight: 600;
        user-select: none;
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
    const [count, setCount] = useState(1);
    const [error, setError] = useState<string>();

    useEffect(() => {
        let disposed = false;

        loadJitsiApi()
            .then(() => {
                if (disposed || !ref.current || !window.JitsiMeetExternalAPI)
                    return;

                const api = new window.JitsiMeetExternalAPI(JITSI_HOST, {
                    roomName: `nullcord-${id}`,
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

                apiRef.current = api;

                const update = () => {
                    try {
                        const next = api.getNumberOfParticipants();
                        setCount(next);
                        voiceState.setParticipantCount(next);
                    } catch {
                        // not joined yet
                    }
                };

                api.addEventListener("videoConferenceJoined", update);
                api.addEventListener("participantJoined", update);
                api.addEventListener("participantLeft", update);
                api.addEventListener("videoConferenceLeft", () => {
                    if (!disposed) voiceState.disconnect();
                });
                api.addEventListener("readyToClose", () => {
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
        };
    }, [id, displayName]);

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
                    <BarChartAlt2 size={15} />
                    {count} connected
                    <Button palette="error" onClick={voiceState.disconnect}>
                        <PhoneOff width={16} />
                    </Button>
                </div>
            )}
        </Wrap>
    );
}
