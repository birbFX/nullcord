import { Tag } from "@styled-icons/boxicons-regular";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "preact/hooks";
import { Link } from "react-router-dom";

import styles from "./Panes.module.scss";

import { Button } from "@revoltchat/ui";

import { useClient } from "../../../controllers/client/ClientController";
import { CLL_SERVER_ID } from "../../../lib/constants";
import {
    EQUIPPED_TAG_EVENT,
    SERVER_EXTRAS_EVENT,
    equipServerTag,
    getEquippedServerTag,
    getServerTag,
    unequipServerTag,
    useServerExtras,
} from "../../../lib/serverExtras";

function ServerTagRow({
    server,
    userId,
    equipped,
    onChanged,
}: {
    server: any;
    userId?: string | null;
    equipped?: string;
    onChanged: () => void;
}) {
    const extras = useServerExtras(server._id);
    const tag = extras.tag || (server._id === CLL_SERVER_ID ? "CLL" : "");
    const isEquipped = equipped === server._id;

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                marginBottom: 8,
                borderRadius: 9,
                background: "var(--secondary-background)",
                opacity: tag ? 1 : 0.5,
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {server.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--secondary-foreground)" }}>
                    {tag ? (
                        <span>
                            <Tag size={12} /> ◆ {tag}
                        </span>
                    ) : (
                        "No server tag set"
                    )}
                </div>
            </div>
            {tag ? (
                isEquipped ? (
                    <Button
                        palette="secondary"
                        onClick={() => {
                            unequipServerTag(userId);
                            onChanged();
                        }}>
                        Unequip
                    </Button>
                ) : (
                    <Button
                        palette="primary"
                        onClick={() => {
                            equipServerTag(userId, server._id);
                            onChanged();
                        }}>
                        Equip
                    </Button>
                )
            ) : server.havePermission?.("ManageServer") ? (
                <Link to={`/server/${server._id}/settings/tags`}>
                    <Button palette="secondary">Set tag</Button>
                </Link>
            ) : (
                <Button palette="secondary" disabled>
                    Locked
                </Button>
            )}
        </div>
    );
}

export const ServerTags = observer(() => {
    const client = useClient();
    const userId = client.user?._id;
    const [equipped, setEquipped] = useState(
        () => getEquippedServerTag(userId)?.serverId,
    );

    const refresh = () => setEquipped(getEquippedServerTag(userId)?.serverId);

    useEffect(() => {
        window.addEventListener(EQUIPPED_TAG_EVENT, refresh);
        window.addEventListener(SERVER_EXTRAS_EVENT, refresh);
        refresh();
        return () => {
            window.removeEventListener(EQUIPPED_TAG_EVENT, refresh);
            window.removeEventListener(SERVER_EXTRAS_EVENT, refresh);
        };
    }, [userId]);

    const servers = [...client.servers.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
    );

    return (
        <div className={styles.plugins}>
            <h3>Server Tags</h3>
            <p style={{ color: "var(--secondary-foreground)", fontSize: 13 }}>
                Equip one server tag to show it as a diamond badge next to
                your name. Servers without a tag are greyed out — a server
                admin can set one in <b>Server Settings → Server Tags</b>.
            </p>

            <div style={{ marginTop: 16 }}>
                {servers.map((server) => (
                    <ServerTagRow
                        key={server._id}
                        server={server}
                        userId={userId}
                        equipped={equipped}
                        onChanged={refresh}
                    />
                ))}
                {servers.length === 0 && (
                    <div className={styles.empty}>
                        Join a server to use server tags.
                    </div>
                )}
            </div>

            <p style={{ fontSize: 11, color: "var(--secondary-foreground)" }}>
                Canyon Lake Labs has the default <b>CLL</b> tag. Tags are
                shown next to the names of members who equip them.
            </p>
        </div>
    );
});
