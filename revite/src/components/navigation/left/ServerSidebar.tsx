import { observer } from "mobx-react-lite";
import { Redirect, useParams } from "react-router";
import styled from "styled-components/macro";

import { useTriggerEvents } from "preact-context-menu";
import { useEffect } from "preact/hooks";

import { Category } from "@revoltchat/ui";

import ConditionalLink from "../../../lib/ConditionalLink";
import PaintCounter from "../../../lib/PaintCounter";
import { internalEmit } from "../../../lib/eventEmitter";

import { useApplicationState } from "../../../mobx/State";

import { useClient } from "../../../controllers/client/ClientController";
import CollapsibleSection from "../../common/CollapsibleSection";
import ServerHeader from "../../common/ServerHeader";
import { ChannelButton } from "../items/ButtonItem";
import ConnectionStatus from "../items/ConnectionStatus";

const ServerBase = styled.div`
    height: 100%;
    width: 100%;
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    background: var(--secondary-background);
    overflow: hidden;
`;

const ServerList = styled.div.attrs({ className: "dc-thin-scroller" })`
    padding: 8px 0 8px 8px;
    flex-grow: 1;
    overflow-y: auto;

    > svg {
        width: 100%;
    }
`;

export default observer(() => {
    const client = useClient();
    const state = useApplicationState();
    const { server: server_id, channel: channel_id } = useParams<{
        server: string;
        channel?: string;
    }>();

    const server = client.servers.get(server_id);
    if (!server) return <Redirect to="/" />;

    const channel = channel_id ? client.channels.get(channel_id) : undefined;

    // ! FIXME: move this globally
    // Track which channel the user was last on.
    useEffect(() => {
        if (!channel_id) return;
        if (!server_id) return;

        state.layout.setLastOpened(server_id, channel_id);
    }, [channel_id, server_id]);

    const uncategorised = new Set(server.channel_ids);
    const elements = [];

    function addChannel(id: string) {
        const entry = client.channels.get(id);
        if (!entry) return;

        const active = channel?._id === entry._id;
        const isUnread = entry.isUnread(state.notifications);
        const mentionCount = entry.getMentions(state.notifications);

        return (
            <ConditionalLink
                onClick={(e) => {
                    if (e.shiftKey) {
                        internalEmit(
                            "MessageBox",
                            "append",
                            `<#${entry._id}>`,
                            "channel_mention",
                        );
                        e.preventDefault();
                    }
                }}
                key={entry._id}
                active={active}
                to={`/server/${server!._id}/channel/${entry._id}`}>
                <ChannelButton
                    channel={entry}
                    active={active}
                    alert={
                        mentionCount.length > 0
                            ? "mention"
                            : isUnread
                            ? "unread"
                            : undefined
                    }
                    alertCount={mentionCount.length}
                    compact
                    muted={state.notifications.isMuted(entry)}
                />
            </ConditionalLink>
        );
    }

    if (server.categories) {
        for (const category of server.categories) {
            const channels = [];
            for (const id of category.channels) {
                uncategorised.delete(id);
                channels.push(addChannel(id));
            }

            if (category.title === "Default") {
                elements.push(...channels);
            } else {
                elements.push(
                    <CollapsibleSection
                        id={`category_${category.id}`}
                        defaultValue
                        summary={<Category>{category.title}</Category>}>
                        {channels}
                    </CollapsibleSection>,
                );
            }
        }
    }

    for (const id of Array.from(uncategorised).reverse()) {
        elements.unshift(addChannel(id));
    }

    return (
        <ServerBase>
            <ServerHeader server={server} />
            <ConnectionStatus />
            <ServerList
                {...useTriggerEvents("Menu", {
                    server_list: server._id,
                })}>
                {elements}
            </ServerList>
            <PaintCounter small />
        </ServerBase>
    );
});
