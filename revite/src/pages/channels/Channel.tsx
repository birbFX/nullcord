import { Hash, Volume } from "@styled-icons/boxicons-regular";
import { Ghost } from "@styled-icons/boxicons-solid";
import dayjs from "dayjs";
import { reaction } from "mobx";
import { observer } from "mobx-react-lite";
import { Redirect, useParams } from "react-router-dom";
import { Channel as ChannelI } from "revolt.js";
import styled from "styled-components/macro";

import { Text } from "preact-i18n";
import { useEffect, useState } from "preact/hooks";

import ErrorBoundary from "../../lib/ErrorBoundary";
import { internalSubscribe } from "../../lib/eventEmitter";
import { isTouchscreenDevice } from "../../lib/isTouchscreenDevice";

import { useApplicationState } from "../../mobx/State";
import { SIDEBAR_MEMBERS } from "../../mobx/stores/Layout";

import AgeGate from "../../components/common/AgeGate";
import MessageBox from "../../components/common/messaging/MessageBox";
import JumpToBottom from "../../components/common/messaging/bars/JumpToBottom";
import NewMessages from "../../components/common/messaging/bars/NewMessages";
import TypingIndicator from "../../components/common/messaging/bars/TypingIndicator";
import RightSidebar from "../../components/navigation/RightSidebar";
import { PageHeader } from "../../components/ui/Header";
import { useClient } from "../../controllers/client/ClientController";
import ChannelHeader from "./ChannelHeader";
import { MessageArea } from "./messaging/MessageArea";
import VoiceHeader from "./voice/VoiceHeader";
import { voiceState } from "../../lib/vortex/VoiceState";
import { isVoiceChannel } from "../../lib/voiceChannels";

const ChannelMain = styled.div.attrs({ "data-component": "channel" })`
    flex-grow: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
    flex-direction: row;
`;

const ChannelContent = styled.div.attrs({
    "data-component": "content",
})`
    flex-grow: 1;
    display: flex;
    overflow: hidden;
    flex-direction: column;
`;

const PlaceholderBase = styled.div`
    @keyframes floating {
        0% {
            transform: translate(0, 0px);
        }
        50% {
            transform: translate(0, 15px);
        }
        100% {
            transform: translate(0, -0px);
        }
    }

    flex-grow: 1;
    display: flex;
    overflow: hidden;
    flex-direction: column;

    .floating {
        animation-name: floating;
        animation-duration: 3s;
        animation-iteration-count: infinite;
        animation-timing-function: ease-in-out;
    }

    .placeholder {
        justify-content: center;
        text-align: center;
        margin: auto;
        padding: 12px;

        .primary {
            color: var(--secondary-foreground);
            font-weight: 700;
            font-size: 22px;
            margin: 0 0 5px 0;
        }

        .secondary {
            color: var(--tertiary-foreground);
            font-weight: 400;
        }

        svg {
            margin: 2em auto;
            fill-opacity: 0.8;
        }
    }
`;

export const Channel = observer(
    ({ id, server_id }: { id: string; server_id: string }) => {
        const client = useClient();
        const state = useApplicationState();

        if (!client.channels.exists(id)) {
            if (server_id) {
                const server = client.servers.get(server_id);
                if (server && server.channel_ids.length > 0) {
                    let target_id = server.channel_ids[0];
                    const last_id = state.layout.getLastOpened(server_id);
                    if (last_id) {
                        if (client.channels.has(last_id)) {
                            target_id = last_id;
                        }
                    }

                    return (
                        <Redirect
                            to={`/server/${server_id}/channel/${target_id}`}
                        />
                    );
                }
            } else {
                return <Redirect to="/" />;
            }

            return <ChannelPlaceholder />;
        }

        const channel = client.channels.get(id)!;
        if (isVoiceChannel(channel)) {
            return <VoiceChannel channel={channel} />;
        }

        return <TextChannel channel={channel} />;
    },
);

const TextChannel = observer(({ channel }: { channel: ChannelI }) => {
    const layout = useApplicationState().layout;

    // Store unread location.
    const [lastId, setLastId] = useState<string | undefined>(undefined);

    useEffect(
        () =>
            internalSubscribe("NewMessages", "hide", () =>
                setLastId(undefined),
            ),
        [],
    );

    useEffect(
        () => internalSubscribe("NewMessages", "mark", setLastId as any),
        [],
    );

    // Mark channel as read.
    useEffect(() => {
        setLastId(
            (channel.unread
                ? channel.client.unreads?.getUnread(channel._id)?.last_id
                : undefined) ?? undefined,
        );

        const checkUnread = () =>
            channel.unread &&
            document.hasFocus() &&
            channel.client.unreads!.markRead(
                channel._id,
                channel.last_message_id!,
                true,
            );

        checkUnread();
        return reaction(
            () => channel.last_message_id,
            () => checkUnread(),
        );
    }, [channel]);

    useEffect(() => {
        let lastSubscribed: number | undefined;
        function subscribe() {
            if (document.hasFocus()) {
                if (
                    !lastSubscribed ||
                    dayjs().subtract(10, "minutes").isAfter(lastSubscribed)
                ) {
                    lastSubscribed = +new Date();
                    channel.server?.subscribe();
                }
            }
        }

        // Trigger logic every minute
        const subTimer = setInterval(subscribe, 60e3);
        subscribe();

        function onFocus() {
            // Mark channel as read if it's unread
            if (channel.unread) {
                channel.client.unreads!.markRead(
                    channel._id,
                    channel.last_message_id!,
                    true,
                );
            }

            // Subscribe to channel if expired
            subscribe();
        }

        addEventListener("focus", onFocus);

        return () => {
            removeEventListener("focus", onFocus);
            clearInterval(subTimer);
        };
    }, [channel]);

    return (
        <AgeGate
            type="channel"
            channel={channel}
            gated={
                !!(
                    (channel.channel_type === "TextChannel" ||
                        channel.channel_type === "Group") &&
                    channel.nsfw
                )
            }>
            <ChannelHeader channel={channel} />
            <ChannelMain>
                <ErrorBoundary section="renderer">
                    <ChannelContent>
                        {voiceState.roomId === channel._id ? (
                            <VoiceHeader id={channel._id} embedded />
                        ) : (
                            <>
                                <NewMessages
                                    channel={channel}
                                    last_id={lastId}
                                />
                                <MessageArea
                                    channel={channel}
                                    last_id={lastId}
                                />
                                <JumpToBottom channel={channel} />
                                <MessageBox channel={channel} />
                                <TypingIndicator channel={channel} />
                            </>
                        )}
                    </ChannelContent>
                </ErrorBoundary>
                {!isTouchscreenDevice &&
                    layout.getSectionState(SIDEBAR_MEMBERS, true) && (
                        <RightSidebar />
                    )}
            </ChannelMain>
        </AgeGate>
    );
});

const VoiceLobby = styled.div`
    flex-grow: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--header-height) 16px 0;
    background: #000;

    .card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        text-align: center;
        color: #fff;
    }

    .icon {
        width: 80px;
        height: 80px;
        display: grid;
        place-items: center;
        margin-bottom: 8px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
    }

    h2 {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
    }

    p {
        margin: 0 0 16px;
        font-size: 16px;
        color: #b5bac1;
    }

    button {
        all: unset;
        cursor: pointer;
        padding: 10px 24px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        color: #fff;
        background: #248046;

        &:hover {
            background: #1a6334;
        }
    }
`;

const VoiceChannel = observer(({ channel }: { channel: ChannelI }) => {
    const connected = voiceState.roomId === channel._id;

    return (
        <>
            <ChannelHeader channel={channel} />
            {connected ? (
                <VoiceHeader id={channel._id} embedded />
            ) : (
                <VoiceLobby>
                    <div className="card">
                        <div className="icon">
                            <Volume size={40} />
                        </div>
                        <h2>{channel.name}</h2>
                        <p>
                            {voiceState.roomId
                                ? "You're in another call. Joining will switch to this channel."
                                : "No one is talking yet. Jump in and start the conversation."}
                        </p>
                        <button
                            onClick={async () => {
                                await voiceState.loadVoice();
                                voiceState.connect(channel);
                            }}>
                            Join Voice
                        </button>
                    </div>
                </VoiceLobby>
            )}
        </>
    );
});

function ChannelPlaceholder() {
    return (
        <PlaceholderBase>
            <PageHeader icon={<Hash size={24} />}>
                <span className="name">
                    <Text id="app.main.channel.errors.nochannel" />
                </span>
            </PageHeader>

            <div className="placeholder">
                <div className="floating">
                    <Ghost width={80} />
                </div>
                <div className="primary">
                    <Text id="app.main.channel.errors.title" />
                </div>
                <div className="secondary">
                    <Text id="app.main.channel.errors.nochannels" />
                </div>
            </div>
        </PlaceholderBase>
    );
}

export default function ChannelComponent() {
    const { channel, server } =
        useParams<{ channel: string; server: string }>();

    return <Channel id={channel} server_id={server} key={channel} />;
}
