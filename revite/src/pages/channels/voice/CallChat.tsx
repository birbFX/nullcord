import { Hash, X } from "@styled-icons/boxicons-regular";
import { observer } from "mobx-react-lite";
import { Channel } from "revolt.js";
import styled from "styled-components/macro";

import { useEffect } from "preact/hooks";

import MessageBox from "../../../components/common/messaging/MessageBox";
import JumpToBottom from "../../../components/common/messaging/bars/JumpToBottom";
import TypingIndicator from "../../../components/common/messaging/bars/TypingIndicator";
import { voiceState } from "../../../lib/vortex/VoiceState";
import { MessageArea } from "../messaging/MessageArea";

const Pane = styled.aside`
    width: 340px;
    flex-shrink: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding-top: var(--header-height);
    box-sizing: border-box;
    border-left: 1px solid #1e1f22;
    background: #232428;
    color: #f2f3f5;

    @media (max-width: 900px) {
        display: none;
    }
`;

const Header = styled.div`
    height: 48px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border-bottom: 1px solid #111214;
    background: #1e1f22;
    color: #f2f3f5;

    .name {
        flex-grow: 1;
        overflow: hidden;
        font-size: 15px;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    button {
        width: 28px;
        height: 28px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 6px;
        cursor: pointer;
        color: #b5bac1;
        background: transparent;
    }

    button:hover {
        color: #f2f3f5;
        background: #35373c;
    }
`;

const Body = styled.div`
    flex-grow: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    /* The call pane is always dark, even when the app uses a light theme. */
    [data-component="content"] {
        color: #f2f3f5;
    }
`;

export const CallChat = observer(({ channel }: { channel: Channel }) => {
    useEffect(() => {
        if (channel.unread) {
            channel.client.unreads?.markRead(
                channel._id,
                channel.last_message_id!,
                true,
            );
        }

        function onFocus() {
            if (channel.unread) {
                channel.client.unreads?.markRead(
                    channel._id,
                    channel.last_message_id!,
                    true,
                );
            }
        }

        addEventListener("focus", onFocus);
        return () => removeEventListener("focus", onFocus);
    }, [channel]);

    return (
        <Pane>
            <Header>
                <Hash size={17} />
                <span className="name">{channel.name}</span>
                <button
                    type="button"
                    title="Hide chat"
                    onClick={() => voiceState.toggleChat()}>
                    <X size={17} />
                </button>
            </Header>
            <Body>
                <MessageArea channel={channel} />
                <JumpToBottom channel={channel} />
                <MessageBox channel={channel} />
                <TypingIndicator channel={channel} />
            </Body>
        </Pane>
    );
});
