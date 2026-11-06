import { observer } from "mobx-react-lite";
import { Route, Switch } from "react-router";
import { useLocation } from "react-router-dom";

import { isTouchscreenDevice } from "../../lib/isTouchscreenDevice";

import { useApplicationState } from "../../mobx/State";
import { SIDEBAR_CHANNELS } from "../../mobx/stores/Layout";

import SidebarBase, { SidebarColumn } from "./SidebarBase";
import HomeSidebar from "./left/HomeSidebar";
import ServerListSidebar from "./left/ServerListSidebar";
import ServerSidebar from "./left/ServerSidebar";
import UserPanel from "./left/UserPanel";

export default observer(() => {
    const layout = useApplicationState().layout;
    const { pathname } = useLocation();
    const isOpen =
        isTouchscreenDevice || layout.getSectionState(SIDEBAR_CHANNELS, true);

    return (
        <SidebarBase>
            <Switch>
                <Route path="/settings" />
                <Route path="/server/:server/channel/:channel">
                    <ServerListSidebar />
                    {isOpen && (
                        <SidebarColumn>
                            <ServerSidebar />
                            <UserPanel />
                        </SidebarColumn>
                    )}
                </Route>
                <Route path="/server/:server">
                    <ServerListSidebar />
                    {isOpen && (
                        <SidebarColumn>
                            <ServerSidebar />
                            <UserPanel />
                        </SidebarColumn>
                    )}
                </Route>
                <Route path="/channel/:channel">
                    <ServerListSidebar />
                    {isOpen && (
                        <SidebarColumn>
                            <HomeSidebar />
                            <UserPanel />
                        </SidebarColumn>
                    )}
                </Route>
                <Route path="/">
                    <ServerListSidebar />
                    {isOpen && (
                        <SidebarColumn>
                            <HomeSidebar />
                            <UserPanel />
                        </SidebarColumn>
                    )}
                </Route>
            </Switch>
        </SidebarBase>
    );
});
