import { Route, Switch, useParams } from "react-router";

import { useEffect, useState } from "preact/hooks";

import { internalSubscribe } from "../../lib/eventEmitter";

import { useClient } from "../../controllers/client/ClientController";

import SidebarBase from "./SidebarBase";
import MemberSidebar from "./right/MemberSidebar";
import { SearchSidebar } from "./right/Search";

export default function RightSidebar() {
    const client = useClient();
    const { channel: channelId } = useParams<{ channel?: string }>();
    const isDM =
        client.channels.get(channelId ?? "")?.channel_type === "DirectMessage";
    const [sidebar, setSidebar] = useState<"search" | undefined>();
    const close = () => setSidebar(undefined);

    useEffect(
        () =>
            internalSubscribe(
                "RightSidebar",
                "open",
                setSidebar as (...args: unknown[]) => void,
            ),
        [setSidebar],
    );

    const content =
        sidebar === "search" ? (
            <SearchSidebar close={close} />
        ) : (
            <MemberSidebar />
        );

    return (
        <SidebarBase
            style={{
                width: isDM ? "340px" : "var(--dc-member-list-width)",
                flexShrink: 0,
                background: "var(--secondary-background)",
            }}>
            <Switch>
                <Route path="/server/:server/channel/:channel">{content}</Route>
                <Route path="/channel/:channel">{content}</Route>
            </Switch>
        </SidebarBase>
    );
}
