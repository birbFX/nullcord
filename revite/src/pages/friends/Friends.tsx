import { Search } from "@styled-icons/boxicons-regular";
import { UserDetail, MessageAdd, UserPlus } from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import { User } from "revolt.js";

import styles from "./Friend.module.scss";
import classNames from "classnames";
import { Text } from "preact-i18n";
import { useState } from "preact/hooks";

import { IconButton } from "@revoltchat/ui";

import { isTouchscreenDevice } from "../../lib/isTouchscreenDevice";

import Tooltip from "../../components/common/Tooltip";
import { PageHeader } from "../../components/ui/Header";
import { useClient } from "../../controllers/client/ClientController";
import { modalController } from "../../controllers/modals/ModalController";
import { Friend } from "./Friend";

export default observer(() => {
    const client = useClient();
    const users = [...client.users.values()];
    users.sort((a, b) => a.username.localeCompare(b.username));

    const friends = users.filter((x) => x.relationship === "Friend");

    const lists = [
        ["", users.filter((x) => x.relationship === "Incoming")],
        [
            "app.special.friends.sent",
            users.filter((x) => x.relationship === "Outgoing"),
            "outgoing",
        ],
        [
            "app.status.online",
            friends.filter(
                (x) => x.online && x.status?.presence !== "Invisible",
            ),
            "online",
        ],
        [
            "app.status.offline",
            friends.filter(
                (x) => !x.online || x.status?.presence === "Invisible",
            ),
            "offline",
        ],
        [
            "app.special.friends.blocked",
            users.filter((x) => x.relationship === "Blocked"),
            "blocked",
        ],
    ] as [string, User[], string][];

    const incoming = lists[0][1];
    const outgoing = lists[1][1];
    const online = lists[2][1];
    const blocked = lists[4][1];

    const [tab, setTab] = useState<Tab>(
        incoming.length > 0 ? "pending" : "online",
    );
    const [query, setQuery] = useState("");

    const visible: [string, User[]][] =
        tab === "online"
            ? [["Online", online]]
            : tab === "all"
            ? [["All Friends", friends]]
            : tab === "pending"
            ? [
                  ["Incoming", incoming],
                  ["Sent", outgoing],
              ]
            : [["Blocked", blocked]];

    const needle = query.trim().toLowerCase();
    const filtered = visible
        .map(
            ([title, list]) =>
                [
                    title,
                    needle
                        ? list.filter((user) =>
                              `${user.display_name ?? ""} ${user.username}`
                                  .toLowerCase()
                                  .includes(needle),
                          )
                        : list,
                ] as [string, User[]],
        )
        .filter(([, list]) => list.length > 0);

    const total = filtered.reduce((n, [, list]) => n + list.length, 0);

    const tabs: { id: Tab; label: string; badge?: number }[] = [
        { id: "online", label: "Online" },
        { id: "all", label: "All" },
        { id: "pending", label: "Pending", badge: incoming.length },
        { id: "blocked", label: "Blocked" },
    ];

    return (
        <>
            <PageHeader
                icon={<UserDetail size={24} />}
                withTransparency
                noBurger>
                <div className={styles.title}>
                    <Text id="app.navigation.tabs.friends" />
                </div>
                <div className={styles.divider} />
                <nav className={styles.tabs} role="tablist">
                    {tabs.map((entry) => (
                        <button
                            key={entry.id}
                            role="tab"
                            aria-selected={tab === entry.id}
                            className={styles.tab}
                            data-active={tab === entry.id}
                            onClick={() => setTab(entry.id)}>
                            {entry.label}
                            {!!entry.badge && (
                                <span className={styles.badge}>
                                    {entry.badge}
                                </span>
                            )}
                        </button>
                    ))}
                    <button
                        className={classNames(styles.tab, styles.addFriend)}
                        onClick={() =>
                            modalController.push({
                                type: "add_friend",
                            })
                        }>
                        Add Friend
                    </button>
                </nav>
                <div className={styles.actions}>
                    <Tooltip content={"New Group DM"} placement="bottom">
                        <IconButton
                            onClick={() =>
                                modalController.push({
                                    type: "create_group",
                                })
                            }>
                            <MessageAdd size={24} />
                        </IconButton>
                    </Tooltip>
                </div>
            </PageHeader>
            <div data-scroll-offset="true" data-avoids-navigation="true">
                <div
                    className={classNames(styles.list, "with-padding")}
                    data-empty={total === 0 && !needle}
                    data-mobile={isTouchscreenDevice}>
                    {(total > 0 || needle) && (
                        <div className={styles.search}>
                            <input
                                type="text"
                                value={query}
                                placeholder="Search"
                                aria-label="Search friends"
                                onInput={(e) =>
                                    setQuery(e.currentTarget.value)
                                }
                            />
                            <Search size={20} />
                        </div>
                    )}

                    {total === 0 && !needle && (
                        <div className={styles.empty}>
                            <UserPlus size={64} />
                            <span>
                                {tab === "online"
                                    ? "None of your friends are online right now."
                                    : tab === "pending"
                                    ? "There are no pending friend requests."
                                    : tab === "blocked"
                                    ? "You haven't blocked anyone."
                                    : "You don't have any friends yet. Add someone to get started."}
                            </span>
                        </div>
                    )}

                    {filtered.map(([title, list]) => (
                        <section key={title}>
                            <h2 className={styles.section}>
                                {title} — {list.length}
                            </h2>
                            {list.map((x) => (
                                <Friend key={x._id} user={x} />
                            ))}
                        </section>
                    ))}
                </div>
            </div>
        </>
    );
});

type Tab = "online" | "all" | "pending" | "blocked";
