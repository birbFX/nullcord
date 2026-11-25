import { observer } from "mobx-react-lite";
import styled from "styled-components/macro";

import { useEffect, useRef, useState } from "preact/hooks";

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

import { useClient } from "../../../controllers/client/ClientController";
import { voiceState } from "../../../lib/vortex/VoiceState";

const Wrap = styled.div`
    position: relative;
    flex-grow: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #05060a;
    color: #fff;
`;

const Grid = styled.div<{ empty?: boolean }>`
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 8px;
    align-content: center;
    padding: 8px;
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
    min-height: 170px;
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid #1c2230;
    background: #0b0d13;

    ${(props) =>
        props.screen &&
        `
        grid-column: span 2;
        min-height: 240px;
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
        top: 8px;
        left: 8px;
        padding: 3px 6px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.62);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
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
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    background: rgba(8, 10, 16, 0.95);
    border-top: 1px solid #171c27;

    button {
        width: 40px;
        height: 36px;
        display: grid;
        place-items: center;
        border: 1px solid #252d3d;
        border-radius: 9px;
        cursor: pointer;
        color: #e7ecf7;
        background: #121722;
        transition:
            background 0.15s ease,
            border-color 0.15s ease;
    }

    button:hover {
        background: #1a2231;
    }

    button.active {
        border-color: #e05252;
        color: #ffb4b4;
        background: #2a1417;
    }

    button.leave {
        width: auto;
        padding: 0 14px;
        gap: 6px;
        border-color: #e05252;
        background: #b33838;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
    }
`;

const ErrorBox = styled.div`
    position: absolute;
    inset: 12px;
    z-index: 5;
    display: grid;
    place-items: center;
    padding: 24px;
    border-radius: 12px;
    background: rgba(10, 12, 18, 0.94);
    border: 1px solid #3a2024;
    color: #ffd5d5;
    text-align: center;
    font-size: 13px;
    line-height: 20px;
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
                    {voiceState.participantCount <= 1
                        ? "Waiting for others"
                        : `${voiceState.participantCount} connected`}
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

                {remote.map((entry) => (
                    <Tile key={`${entry.userId}-${entry.screen}`} screen={entry.screen}>
                        <StreamVideo stream={entry.stream} screen={entry.screen} />
                        {entry.screen && <div className="screenTag">Screen</div>}
                        <div className="label">
                            {nameOf(entry.userId)}
                            {voiceState.masterId === entry.userId
                                ? " · Host"
                                : ""}
                        </div>
                    </Tile>
                ))}

                {localScreen && (
                    <Tile screen>
                        <StreamVideo stream={localScreen} screen />
                        <div className="screenTag">Screen</div>
                        <div className="label">{displayName} · You</div>
                    </Tile>
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
                    <div>
                        {voiceState.error}
                        <br />
                        <Button
                            palette="secondary"
                            onClick={voiceState.disconnect}>
                            Leave call
                        </Button>
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
