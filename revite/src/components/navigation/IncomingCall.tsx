import { PhoneCall } from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import { useHistory } from "react-router-dom";
import styled from "styled-components/macro";

import { useEffect, useState } from "preact/hooks";

import { Button } from "@revoltchat/ui";

import { useClient } from "../../controllers/client/ClientController";
import { useApplicationState } from "../../mobx/State";
import { voiceState } from "../../lib/vortex/VoiceState";

type IncomingCall = {
    channelId: string;
    initiatorId: string;
};

const Card = styled.div`
    @keyframes nullcord-ring {
        0%,
        100% {
            transform: rotate(0deg);
        }
        10%,
        30% {
            transform: rotate(-12deg);
        }
        20%,
        40% {
            transform: rotate(12deg);
        }
        50% {
            transform: rotate(0deg);
        }
    }

    position: fixed;
    top: 64px;
    right: 20px;
    z-index: 10000;
    width: min(420px, calc(100vw - 40px));
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    border-radius: 16px;
    color: var(--foreground);
    background: var(--secondary-background);
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
    border: 1px solid var(--tertiary-background);

    .icon {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        color: white;
        background: var(--success);
        animation: nullcord-ring 1.4s infinite;
    }

    .info {
        flex-grow: 1;
        min-width: 0;
    }

    .title {
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
    }

    .subtitle {
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--secondary-foreground);
        font-size: 12px;
    }

    .actions {
        flex-shrink: 0;
        display: flex;
        flex-direction: row;
        gap: 6px;
    }

    @media (max-width: 480px) {
        .actions {
            flex-direction: column;
        }
    }

    @media (max-width: 720px) {
        top: 56px;
        right: 12px;
        left: 12px;
        width: auto;
    }
`;

export const IncomingCall = observer(() => {
    const client = useClient();
    const history = useHistory();
    const state = useApplicationState();
    const [call, setCall] = useState<IncomingCall | null>(null);

    useEffect(() => {
        const handler = (packet: any) => {
            if (packet?.type !== "VoiceCallUpdate") return;

            const channelId = packet.channel_id as string;
            const initiatorId = packet.initiator_id as string;

            if (packet.ended) {
                setCall((current) =>
                    current?.channelId === channelId ? null : current,
                );
                return;
            }

            if (!channelId || !initiatorId) return;
            if (initiatorId === client.user?._id) return;
            if (voiceState.roomId === channelId) return;
            if (!client.channels.get(channelId)) return;

            setCall({ channelId, initiatorId });
        };

        client.addListener("packet", handler);
        return () => client.removeListener("packet", handler);
    }, [client]);

    useEffect(() => {
        if (!call) return;

        const play = () => state.settings.sounds.playSound("call_join");
        play();
        const ring = window.setInterval(play, 3000);
        const dismiss = window.setTimeout(() => setCall(null), 45_000);

        return () => {
            window.clearInterval(ring);
            window.clearTimeout(dismiss);
        };
    }, [call, state]);

    if (!call) return null;

    const channel = client.channels.get(call.channelId);
    const caller = client.users.get(call.initiatorId);
    const callerName =
        caller?.display_name || caller?.username || "Someone";
    const place =
        channel?.name ||
        (channel?.channel_type === "DirectMessage"
            ? "Direct message"
            : "Voice channel");

    return (
        <Card role="dialog" aria-live="assertive">
            <div className="icon">
                <PhoneCall size={22} />
            </div>
            <div className="info">
                <div className="title">Incoming call</div>
                <div className="subtitle">
                    {callerName} · {place}
                </div>
            </div>
            <div className="actions">
                <Button
                    palette="accent"
                    onClick={() => {
                        if (channel) {
                            void voiceState.connect(channel);
                            history.push(`/channel/${channel._id}`);
                        }
                        setCall(null);
                    }}>
                    Join
                </Button>
                <Button
                    palette="error"
                    onClick={() => setCall(null)}>
                    Decline
                </Button>
            </div>
        </Card>
    );
});
