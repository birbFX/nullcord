import {
    BarChartAlt2,
    Microphone,
    MicrophoneOff,
    PhoneOff,
    Video,
    VideoOff,
    VolumeFull,
    VolumeMute,
} from "@styled-icons/boxicons-solid";
import { Desktop } from "@styled-icons/boxicons-regular";
import { observer } from "mobx-react-lite";
import styled from "styled-components/macro";

import { Text } from "preact-i18n";
import { useEffect, useRef, useState } from "preact/hooks";

import { Button } from "@revoltchat/ui";
import type { Track } from "livekit-client";

import { voiceState, VoiceStatus } from "../../../lib/vortex/VoiceState";
import { recordVoiceState } from "../../../lib/quests";

import Tooltip from "../../../components/common/Tooltip";
import UserIcon from "../../../components/common/user/UserIcon";
import { useClient } from "../../../controllers/client/ClientController";
import { modalController } from "../../../controllers/modals/ModalController";

interface Props {
    id: string;
}

const VoiceBase = styled.div`
    margin-top: 48px;
    padding: 20px;
    background: var(--secondary-background);
    flex-grow: 1;
    min-height: 0;
    overflow-y: auto;

    .status {
        display: flex;
        position: absolute;
        align-items: center;

        padding: 10px;
        font-size: 13px;
        font-weight: 500;
        user-select: none;
        gap: 6px;

        color: var(--success);
        border-radius: var(--border-radius);
        background: var(--primary-background);

        svg {
            cursor: help;
        }
    }

    display: flex;
    flex-direction: column;

    .grid {
        margin: 40px 0 24px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        align-content: start;
        flex-grow: 1;
    }

    .tile {
        position: relative;
        aspect-ratio: 16 / 9;
        min-height: 150px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border-radius: calc(var(--border-radius) * 2);
        background: var(--primary-background);
        transition:
            box-shadow 120ms ease,
            transform 120ms ease;
    }

    .tile.speaking {
        box-shadow: 0 0 0 3px var(--success);
    }

    .tile video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #000;
    }

    .tile.screen video {
        object-fit: contain;
    }

    .label {
        position: absolute;
        left: 8px;
        bottom: 8px;
        max-width: calc(100% - 16px);
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 3px 8px;
        border-radius: 999px;
        color: white;
        background: rgba(0, 0, 0, 0.62);
        font-size: 12px;
        font-weight: 600;
        user-select: none;
        backdrop-filter: blur(4px);
    }

    .label svg {
        flex-shrink: 0;
    }

    .screen-badge {
        position: absolute;
        right: 8px;
        top: 8px;
        padding: 2px 7px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.62);
        color: white;
        font-size: 11px;
        font-weight: 600;
    }

    .actions {
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 10px;
        padding-bottom: 4px;
    }

    .error {
        margin: 0 auto 12px;
        color: var(--error);
        font-size: 13px;
        text-align: center;
    }
`;

function formatDuration(total: number) {
    const seconds = Math.max(0, total);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
        : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function VideoView({
    track,
    muted,
    contain,
}: {
    track: Track;
    muted?: boolean;
    contain?: boolean;
}) {
    const ref = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element || !track) return;

        track.attach(element);
        return () => {
            track.detach(element);
        };
    }, [track]);

    return (
        <video
            ref={ref}
            autoPlay
            playsInline
            muted={muted}
            style={contain ? { objectFit: "contain" } : undefined}
        />
    );
}

export default observer(({ id }: Props) => {
    const client = useClient();
    const self = client.user ? client.users.get(client.user._id) : undefined;

    const active = voiceState.roomId === id;
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!active) return;

        recordVoiceState(
            client.user?._id,
            voiceState.participants.size,
            voiceState.status === VoiceStatus.CONNECTED,
        );
    }, [
        active,
        client.user?._id,
        voiceState.status,
        voiceState.participants.size,
    ]);

    useEffect(() => {
        if (!active || voiceState.status !== VoiceStatus.CONNECTED) {
            setElapsed(0);
            return;
        }

        const started = Date.now();
        const timer = window.setInterval(
            () => setElapsed(Math.floor((Date.now() - started) / 1000)),
            1000,
        );

        return () => window.clearInterval(timer);
    }, [active, voiceState.status, voiceState.roomId]);

    const keys = Array.from(voiceState.participants.keys());

    if (!active) return null;

    const connected = voiceState.status === VoiceStatus.CONNECTED;
    const busy =
        voiceState.status === VoiceStatus.CONNECTING ||
        voiceState.status === VoiceStatus.AUTHENTICATING ||
        voiceState.status === VoiceStatus.RTC_CONNECTING;

    return (
        <VoiceBase onClick={() => voiceState.startAudioPlayback()}>
            {voiceState.error && (
                <div className="error">
                    {voiceState.error}
                    {connected && (
                        <Button
                            palette="secondary"
                            onClick={() => voiceState.startAudioPlayback()}>
                            Enable audio
                        </Button>
                    )}
                </div>
            )}

            <div className="grid">
                {keys.length !== 0
                    ? keys.map((user_id) => {
                          const user = client.users.get(user_id);
                          const state = voiceState.participants.get(user_id);
                          const isSelf = client.user?._id === user_id;

                          const screenTrack = state?.screen
                              ? voiceState.getVideoTrack(user_id, "screen")
                              : undefined;
                          const cameraTrack = state?.video
                              ? voiceState.getVideoTrack(user_id, "camera")
                              : undefined;
                          const track = screenTrack ?? cameraTrack;

                          return (
                              <div
                                  key={user_id}
                                  className={[
                                      "tile",
                                      state?.speaking ? "speaking" : "",
                                      screenTrack ? "screen" : "",
                                  ]
                                      .filter(Boolean)
                                      .join(" ")}>
                                  {track ? (
                                      <VideoView
                                          track={track}
                                          muted={isSelf}
                                          contain={!!screenTrack}
                                      />
                                  ) : (
                                      <UserIcon
                                          size={80}
                                          target={user}
                                          status={false}
                                          voice={
                                              isSelf && voiceState.isDeaf()
                                                  ? "deaf"
                                                  : state?.audio
                                                    ? undefined
                                                    : "muted"
                                          }
                                          onClick={() =>
                                              user_id !== client.user?._id &&
                                              modalController.push({
                                                  type: "user_profile",
                                                  user_id,
                                              })
                                          }
                                      />
                                  )}

                                  {screenTrack && (
                                      <div className="screen-badge">
                                          Screen share
                                      </div>
                                  )}

                                  <div className="label">
                                      {state?.audio ? (
                                          <Microphone size={12} />
                                      ) : (
                                          <MicrophoneOff size={12} />
                                      )}
                                      {user
                                          ? `${user.username}${
                                                user.discriminator
                                                    ? `#${user.discriminator}`
                                                    : ""
                                            }`
                                          : user_id}
                                      {isSelf ? " (you)" : ""}
                                  </div>
                              </div>
                          );
                      })
                    : self !== undefined && (
                          <div key={self._id} className="tile">
                              <UserIcon
                                  size={80}
                                  target={self}
                                  status={false}
                              />
                              <div className="label">
                                  <BarChartAlt2 size={12} />
                                  {busy ? "Connecting…" : "Waiting…"}
                              </div>
                          </div>
                      )}
            </div>

            <div className="status">
                <BarChartAlt2 size={16} />
                {connected
                    ? `${voiceState.participants.size} connected · ${formatDuration(elapsed)}`
                    : busy
                      ? "Connecting to voice…"
                      : "Not connected"}
            </div>

            <div className="actions">
                <Tooltip content={"Leave call"} placement={"top"}>
                    <Button palette="error" onClick={voiceState.disconnect}>
                        <PhoneOff width={20} />
                    </Button>
                </Tooltip>

                {voiceState.isProducing("audio") ? (
                    <Tooltip content={"Mute microphone"} placement={"top"}>
                        <Button
                            palette="accent"
                            onClick={() => voiceState.stopProducing("audio")}>
                            <Microphone width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Unmute microphone"} placement={"top"}>
                        <Button
                            onClick={() => voiceState.startProducing("audio")}>
                            <MicrophoneOff width={20} />
                        </Button>
                    </Tooltip>
                )}

                {voiceState.isProducing("video") ? (
                    <Tooltip content={"Turn camera off"} placement={"top"}>
                        <Button
                            palette="accent"
                            onClick={() => voiceState.stopProducing("video")}>
                            <Video width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Turn camera on"} placement={"top"}>
                        <Button
                            onClick={() => voiceState.startProducing("video")}>
                            <VideoOff width={20} />
                        </Button>
                    </Tooltip>
                )}

                {voiceState.isProducing("screen") ? (
                    <Tooltip content={"Stop sharing screen"} placement={"top"}>
                        <Button
                            palette="accent"
                            onClick={() => voiceState.stopProducing("screen")}>
                            <Desktop width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Share your screen"} placement={"top"}>
                        <Button
                            onClick={() => voiceState.startProducing("screen")}>
                            <Desktop width={20} />
                        </Button>
                    </Tooltip>
                )}

                {voiceState.isDeaf() ? (
                    <Tooltip content={"Undeafen"} placement={"top"}>
                        <Button
                            palette="accent"
                            onClick={() => voiceState.stopDeafen()}>
                            <VolumeMute width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Deafen"} placement={"top"}>
                        <Button onClick={() => voiceState.startDeafen()}>
                            <VolumeFull width={20} />
                        </Button>
                    </Tooltip>
                )}
            </div>
        </VoiceBase>
    );
});
