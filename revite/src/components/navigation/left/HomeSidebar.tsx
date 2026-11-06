import { Plus } from "@styled-icons/boxicons-regular";
import {
    Home,
    UserDetail,
    Wrench,
    Notepad,
    Star,
    Gift,
} from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import { Link, useLocation, useParams } from "react-router-dom";
import styled, { css } from "styled-components/macro";

import { Text } from "preact-i18n";
import { useEffect, useState } from "preact/hooks";

import { Category, IconButton } from "@revoltchat/ui";

import ConditionalLink from "../../../lib/ConditionalLink";
import PaintCounter from "../../../lib/PaintCounter";
import { isTouchscreenDevice } from "../../../lib/isTouchscreenDevice";

import { useApplicationState } from "../../../mobx/State";

import placeholderSVG from "../items/placeholder.svg";

import { useClient } from "../../../controllers/client/ClientController";
import { isDeveloper } from "../../../lib/owner";
import { dailyQuests, isQuestDone } from "../../../lib/orbs";
import { getQuestProgress } from "../../../lib/quests";
import { isPluginEnabled } from "../../../lib/plugins";
import { modalController } from "../../../controllers/modals/ModalController";
import { GenericSidebarBase, GenericSidebarList } from "../SidebarBase";
import ButtonItem, { ChannelButton } from "../items/ButtonItem";
import ConnectionStatus from "../items/ConnectionStatus";

const Navbar = styled.div`
    display: flex;
    align-items: center;
    padding: 0 10px;
    flex-shrink: 0;
    height: var(--header-height);
    position: relative;
    z-index: 2;
    box-shadow: var(--dc-elevation-low);
    isolation: isolate;
    background-color: var(--dc-solid-base);

    &::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        background: var(--secondary-background);
    }

    ${() =>
        isTouchscreenDevice &&
        css`
            height: 56px;
        `}

    input {
        all: unset;
        width: 100%;
        height: 28px;
        padding: 1px 6px;
        box-sizing: border-box;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        line-height: 24px;
        cursor: text;
        color: var(--foreground);
        background: var(--dc-bg-input);

        &::placeholder {
            color: var(--tertiary-foreground);
            opacity: 1;
        }
    }
`;

export default observer(() => {
    const { pathname } = useLocation();
    const client = useClient();
    const state = useApplicationState();
    const { channel: channel_id } = useParams<{ channel: string }>();

    const channels = [...client.channels.values()].filter(
        (x) =>
            (x.channel_type === "DirectMessage" && x.active) ||
            x.channel_type === "Group",
    );

    const channel = client.channels.get(channel_id);
    const [filter, setFilter] = useState("");
    const query = filter.trim().toLowerCase();
    const quests = dailyQuests(client.user?._id);
    const questsDone = quests.filter(
        (quest) =>
            isQuestDone(client.user?._id, quest) ||
            getQuestProgress(client.user?._id, quest).verified,
    ).length;

    // ! FIXME: move this globally
    // Track what page the user was last on (in home page).
    useEffect(() => state.layout.setLastHomePath(pathname), [pathname]);

    channels.sort((b, a) =>
        a.last_message_id_or_past.localeCompare(b.last_message_id_or_past),
    );

    // ! FIXME: must be a better way
    const incoming = [...client.users.values()].filter(
        (user) => user?.relationship === "Incoming",
    );

    return (
        <GenericSidebarBase mobilePadding>
            <Navbar>
                <input
                    type="text"
                    value={filter}
                    aria-label="Find or start a conversation"
                    placeholder="Find or start a conversation"
                    onInput={(e) => setFilter(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Escape" && setFilter("")}
                />
            </Navbar>
            <ConnectionStatus />
            <GenericSidebarList>
                <ConditionalLink active={pathname === "/"} to="/">
                    <ButtonItem active={pathname === "/"}>
                        <Home size={20} />
                        <span>
                            <Text id="app.navigation.tabs.home" />
                        </span>
                    </ButtonItem>
                </ConditionalLink>
                {!isTouchscreenDevice && (
                    <>
                        <ConditionalLink
                            active={pathname === "/friends"}
                            to="/friends">
                            <ButtonItem
                                active={pathname === "/friends"}
                                alert={
                                    incoming.length > 0 ? "mention" : undefined
                                }
                                alertCount={incoming.length}>
                                <UserDetail size={20} />
                                <span>
                                    <Text id="app.navigation.tabs.friends" />
                                </span>
                            </ButtonItem>
                        </ConditionalLink>
                    </>
                )}
                <ConditionalLink
                    active={channel?.channel_type === "SavedMessages"}
                    to="/open/saved">
                    <ButtonItem
                        active={channel?.channel_type === "SavedMessages"}>
                        <Notepad size={20} />
                        <span>
                            <Text id="app.navigation.tabs.saved" />
                        </span>
                    </ButtonItem>
                </ConditionalLink>
                <ConditionalLink active={pathname === "/nitro"} to="/nitro">
                    <ButtonItem active={pathname === "/nitro"}>
                        <Star size={20} />
                        <span>Nitro</span>
                    </ButtonItem>
                </ConditionalLink>
                <ConditionalLink
                    active={pathname === "/quests"}
                    to="/quests">
                    <ButtonItem active={pathname === "/quests"}>
                        <Gift size={20} />
                        <span>Quests</span>
                    </ButtonItem>
                </ConditionalLink>
                {isPluginEnabled("quest-helper") && (
                    <div
                        style={{
                            padding: "2px 14px 8px 42px",
                            fontSize: 11,
                            color: "var(--secondary-foreground)",
                        }}>
                        Today: {questsDone}/{quests.length} verified
                    </div>
                )}
                {isDeveloper(client.user) && (
                    <Link to="/dev">
                        <ButtonItem active={pathname === "/dev"}>
                            <Wrench size={20} />
                            <span>
                                <Text id="app.navigation.tabs.dev" />
                            </span>
                        </ButtonItem>
                    </Link>
                )}
                <Category>
                    <span>Direct Messages</span>
                    <IconButton
                        onClick={() =>
                            modalController.push({
                                type: "create_group",
                            })
                        }>
                        <Plus size={16} />
                    </IconButton>
                </Category>
                {channels.length === 0 && (
                    <img src={placeholderSVG} loading="eager" />
                )}
                {channels.map((channel) => {
                    let user;
                    if (channel.channel_type === "DirectMessage") {
                        if (!channel.active) return null;
                        user = channel.recipient;

                        if (!user) return null;
                    }

                    if (query) {
                        const name = (
                            user
                                ? `${user.display_name ?? ""} ${user.username}`
                                : channel.name ?? ""
                        ).toLowerCase();
                        if (!name.includes(query)) return null;
                    }

                    const isUnread = channel.isUnread(state.notifications);
                    const mentionCount = channel.getMentions(
                        state.notifications,
                    ).length;

                    return (
                        <ConditionalLink
                            key={channel._id}
                            active={channel._id === channel_id}
                            to={`/channel/${channel._id}`}>
                            <ChannelButton
                                user={user}
                                channel={channel}
                                alert={
                                    mentionCount > 0
                                        ? "mention"
                                        : isUnread
                                        ? "unread"
                                        : undefined
                                }
                                alertCount={mentionCount}
                                active={channel._id === channel_id}
                            />
                        </ConditionalLink>
                    );
                })}
                <PaintCounter />
            </GenericSidebarList>
        </GenericSidebarBase>
    );
});
