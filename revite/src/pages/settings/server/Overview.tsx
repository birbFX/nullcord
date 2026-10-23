import { Markdown } from "@styled-icons/boxicons-logos";
import isEqual from "lodash.isequal";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import { Server } from "revolt.js";

import styles from "./Panes.module.scss";
import { Text } from "preact-i18n";
import { useEffect, useState } from "preact/hooks";

import { Button, ComboBox, InputBox } from "@revoltchat/ui";

import { useClient } from "../../../controllers/client/ClientController";
import {
    addBoost,
    boostCapacity,
    boostLevel,
    getServerTag,
    hasInfiniteBoosts,
    removeBoost,
    setServerTag,
    useServerExtras,
} from "../../../lib/serverExtras";

import TextAreaAutoSize from "../../../lib/TextAreaAutoSize";
import { noop } from "../../../lib/js";

import { ChannelName } from "../../../controllers/client/jsx/ChannelName";
import { FileUploader } from "../../../controllers/client/jsx/legacy/FileUploads";

interface Props {
    server: Server;
}

export const Overview = observer(({ server }: Props) => {
    const client = useClient();
    const user = client.user;
    const extras = useServerExtras(server._id);
    const [tag, setTag] = useState(getServerTag(server._id));
    const [name, setName] = useState(server.name);
    const [description, setDescription] = useState(server.description ?? "");
    const [systemMessages, setSystemMessages] = useState(
        server.system_messages,
    );

    useEffect(() => setName(server.name), [server.name]);
    useEffect(
        () => setDescription(server.description ?? ""),
        [server.description],
    );
    useEffect(
        () => setSystemMessages(server.system_messages),
        [server.system_messages],
    );

    const boosts = Object.values(extras.boosts ?? {}).reduce((a, b) => a + b, 0);
    const infinite = hasInfiniteBoosts(user);
    const level = infinite ? 3 : boostLevel(boosts);
    const capacity = boostCapacity(user);
    const myBoosts = user?._id ? extras.boosts?.[user._id] ?? 0 : 0;

    const [changed, setChanged] = useState(false);
    function save() {
        const changes: Record<string, unknown> = {};
        if (name !== server.name) changes.name = name;
        if (description !== server.description)
            changes.description = description;
        if (!isEqual(systemMessages, server.system_messages))
            changes.system_messages = systemMessages ?? undefined;

        server.edit(changes);
        setChanged(false);
    }

    return (
        <div className={styles.overview}>
            <div className={styles.row}>
                <FileUploader
                    width={80}
                    height={80}
                    style="icon"
                    fileType="icons"
                    behaviour="upload"
                    maxFileSize={2_500_000}
                    onUpload={(icon) => server.edit({ icon }).then(noop)}
                    previewURL={server.generateIconURL({ max_side: 256 }, true)}
                    remove={() => server.edit({ remove: ["Icon"] }).then(noop)}
                />
                <div className={styles.name}>
                    <h3>
                        <Text id="app.main.servers.name" />
                    </h3>
                    <InputBox
                        value={name}
                        maxLength={32}
                        palette="secondary"
                        onChange={(e) => {
                            setName(e.currentTarget.value);
                            if (!changed) setChanged(true);
                        }}
                    />
                </div>
            </div>

            <h3>
                <Text id="app.main.servers.description" />
            </h3>
            <TextAreaAutoSize
                maxRows={10}
                minHeight={120}
                maxLength={1024}
                value={description}
                placeholder={"Add a topic..."}
                onChange={(ev) => {
                    setDescription(ev.currentTarget.value);
                    if (!changed) setChanged(true);
                }}
            />
            <div className={styles.markdown}>
                <Markdown size="24" />
                <h5>
                    {"Server descriptions support Markdown formatting."}
                </h5>
            </div>
            <hr />
            <h3>
                <Text id="app.main.servers.custom_banner" />
            </h3>
            <FileUploader
                height={160}
                style="banner"
                fileType="banners"
                behaviour="upload"
                maxFileSize={6_000_000}
                onUpload={(banner) => server.edit({ banner }).then(noop)}
                previewURL={server.generateBannerURL({ width: 1000 }, true)}
                remove={() => server.edit({ remove: ["Banner"] }).then(noop)}
            />
            <hr />
            <h3>
                <Text id="app.settings.server_pages.overview.system_messages" />
            </h3>
            {[
                ["User Joined", "user_joined"],
                ["User Left", "user_left"],
                ["User Kicked", "user_kicked"],
                ["User Banned", "user_banned"],
            ].map(([i18n, key]) => (
                // ! FIXME: temporary code just so we can expose the options
                <p
                    key={key}
                    style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                    }}>
                    <span style={{ flexShrink: 0, flex: `25%` }}>{i18n}</span>
                    <ComboBox
                        value={
                            systemMessages?.[
                                key as keyof typeof systemMessages
                            ] ?? "disabled"
                        }
                        onChange={(e) => {
                            if (!changed) setChanged(true);
                            const v = e.currentTarget.value;
                            if (v === "disabled") {
                                const {
                                    [key as keyof typeof systemMessages]: _,
                                    ...other
                                } = systemMessages;
                                setSystemMessages(other);
                            } else {
                                setSystemMessages({
                                    ...systemMessages,
                                    [key]: v,
                                });
                            }
                        }}>
                        <option value="disabled">
                            <Text id="general.disabled" />
                        </option>
                        {server.channels
                            .filter(
                                (x) =>
                                    typeof x !== "undefined" &&
                                    x.channel_type === "TextChannel",
                            )
                            .map((channel) => (
                                <option key={channel!._id} value={channel!._id}>
                                    <ChannelName channel={channel} prefix />
                                </option>
                            ))}
                    </ComboBox>
                </p>
            ))}

            <hr />
            <h3>Server tag</h3>
            <p style={{ marginTop: -6, color: "var(--secondary-foreground)" }}>
                Up to 4 characters. Shown next to the server name and member
                names (e.g. 333).
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <InputBox
                    value={tag}
                    maxLength={4}
                    palette="secondary"
                    placeholder="333"
                    onChange={(e) => setTag(e.currentTarget.value)}
                />
                <Button
                    palette="secondary"
                    onClick={() => setServerTag(server._id, tag)}>
                    Set tag
                </Button>
            </div>

            <hr />
            <h3>Boosts</h3>
            <p style={{ marginTop: -6 }}>
                <b>{infinite ? "∞" : boosts}</b> boost
                {!infinite && boosts === 1 ? "" : "s"} · Level <b>{level}</b>
            </p>
            <p style={{ marginTop: -6, color: "var(--secondary-foreground)" }}>
                Level 1 at 2 boosts · Level 2 at 7 · Level 3 at 14. Nitro
                includes 2 boosts; owner/admin boosts are unlimited.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {infinite ? (
                    <Button palette="secondary" disabled>
                        Infinite boosts active
                    </Button>
                ) : capacity > 0 ? (
                    <Button
                        palette="primary"
                        onClick={() => addBoost(server._id, user)}>
                        Boost server
                    </Button>
                ) : (
                    <Link to="/nitro">
                        <Button palette="secondary">
                            Nitro required — get Nitro
                        </Button>
                    </Link>
                )}
                {myBoosts > 0 && (
                    <Button
                        palette="secondary"
                        onClick={() => removeBoost(server._id, user?._id)}>
                        Remove my boost
                    </Button>
                )}
                <span style={{ fontSize: 12, color: "var(--secondary-foreground)" }}>
                    Your boosts: {infinite ? "∞" : myBoosts}/
                    {capacity === Infinity ? "∞" : capacity}
                </span>
            </div>

            <p>
                <Button onClick={save} palette="secondary" disabled={!changed}>
                    <Text id="app.special.modals.actions.save" />
                </Button>
            </p>
        </div>
    );
});
