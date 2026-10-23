import {
    Sync as SyncIcon,
    Globe,
    LogOut,
    Desktop,
    ListUl,
    Tag,
} from "@styled-icons/boxicons-regular";
import {
    Bell,
    Palette,
    IdCard,
    CheckShield,
    Flask,
    User,
    Megaphone,
    Speaker,
    Plug,
    Bot,
    Trash,
} from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import { Route, Switch, useHistory } from "react-router-dom";
import styled from "styled-components/macro";

import styles from "./Settings.module.scss";
import { openContextMenu } from "preact-context-menu";
import { Text } from "preact-i18n";


import UserIcon from "../../components/common/user/UserIcon";
import { Username } from "../../components/common/user/UserShort";
import UserStatus from "../../components/common/user/UserStatus";
import ButtonItem from "../../components/navigation/items/ButtonItem";
import {
    useClient,
    clientController,
} from "../../controllers/client/ClientController";
import RequiresOnline from "../../controllers/client/jsx/RequiresOnline";
import { displayDiscriminator } from "../../lib/owner";
import { modalController } from "../../controllers/modals/ModalController";
import { GenericSettings } from "./GenericSettings";
import { Account } from "./panes/Account";
import { Appearance } from "./panes/Appearance";
import { Audio } from "./panes/Audio";
import { ExperimentsPage } from "./panes/Experiments";
import { Feedback } from "./panes/Feedback";
import { Languages } from "./panes/Languages";
import { MyBots } from "./panes/MyBots";
import { Native } from "./panes/Native";
import { Notifications } from "./panes/Notifications";
import { PluginsPage } from "./panes/Plugins";
import { Profile } from "./panes/Profile";
import { ServerTags } from "./panes/ServerTags";
import { Sessions } from "./panes/Sessions";
import { Sync } from "./panes/Sync";

const AccountHeader = styled.div`
    display: flex;
    flex-direction: column;
    border-radius: var(--border-radius);
    overflow: hidden;
    margin-bottom: 10px;

    .account {
        padding: 20px;
        gap: 10px;
        align-items: center;
        display: flex;
        background: var(--secondary-background);

        .details {
            display: flex;
            flex-direction: column;
            font-size: 12px;
            gap: 2px;

            .new {
                font-size: 20px;
                font-weight: 600;
            }

            .full {
                font-size: 14px;
                font-weight: 600;
            }
        }
    }

    .statusChanger {
        display: flex;
        align-items: center;
        background: var(--tertiary-background);

        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        .status {
            padding-inline-start: 12px;
            height: 48px;
            display: flex;
            align-items: center;
            color: var(--secondary-foreground);
            flex-grow: 1;

            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        svg {
            width: 48px;
            flex-shrink: 0;
        }
    }
`;

export default observer(() => {
    const history = useHistory();
    const client = useClient();
    function switchPage(to?: string) {
        if (to) {
            history.replace(`/settings/${to}`);
        } else {
            history.replace(`/settings`);
        }
    }

    return (
        <GenericSettings
            pages={[
                {
                    category: (
                        <Text id="app.settings.categories.user_settings" />
                    ),
                    id: "account",
                    icon: <User size={20} />,
                    title: <Text id="app.settings.pages.account.title" />,
                },
                {
                    id: "profile",
                    icon: <IdCard size={20} />,
                    title: <Text id="app.settings.pages.profile.title" />,
                },
                {
                    id: "server-tags",
                    icon: <Tag size={20} />,
                    title: "Server Tags",
                },
                {
                    id: "sessions",
                    icon: <CheckShield size={20} />,
                    title: <Text id="app.settings.pages.sessions.title" />,
                },
                {
                    category: (
                        <Text id="app.settings.categories.client_settings" />
                    ),
                    id: "audio",
                    icon: <Speaker size={20} />,
                    title: <Text id="app.settings.pages.audio.title" />,
                },
                {
                    id: "appearance",
                    icon: <Palette size={20} />,
                    title: <Text id="app.settings.pages.appearance.title" />,
                },
                {
                    id: "plugins",
                    icon: <Plug size={20} />,
                    title: <Text id="app.settings.pages.plugins.title" />,
                },
                {
                    id: "notifications",
                    icon: <Bell size={20} />,
                    title: <Text id="app.settings.pages.notifications.title" />,
                },
                {
                    id: "language",
                    icon: <Globe size={20} />,
                    title: <Text id="app.settings.pages.language.title" />,
                },
                {
                    id: "sync",
                    icon: <SyncIcon size={20} />,
                    title: <Text id="app.settings.pages.sync.title" />,
                },
                {
                    id: "native",
                    hidden: !window.isNative,
                    icon: <Desktop size={20} />,
                    title: <Text id="app.settings.pages.native.title" />,
                },
                {
                    id: "experiments",
                    icon: <Flask size={20} />,
                    title: <Text id="app.settings.pages.experiments.title" />,
                },
                {
                    divider: true,
                    category: "revolt",
                    id: "bots",
                    icon: <Bot size={20} />,
                    title: <Text id="app.settings.pages.bots.title" />,
                },
            ]}
            children={
                <Switch>
                    <Route path="/settings/profile">
                        <Profile />
                    </Route>
                    <Route path="/settings/sessions">
                        <RequiresOnline>
                            <Sessions />
                        </RequiresOnline>
                    </Route>
                    <Route path="/settings/server-tags">
                        <ServerTags />
                    </Route>
                    <Route path="/settings/appearance">
                        <Appearance />
                    </Route>
                    <Route path="/settings/plugins">
                        <PluginsPage />
                    </Route>
                    <Route path="/settings/audio">
                        <Audio />
                    </Route>
                    <Route path="/settings/notifications">
                        <Notifications />
                    </Route>
                    <Route path="/settings/language">
                        <Languages />
                    </Route>
                    <Route path="/settings/sync">
                        <Sync />
                    </Route>
                    <Route path="/settings/native">
                        <Native />
                    </Route>
                    <Route path="/settings/experiments">
                        <ExperimentsPage />
                    </Route>
                    <Route path="/settings/bots">
                        <MyBots />
                    </Route>
                    <Route path="/settings/feedback">
                        <Feedback />
                    </Route>
                    <Route path="/">
                        <Account />
                    </Route>
                </Switch>
            }
            defaultPage="account"
            switchPage={switchPage}
            category="pages"
            custom={
                <>
                    <ButtonItem
                        onClick={clientController.logoutCurrent}
                        className={styles.logOut}
                        compact>
                        <LogOut size={20} />
                        <Text id="app.settings.pages.logOut" />
                    </ButtonItem>
                </>
            }
            indexHeader={
                <AccountHeader>
                    <div className="account">
                        <UserIcon
                            size={64}
                            target={client.user!}
                            status
                            onClick={() => openContextMenu("Status")}
                        />
                        <div className="details">
                            <span className="new">
                                {client.user.display_name ??
                                    client.user.username}
                            </span>
                            <span className="full">
                                {client.user.username}
                                {"#"}
                                {displayDiscriminator(client.user)}
                            </span>
                            <UserStatus user={client.user!} />
                        </div>
                    </div>
                    <div className="statusChanger">
                        <a
                            className="status"
                            onClick={() =>
                                modalController.push({
                                    type: "custom_status",
                                })
                            }>
                            Change your status...
                        </a>
                        {client.user!.status?.text && (
                            <Trash
                                size={24}
                                onClick={() =>
                                    client.users.edit({
                                        remove: ["StatusText"],
                                    })
                                }
                            />
                        )}
                    </div>
                </AccountHeader>
            }
        />
    );
});
