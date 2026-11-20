import { observer } from "mobx-react-lite";
import { useEffect, useState } from "preact/hooks";

import styles from "./Panes.module.scss";

import { Button } from "@revoltchat/ui";

import { CustomBadgeArt } from "../../../components/common/user/UserBadges";
import { useClient } from "../../../controllers/client/ClientController";
import {
    BadgeCatalog,
    CustomBadge,
    createCustomBadge,
    deleteCustomBadge,
    fetchBadgeCatalog,
    giveCustomBadge,
    imageToDataUri,
    invalidateCustomBadges,
    takeCustomBadge,
} from "../../../lib/customBadges";

const input = {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid var(--tertiary-background)",
    background: "var(--secondary-background)",
    color: "var(--foreground)",
    width: "100%",
    boxSizing: "border-box" as const,
};

export const CustomBadges = observer(() => {
    const client = useClient();
    const [catalog, setCatalog] = useState<BadgeCatalog>();
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [kind, setKind] = useState<"preset" | "emoji" | "image">("preset");
    const [preset, setPreset] = useState("bestie");
    const [emoji, setEmoji] = useState("");
    const [image, setImage] = useState("");
    const [colour, setColour] = useState("");
    const [target, setTarget] = useState("");

    const reload = () =>
        fetchBadgeCatalog()
            .then(setCatalog)
            .catch((e) => setError(e?.message ?? "Could not load badges"));
    useEffect(() => {
        reload();
    }, []);

    const run = async (fn: () => Promise<any>, ok: string) => {
        setError("");
        setNotice("");
        try {
            await fn();
            invalidateCustomBadges();
            setNotice(ok);
            await reload();
        } catch (e: any) {
            setError(e?.response?.data?.error ?? e?.message ?? "Failed");
        }
    };

    const resolveUser = (text: string): string | undefined => {
        const t = text.trim().replace(/^@/, "");
        if (!t) return undefined;
        if (/^[0-9A-Z]{26}$/.test(t)) return t;
        const lower = t.toLowerCase();
        return [...client.users.values()].find(
            (u) => u.username.toLowerCase() === lower,
        )?._id;
    };

    if (!catalog) return <div>{error || "Loading…"}</div>;
    if (!catalog.can_manage) return <div>Only the owner can manage badges.</div>;

    const value = kind === "preset" ? preset : kind === "emoji" ? emoji : image;
    const draft: CustomBadge = {
        id: "draft",
        name: name || "Preview",
        description,
        kind,
        value,
        colour: colour || null,
        created: 0,
    };

    return (
        <div className={styles.pane ?? ""} style={{ display: "grid", gap: 16 }}>
            <h2>Custom Badges</h2>
            {error && <div style={{ color: "var(--error)" }}>{error}</div>}
            {notice && <div style={{ color: "var(--success)" }}>{notice}</div>}

            <div style={{ display: "grid", gap: 8 }}>
                <h3>Create a badge</h3>
                <input
                    style={input}
                    placeholder="Name (1-32 characters)"
                    maxLength={32}
                    value={name}
                    onInput={(e) => setName(e.currentTarget.value)}
                />
                <input
                    style={input}
                    placeholder="Description (optional)"
                    maxLength={100}
                    value={description}
                    onInput={(e) => setDescription(e.currentTarget.value)}
                />
                <select
                    style={input}
                    value={kind}
                    onChange={(e) => setKind(e.currentTarget.value as any)}>
                    <option value="preset">Preset artwork</option>
                    <option value="emoji">Emoji</option>
                    <option value="image">Upload an image</option>
                </select>
                {kind === "preset" && (
                    <select
                        style={input}
                        value={preset}
                        onChange={(e) => setPreset(e.currentTarget.value)}>
                        {catalog.presets.map((p) => (
                            <option key={p} value={p}>
                                {p}
                            </option>
                        ))}
                    </select>
                )}
                {kind === "emoji" && (
                    <input
                        style={input}
                        placeholder="🔥"
                        maxLength={8}
                        value={emoji}
                        onInput={(e) => setEmoji(e.currentTarget.value)}
                    />
                )}
                {kind === "image" && (
                    <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={async (e) => {
                            const f = e.currentTarget.files?.[0];
                            if (!f) return;
                            try {
                                setImage(await imageToDataUri(f));
                            } catch (err: any) {
                                setError(err.message);
                            }
                        }}
                    />
                )}
                <label>
                    Ring colour (optional){" "}
                    <input
                        type="color"
                        value={colour || "#ffffff"}
                        onInput={(e) => setColour(e.currentTarget.value)}
                    />{" "}
                    {colour && (
                        <a onClick={() => setColour("")}>clear</a>
                    )}
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    Preview: {value ? <CustomBadgeArt badge={draft} /> : "—"}
                </div>
                <Button
                    disabled={!name.trim() || !value}
                    onClick={() =>
                        run(async () => {
                            await createCustomBadge({
                                name,
                                description,
                                kind,
                                value,
                                colour: colour || undefined,
                            });
                            setName("");
                            setDescription("");
                            setEmoji("");
                            setImage("");
                        }, "Badge created")
                    }>
                    Create badge
                </Button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
                <h3>Assign to a user</h3>
                <input
                    style={input}
                    placeholder="Username or user ID"
                    value={target}
                    onInput={(e) => setTarget(e.currentTarget.value)}
                />
                {catalog.badges.length === 0 && <div>No custom badges yet.</div>}
                {catalog.badges.map((b) => (
                    <div
                        key={b.id}
                        style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}>
                        <CustomBadgeArt badge={b} />
                        <strong>{b.name}</strong>
                        <span style={{ flex: 1, opacity: 0.7 }}>
                            {b.description}
                        </span>
                        <Button
                            onClick={() => {
                                const id = resolveUser(target);
                                if (!id)
                                    return setError(
                                        "Unknown user: use their ID or a username you share a server with",
                                    );
                                run(() => giveCustomBadge(b.id, id), "Badge given");
                            }}>
                            Give
                        </Button>
                        <Button
                            palette="secondary"
                            onClick={() => {
                                const id = resolveUser(target);
                                if (!id) return setError("Unknown user");
                                run(() => takeCustomBadge(b.id, id), "Badge removed");
                            }}>
                            Take
                        </Button>
                        <Button
                            palette="error"
                            onClick={() => {
                                if (confirm(`Delete "${b.name}" for everyone?`))
                                    run(() => deleteCustomBadge(b.id), "Badge deleted");
                            }}>
                            Delete
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
});
