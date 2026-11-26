import { observer } from "mobx-react-lite";
import styled from "styled-components/macro";

import { useEffect, useRef, useState } from "preact/hooks";

import {
    BarChartAlt2,
    Chat,
    Microphone,
    MicrophoneOff,
    PhoneOff,
    Video,
    VideoOff,
} from "@styled-icons/boxicons-solid";
import { Desktop } from "@styled-icons/boxicons-regular";

import { Button } from "@revoltchat/ui";

import { useClient } from "../../../controllers/client/ClientController";
import { voiceState } from "../../../lib/vortex/VoiceState";

const Wrap = styled.div`
    position: relative;
    flex-grow: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background:
        radial-gradient(circle at 50% 0%, rgba(88, 101, 242, 0.09), transparent 46%),
        #08090d;
    color: #fff;
`;

const Grid = styled.div<{ empty?: boolean }>`
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
    align-content: center;
    padding: 18px 18px 104px;
    overflow: auto;

    &.empty {
        place-content: center;
        color: rgba(255, 255, 255, 0.6);
        text-align: center;
        font-size: 13px;
    }
`;

const Tile = styled.div<{ screen?: boolean }>`
    position: relative;
    min-height: 190px;
    overflow: hidden;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background:
        radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.06), transparent 62%),
        #101116;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.24);

    ${(props) =>
        props.screen &&
        `
        grid-column: span 2;
        min-height: 260px;
    `}

    video {
        width: 100%;
        height: 100%;
        min-height: inherit;
        display: block;
        object-fit: cover;
        background: #000;
    }

    video.screen {
        object-fit: contain;
    }

    .label {
        position: absolute;
        left: 8px;
        bottom: 8px;
        max-width: calc(100% - 16px);
        padding: 4px 7px;
        overflow: hidden;
        border-radius: 5px;
        background: rgba(0, 0, 0, 0.68);
        font-size: 11px;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .screenTag {
        position: absolute;
        top: 10px;
        left: 10px;
        padding: 4px 7px;
        border-radius: 5px;
        background: rgba(0, 0, 0, 0.66);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    .fs {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 7px;
        cursor: pointer;
        color: #fff;
        background: rgba(0, 0, 0, 0.58);
        opacity: 0;
        transition:
            opacity 0.15s ease,
            background 0.15s ease;
    }

    &:hover .fs,
    .fs:focus-visible {
        opacity: 1;
    }

    .fs:hover {
        background: rgba(0, 0, 0, 0.82);
    }

    .screenAudio {
        position: absolute;
        top: 10px;
        right: 48px;
        padding: 4px 7px;
        border-radius: 5px;
        background: rgba(0, 0, 0, 0.66);
        color: #b7f5c4;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
    }

    @media (hover: none) {
        .fs {
            opacity: 1;
        }
    }
`;

const Status = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: rgba(8, 10, 16, 0.9);
    border-bottom: 1px solid #171c27;
    font-size: 12px;
    font-weight: 600;

    .count {
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
    }

    .badge {
        padding: 2px 7px;
        border-radius: 999px;
        background: #1a2233;
        color: #c9d4ff;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.02em;
    }

    .quality {
        margin-left: auto;
        padding: 2px 7px;
        border-radius: 999px;
        background: #101722;
        color: #8f9bb3;
        font-size: 10px;
        font-weight: 700;
    }
`;

const Controls = styled.div`
    position: absolute;
    left: 50%;
    bottom: 18px;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    background: rgba(24, 25, 30, 0.94);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.45);
    transform: translateX(-50%);
    backdrop-filter: blur(12px);

    button {
        width: 40px;
        height: 40px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 50%;
        cursor: pointer;
        color: #e7ecf7;
        background: #2b2d33;
        transition:
            background 0.15s ease,
            color 0.15s ease,
            transform 0.12s ease;
    }

    button:hover {
        background: #3a3d45;
    }

    button:active {
        transform: scale(0.95);
    }

    button.active {
        color: #ffb4b4;
        background: #4a2427;
    }

    button.leave {
        width: auto;
        min-width: 48px;
        padding: 0 16px;
        gap: 7px;
        border-radius: 10px;
        background: #da373c;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
    }

    button.leave:hover {
        background: #ec4248;
    }

    @media (max-width: 480px) {
        bottom: 10px;

        button {
            width: 36px;
            height: 36px;
        }

        button.leave {
            width: auto;
            padding: 0 12px;
        }
    }
`;

const ErrorBox = styled.div`
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(5, 6, 10, 0.72);
    backdrop-filter: blur(8px);

    .card {
        width: min(480px, 100%);
        padding: 24px;
        border: 1px solid #3a2024;
        border-radius: 14px;
        background: #151218;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        color: #ffd5d5;
        text-align: center;
        font-size: 13px;
        line-height: 20px;
    }

    .title {
        margin-bottom: 6px;
        color: #fff;
        font-size: 17px;
        font-weight: 700;
    }

    .actions {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-top: 16px;
        flex-wrap: wrap;
    }
`;

function StreamVideo({
    stream,
    screen,
}: {
    stream: MediaStream;
    screen: boolean;
}) {
    const ref = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (ref.current) ref.current.srcObject = stream;
    }, [stream]);

    return (
        <video
            ref={ref}
            autoPlay
            playsInline
            muted
            className={screen ? "screen" : undefined}
        />
    );
}

function ScreenTile({
    stream,
    label,
}: {
    stream: MediaStream;
    label: string;
}) {
    const tileRef = useRef<HTMLDivElement>(null);
    const hasAudio = stream
        .getAudioTracks()
        .some((track) => track.readyState === "live");

    async function toggleFullscreen() {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await tileRef.current?.requestFullscreen();
            }
        } catch (error) {
            console.warn("Fullscreen failed", error);
        }
    }

    return (
        <Tile ref={tileRef} screen>
            <StreamVideo stream={stream} screen />
            <div className="screenTag">Screen</div>
            {hasAudio && <div className="screenAudio">Audio</div>}
            <button
                type="button"
                className="fs"
                title="Fullscreen screen"
                aria-label="Fullscreen screen"
                onClick={toggleFullscreen}>
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true">
                    <path
                        d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
            <div className="label">{label}</div>
        </Tile>
    );
}

function formatDuration(total: number) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default observer(function PeerCall({
    id,
    displayName,
}: {
    id: string;
    displayName: string;
}) {
    const client = useClient();
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        if (voiceState.roomId !== id) {
            setSeconds(0);
            return;
        }

        const start = Date.now();
        setSeconds(0);
        const timer = window.setInterval(
            () => setSeconds(Math.floor((Date.now() - start) / 1000)),
            1000,
        );
        return () => window.clearInterval(timer);
    }, [id, voiceState.roomId]);

    useEffect(() => {
        void voiceState.startAudioPlayback();
    }, []);

    const remote = voiceState.remoteParticipants;
    const localStream = voiceState.localStream;
    const localScreen = voiceState.localScreen;

    const nameOf = (userId: string) => {
        const user = client.users.get(userId);
        return user?.display_name || user?.username || userId;
    };

    const masterName =
        voiceState.masterId === client.user?._id
            ? "You are host"
            : voiceState.masterId
              ? `${nameOf(voiceState.masterId)} is host`
              : "No host";

    const tileCount =
        remote.length + (localStream ? 1 : 0) + (localScreen ? 1 : 0);

    return (
        <Wrap>
            <Status>
                <div className="count">
                    <BarChartAlt2 size={14} />
                    Voice connected
                    {" · "}
                    {voiceState.participantCount <= 1
                        ? "waiting"
                        : `${voiceState.participantCount} people`}
                    {" · "}
                    {formatDuration(seconds)}
                </div>
                <span className="badge">{masterName}</span>
                <span className="quality">{voiceState.tierLabel}</span>
            </Status>

            <Grid className={tileCount === 0 ? "empty" : undefined}>
                {tileCount === 0
                    ? "Waiting for someone to join the call…"
                    : null}

                {remote.map((entry) => {
                    const label = `${nameOf(entry.userId)}${
                        voiceState.masterId === entry.userId ? " · Host" : ""
                    }`;
                    return entry.screen ? (
                        <ScreenTile
                            key={`${entry.userId}-screen`}
                            stream={entry.stream}
                            label={label}
                        />
                    ) : (
                        <Tile key={`${entry.userId}-camera`}>
                            <StreamVideo stream={entry.stream} screen={false} />
                            <div className="label">{label}</div>
                        </Tile>
                    );
                })}

                {localScreen && (
                    <ScreenTile
                        stream={localScreen}
                        label={`${displayName} · You`}
                    />
                )}

                {localStream && (
                    <Tile>
                        <StreamVideo stream={localStream} screen={false} />
                        <div className="label">
                            {displayName} · You
                            {voiceState.isHost ? " · Host" : ""}
                        </div>
                    </Tile>
                )}
            </Grid>

            {voiceState.error && (
                <ErrorBox>
                    <div className="card">
                        <div className="title">Call connection lost</div>
                        <div>{voiceState.error}</div>
                        <div className="actions">
                            <Button
                                palette="secondary"
                                onClick={async () => {
                                    const channel = client.channels.get(id);
                                    voiceState.disconnect();
                                    if (channel) await voiceState.connect(channel);
                                }}>
                                Retry
                            </Button>
                            <Button
                                palette="secondary"
                                onClick={voiceState.disconnect}>
                                Leave call
                            </Button>
                        </div>
                    </div>
                </ErrorBox>
            )}

            <Controls>
                <button
                    type="button"
                    className={voiceState.muted ? "active" : ""}
                    title={voiceState.muted ? "Unmute" : "Mute"}
                    onClick={() =>
                        void (voiceState.muted
                            ? voiceState.startProducing("audio")
                            : voiceState.stopProducing("audio"))
                    }>
                    {voiceState.muted ? (
                        <MicrophoneOff size={17} />
                    ) : (
                        <Microphone size={17} />
                    )}
                </button>

                <button
                    type="button"
                    className={voiceState.cameraEnabled ? "" : "active"}
                    title={
                        voiceState.cameraEnabled
                            ? "Stop camera"
                            : "Start camera"
                    }
                    onClick={() =>
                        void (voiceState.cameraEnabled
                            ? voiceState.stopProducing("video")
                            : voiceState.startProducing("video"))
                    }>
                    {voiceState.cameraEnabled ? (
                        <Video size={17} />
                    ) : (
                        <VideoOff size={17} />
                    )}
                </button>

                <button
                    type="button"
                    className={voiceState.sharing ? "active" : ""}
                    title={voiceState.sharing ? "Stop sharing" : "Share screen"}
                    onClick={() =>
                        void (voiceState.sharing
                            ? voiceState.stopProducing("screen")
                            : voiceState.startProducing("screen"))
                    }>
                    <Desktop size={17} />
                </button>

                <button
                    type="button"
                    className={voiceState.chatOpen ? "" : "active"}
                    title={voiceState.chatOpen ? "Hide chat" : "Show chat"}
                    onClick={() => voiceState.toggleChat()}>
                    <Chat size={17} />
                </button>

                <button
                    type="button"
                    className="leave"
                    title="Leave call"
                    onClick={voiceState.disconnect}>
                    <PhoneOff size={15} />
                    Leave
                </button>
            </Controls>
        </Wrap>
    );
});
