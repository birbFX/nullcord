import { XCircle } from "@styled-icons/boxicons-regular";
import { observer } from "mobx-react-lite";
import { Virtuoso } from "react-virtuoso";
import { API, Server } from "revolt.js";

import styles from "./Panes.module.scss";
import { Text } from "preact-i18n";
import { useEffect, useState } from "preact/hooks";

import { Button, IconButton, InputBox, Preloader } from "@revoltchat/ui";

import UserIcon from "../../../components/common/user/UserIcon";
import { Username } from "../../../components/common/user/UserShort";
import { ChannelName } from "../../../controllers/client/jsx/ChannelName";
import { recordInviteCreated } from "../../../lib/quests";
import {
    boostCount,
    canSetVanity,
    getVanity,
    serverHasInfiniteBoosts,
    setVanity,
    useServerExtras,
} from "../../../lib/serverExtras";

interface InnerProps {
    invite: API.Invite;
    server: Server;
    removeSelf: () => void;
}

const Inner = observer(({ invite, server, removeSelf }: InnerProps) => {
    const [deleting, setDelete] = useState(false);

    const user = server.client.users.get(invite.creator);
    const channel = server.client.channels.get(invite.channel);

    return (
        <div className={styles.invite} data-deleting={deleting}>
            <code>{invite._id}</code>
            <span>
                <UserIcon target={user} size={24} />{" "}
                <Username user={user} showServerIdentity="both" />
            </span>
            <span>
                <ChannelName channel={channel} prefix />
            </span>
            <IconButton
                onClick={() => {
                    setDelete(true);
                    server.client.deleteInvite(invite._id).then(removeSelf);
                }}>
                <XCircle size={24} />
            </IconButton>
        </div>
    );
});

interface Props {
    server: Server;
}

export const Invites = ({ server }: Props) => {
    const [invites, setInvites] = useState<API.Invite[] | undefined>(undefined);
    const extras = useServerExtras(server._id);
    const [vanity, setVanityCode] = useState(() => getVanity(server._id));
    const [vanityNote, setVanityNote] = useState("");

    const unlimited = serverHasInfiniteBoosts(server._id);
    const boosts = boostCount(server._id);
    const allowed = canSetVanity(server._id);

    useEffect(() => {
        server.fetchInvites().then((v) => setInvites(v));
    }, [server, setInvites]);

    useEffect(() => {
        setVanityCode(extras.vanity ?? "");
    }, [extras.vanity]);

    const saveVanity = async () => {
        if (!allowed) {
            setVanityNote("Boost this server to Level 3 first.");
            return;
        }

        const clean = vanity
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "")
            .slice(0, 24);

        if (!clean) {
            setVanity(server._id, "", server.client.user?._id);
            setVanityNote("Custom invite link removed.");
            return;
        }

        const channel = server.channel_ids
            .map((id) => server.client.channels.get(id))
            .find((c) => c?.channel_type === "TextChannel");

        if (!channel) {
            setVanityNote("Create a text channel before making an invite.");
            return;
        }

        try {
            await server.client.api.post(`/channels/${channel._id}/invites`, {
                code: clean,
            });
            setVanity(server._id, clean, server.client.user?._id);
            recordInviteCreated(
                server.client.user?._id,
                server._id,
                clean,
            );
            setVanityNote("Custom invite link created and live.");
        } catch (err) {
            const message =
                (err as any)?.response?.data?.message ??
                (err as any)?.message ??
                "Could not create that invite code.";
            setVanityNote(String(message));
        }
    };

    const copyVanity = () => {
        if (!extras.vanity) return;
        navigator.clipboard
            ?.writeText(`${window.location.origin}/invite/${extras.vanity}`)
            .then(() => setVanityNote("Link copied."))
            .catch(() => setVanityNote("Could not access the clipboard."));
    };

    return (
        <div className={styles.userList}>
            <div style={{ padding: "4px 0 18px" }}>
                <h3 style={{ marginBottom: 4 }}>Custom invite link</h3>
                <p
                    style={{
                        marginTop: 0,
                        fontSize: 12,
                        color: "var(--secondary-foreground)",
                    }}>
                    {unlimited
                        ? "Canyon Lake Labs has permanent Level 3 boosts."
                        : allowed
                          ? "Level 3 unlocked — set a vanity invite code."
                          : `Level 3 requires 14 boosts. This server has ${boosts}/14.`}
                </p>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                    }}>
                    <InputBox
                        value={vanity}
                        disabled={!allowed}
                        placeholder="your-server"
                        maxLength={24}
                        palette="secondary"
                        onChange={(e) =>
                            setVanityCode(e.currentTarget.value)
                        }
                    />
                    <Button
                        palette="primary"
                        disabled={!allowed}
                        onClick={saveVanity}>
                        Save link
                    </Button>
                    {extras.vanity && (
                        <Button palette="secondary" onClick={copyVanity}>
                            Copy link
                        </Button>
                    )}
                </div>
                {extras.vanity && (
                    <code
                        style={{
                            display: "block",
                            marginTop: 8,
                            fontSize: 12,
                            color: "#8b95ff",
                        }}>
                        {window.location.origin}/invite/{extras.vanity}
                    </code>
                )}
                {vanityNote && (
                    <p
                        style={{
                            margin: "6px 0 0",
                            fontSize: 11,
                            color: "var(--secondary-foreground)",
                        }}>
                        {vanityNote}
                    </p>
                )}
            </div>

            <div className={styles.subtitle}>
                <span>
                    <Text id="app.settings.server_pages.invites.code" />
                </span>
                <span>
                    <Text id="app.settings.server_pages.invites.invitor" />
                </span>
                <span>
                    <Text id="app.settings.server_pages.invites.channel" />
                </span>
                <span>
                    <Text id="app.settings.server_pages.invites.revoke" />
                </span>
            </div>
            {typeof invites === "undefined" && <Preloader type="ring" />}
            {invites && (
                <div className={styles.virtual}>
                    <Virtuoso
                        totalCount={invites.length}
                        itemContent={(index) => (
                            <Inner
                                key={invites[index]._id}
                                invite={invites[index]}
                                server={server}
                                removeSelf={() =>
                                    setInvites(
                                        invites.filter(
                                            (x) => x._id !== invites[index]._id,
                                        ),
                                    )
                                }
                            />
                        )}
                    />
                </div>
            )}
        </div>
    );
};
