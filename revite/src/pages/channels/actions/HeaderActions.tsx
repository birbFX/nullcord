/* eslint-disable react-hooks/rules-of-hooks */
import { Search } from "@styled-icons/boxicons-regular";
import {
    UserPlus,
    Cog,
    PhoneCall,
    PhoneOff,
    Group,
    UserCircle,
} from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import { useHistory } from "react-router-dom";
import styled from "styled-components/macro";

import { IconButton } from "@revoltchat/ui";

import { chainedDefer, defer } from "../../../lib/defer";
import { internalEmit } from "../../../lib/eventEmitter";
import { isTouchscreenDevice } from "../../../lib/isTouchscreenDevice";
import { isVoiceChannel } from "../../../lib/voiceChannels";
import { voiceState, VoiceStatus } from "../../../lib/vortex/VoiceState";

import { useApplicationState } from "../../../mobx/State";
import { SIDEBAR_MEMBERS } from "../../../mobx/stores/Layout";

import Tooltip from "../../../components/common/Tooltip";
import UpdateIndicator from "../../../components/common/UpdateIndicator";
import { modalController } from "../../../controllers/modals/ModalController";
import { ChannelHeaderProps } from "../ChannelHeader";

const Container = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;

    a.active {
        color: var(--dc-interactive-active);
    }

    a.unavailable {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const SearchBar = styled.div`
    display: flex;
    align-items: center;
    position: relative;
    width: 144px;
    height: 24px;
    border-radius: 4px;
    cursor: text;
    background: var(--dc-bg-input);
    transition: width 0.25s ease;

    span {
        flex: 1;
        padding: 0 8px;
        font-size: 14px;
        font-weight: 500;
        line-height: 24px;
        white-space: nowrap;
        overflow: hidden;
        color: var(--tertiary-foreground);
    }

    svg {
        margin-right: 6px;
        color: var(--tertiary-foreground);
    }

    &:hover {
        width: 160px;
    }
`;

const HeaderActions = observer(({ channel }: ChannelHeaderProps) => {
    const layout = useApplicationState().layout;
    const history = useHistory();
    const membersOpen =
        !isTouchscreenDevice && layout.getSectionState(SIDEBAR_MEMBERS, true);

    function slideOpen() {
        if (!isTouchscreenDevice) return;
        const panels = document.querySelector("#app > div > div > div");
        panels?.scrollTo({
            behavior: "smooth",
            left: panels.clientWidth * 3,
        });
    }

    function openSearch() {
        if (
            !isTouchscreenDevice &&
            !layout.getSectionState(SIDEBAR_MEMBERS, true)
        ) {
            layout.toggleSectionState(SIDEBAR_MEMBERS, true);
        }

        slideOpen();
        chainedDefer(() => internalEmit("RightSidebar", "open", "search"));
    }

    function openMembers() {
        if (!isTouchscreenDevice) {
            layout.toggleSectionState(SIDEBAR_MEMBERS, true);
        }

        slideOpen();
        chainedDefer(() => internalEmit("RightSidebar", "open", undefined));
    }

    return (
        <>
            <Container>
                <UpdateIndicator style="channel" />
                {channel.channel_type === "Group" && (
                    <>
                        <Tooltip content="Add Friends to DM" placement="bottom">
                        <IconButton
                            onClick={() =>
                                modalController.push({
                                    type: "user_picker",
                                    omit: channel.recipient_ids!,
                                    callback: async (users) => {
                                        for (const user of users) {
                                            await channel.addMember(user);
                                        }
                                    },
                                })
                            }>
                            <UserPlus size={24} />
                        </IconButton>
                        </Tooltip>
                        <Tooltip content="Group Settings" placement="bottom">
                            <IconButton
                                onClick={() =>
                                    history.push(
                                        `/channel/${channel._id}/settings`,
                                    )
                                }>
                                <Cog size={24} />
                            </IconButton>
                        </Tooltip>
                    </>
                )}
                <VoiceActions channel={channel} />
                {channel.channel_type === "DirectMessage" && (
                    <Tooltip
                        content={
                            membersOpen ? "Hide User Profile" : "Show User Profile"
                        }
                        placement="bottom">
                        <IconButton
                            className={membersOpen ? "active" : undefined}
                            onClick={openMembers}>
                            <UserCircle size={24} />
                        </IconButton>
                    </Tooltip>
                )}
                {(channel.channel_type === "Group" ||
                    channel.channel_type === "TextChannel" ||
                    channel.channel_type === "VoiceChannel") && (
                    <Tooltip
                        content={
                            membersOpen ? "Hide Member List" : "Show Member List"
                        }
                        placement="bottom">
                        <IconButton
                            className={membersOpen ? "active" : undefined}
                            onClick={openMembers}>
                            <Group size={24} />
                        </IconButton>
                    </Tooltip>
                )}
                {!isVoiceChannel(channel) && (
                    <SearchBar
                        role="search"
                        onClick={openSearch}
                        aria-label="Search">
                        <span>Search</span>
                        <Search size={16} />
                    </SearchBar>
                )}
            </Container>
        </>
    );
});

export default HeaderActions;

const VoiceActions = observer(
    ({ channel }: Pick<ChannelHeaderProps, "channel">) => {
        if (
            channel.channel_type === "SavedMessages" ||
            (channel.channel_type === "TextChannel" && !isVoiceChannel(channel))
        )
            return null;

        if (voiceState.status >= VoiceStatus.READY) {
            if (voiceState.roomId === channel._id) {
                return (
                    <Tooltip content="Leave Call" placement="bottom">
                        <IconButton onClick={voiceState.disconnect}>
                            <PhoneOff size={24} color="var(--error)" />
                        </IconButton>
                    </Tooltip>
                );
            }

            return (
                <Tooltip content="Start Voice Call" placement="bottom">
                    <IconButton
                        onClick={async () => {
                            await voiceState.loadVoice();
                            voiceState.disconnect();
                            voiceState.connect(channel);
                        }}>
                        <PhoneCall size={24} />
                    </IconButton>
                </Tooltip>
            );
        }

        return (
            <Tooltip content="Voice is unavailable" placement="bottom">
                <IconButton className="unavailable">
                    <PhoneCall size={24} />
                </IconButton>
            </Tooltip>
        );
    },
);
