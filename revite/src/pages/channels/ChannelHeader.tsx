import { At, Hash, Volume } from "@styled-icons/boxicons-regular";
import { Notepad, Group } from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import { Channel, User } from "revolt.js";
import styled from "styled-components/macro";

import { isTouchscreenDevice } from "../../lib/isTouchscreenDevice";
import { isVoiceChannel } from "../../lib/voiceChannels";

import { useStatusColour } from "../../components/common/user/UserIcon";
import UserStatus from "../../components/common/user/UserStatus";
import Markdown from "../../components/markdown/Markdown";
import { PageHeader } from "../../components/ui/Header";
import { ChannelName } from "../../controllers/client/jsx/ChannelName";
import { modalController } from "../../controllers/modals/ModalController";
import HeaderActions from "./actions/HeaderActions";

export interface ChannelHeaderProps {
    channel: Channel;
    toggleSidebar?: () => void;
    toggleChannelSidebar?: () => void;
}

const Info = styled.div`
    flex-grow: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;

    display: flex;
    gap: 0;
    align-items: center;

    * {
        display: inline-block;
    }

    .name {
        font-size: 16px;
        font-weight: 600;
        line-height: 20px;
        color: var(--dc-header-primary);
        flex-shrink: 0;
        max-width: 50%;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .divider {
        width: 1px;
        height: 24px;
        margin: 0 8px;
        flex-shrink: 0;
        background-color: var(--dc-modifier-selected);
    }

    .status {
        width: 10px;
        height: 10px;
        display: inline-block;
        margin-inline-end: 6px;
        border-radius: var(--border-radius-half);
    }

    .desc {
        min-width: 0;
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 14px;
        font-weight: 500;
        line-height: 18px;
        color: var(--dc-header-secondary);

        > * {
            pointer-events: none;
        }

        [data-component="markdown"] {
            line-height: 18px;
            color: inherit;
        }
    }
`;

export default observer(({ channel }: ChannelHeaderProps) => {
    let icon, recipient: User | undefined;
    switch (isVoiceChannel(channel) ? "VoiceChannel" : channel.channel_type) {
        case "SavedMessages":
            icon = <Notepad size={24} />;
            break;
        case "DirectMessage":
            icon = <At size={24} />;
            recipient = channel.recipient;
            break;
        case "Group":
            icon = <Group size={24} />;
            break;
        case "TextChannel":
            icon = <Hash size={24} />;
            break;
        case "VoiceChannel":
            icon = <Volume size={24} />;
            break;
    }

    return (
        <PageHeader icon={icon} withTransparency>
            <Info>
                <span className="name">
                    <ChannelName channel={channel} />
                </span>
                {isTouchscreenDevice &&
                    channel.channel_type === "DirectMessage" && (
                        <>
                            <div className="divider" />
                            <span className="desc">
                                <div
                                    className="status"
                                    style={{
                                        backgroundColor:
                                            useStatusColour(recipient),
                                    }}
                                />
                                <UserStatus user={recipient} />
                            </span>
                        </>
                    )}
                {!isTouchscreenDevice &&
                    (channel.channel_type === "Group" ||
                        channel.channel_type === "TextChannel") &&
                    channel.description && (
                        <>
                            <div className="divider" />
                            <span
                                className="desc"
                                onClick={() =>
                                    modalController.push({
                                        type: "channel_info",
                                        channel,
                                    })
                                }>
                                <Markdown
                                    content={
                                        channel.description.split("\n")[0] ?? ""
                                    }
                                    disallowBigEmoji
                                />
                            </span>
                        </>
                    )}
            </Info>
            <HeaderActions channel={channel} />
        </PageHeader>
    );
});
