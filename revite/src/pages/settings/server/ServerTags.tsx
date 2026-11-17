import { observer } from "mobx-react-lite";
import { Server } from "revolt.js";

import styles from "./Panes.module.scss";

import { useEffect, useState } from "preact/hooks";

import { Button, InputBox } from "@revoltchat/ui";

import { useClient } from "../../../controllers/client/ClientController";
import {
    getLastExtrasError,
    getServerTag,
    setServerTag,
    useServerExtras,
} from "../../../lib/serverExtras";

interface Props {
    server: Server;
}

export const ServerTags = observer(({ server }: Props) => {
    const client = useClient();
    const extras = useServerExtras(server._id);
    const [tag, setTag] = useState(getServerTag(server._id));

    const [msg, setMsg] = useState("");

    useEffect(() => {
        if (extras.tag !== undefined) setTag(extras.tag);
    }, [extras.tag]);

    const save = async (value: string) => {
        setMsg("Saving…");
        const ok = await setServerTag(server._id, value, client.user?._id);
        setMsg(ok ? "Saved." : getLastExtrasError());
    };

    const clean = tag.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4);

    return (
        <div className={styles.overview}>
            <h3>Server Tags</h3>
            <p style={{ marginTop: -6, color: "var(--secondary-foreground)" }}>
                Tags are 1–4 letters or numbers shown as a diamond badge next
                to the server name and next to member names in this server.
            </p>

            <div
                style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginTop: 12,
                }}>
                <InputBox
                    value={tag}
                    maxLength={4}
                    palette="secondary"
                    placeholder="333"
                    onChange={(e) => setTag(e.currentTarget.value)}
                />
                <Button
                    palette="primary"
                    onClick={() => save(tag)}>
                    Save tag
                </Button>
                <Button
                    palette="secondary"
                    onClick={() => {
                        setTag("");
                        save("");
                    }}>
                    Remove tag
                </Button>
            </div>

            {msg && (
                <p style={{ marginTop: 8, color: "var(--secondary-foreground)" }}>
                    {msg}
                </p>
            )}

            <h3 style={{ marginTop: 24 }}>Preview</h3>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: 16,
                    borderRadius: 8,
                    background: "var(--secondary-background)",
                }}>
                <b>{server.name}</b>
                {extras.tag ? (
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 7px",
                            borderRadius: 5,
                            fontSize: 11,
                            fontWeight: 800,
                            background: "var(--primary-background)",
                        }}>
                        <span style={{ color: "#8b95ff" }}>◆</span>
                        {extras.tag}
                    </span>
                ) : (
                    <span style={{ fontSize: 12, opacity: 0.6 }}>
                        No tag set
                    </span>
                )}
            </div>

            <p style={{ fontSize: 12, opacity: 0.65 }}>
                Allowed characters: A–Z, 0–9. Saved to your server.
                {clean !== tag ? " Invalid characters will be removed." : ""}
            </p>
        </div>
    );
});
