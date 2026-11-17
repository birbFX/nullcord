import { useEffect, useMemo, useState } from "preact/hooks";

import { Button, ComboBox, InputBox, Preloader } from "@revoltchat/ui";

import { useClient } from "../../../controllers/client/ClientController";
import {
    CONNECTIONS_API as BASE,
    SERVICES,
    bioLine,
    clearConnectionsCache,
    fillTemplate,
    safeUrl,
    serviceKey,
} from "../../../lib/connections";

import styles from "./Panes.module.scss";

interface Provider {
    provider: string;
    name: string;
    url: string;
    linked: { username: string; detail?: string | null } | null;
}

interface Custom {
    id: number;
    service: string;
    label: string;
    handle: string;
    url: string | null;
}

// `x` is the same service as `twitter`, so it is not offered twice.
const PRESETS = Object.keys(SERVICES).filter((k) => k !== "x");

const card = (accent: string) => ({
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "14px 16px",
    marginTop: "10px",
    borderRadius: "10px",
    background: "var(--secondary-background)",
    borderLeft: `4px solid ${accent}`,
});

export function Connections() {
    const client = useClient();
    const session = (client as unknown as { session?: { token?: string } | string })
        .session;
    const token = typeof session === "string" ? session : session?.token;
    const headers = { "x-session-token": token ?? "" };

    const [providers, setProviders] = useState<Provider[] | undefined>();
    const [custom, setCustom] = useState<Custom[]>([]);
    const [max, setMax] = useState(12);
    const [error, setError] = useState<string | undefined>();

    // The add-an-account form.
    const [preset, setPreset] = useState("github");
    const [label, setLabel] = useState(SERVICES.github.label);
    const [handle, setHandle] = useState("");
    const [link, setLink] = useState("");
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | undefined>();
    const [notice, setNotice] = useState<string | undefined>();

    const json = async (r: Response) => {
        const t = await r.text();
        try {
            return JSON.parse(t);
        } catch {
            throw new Error(
                "The connections service returned an unexpected response. Try again in a moment.",
            );
        }
    };

    const load = () =>
        fetch(`${BASE}/api/connections`, { headers })
            .then(async (r) => {
                const d = await json(r);
                if (!r.ok) throw new Error(d.error || "Failed to load connections");
                return d;
            })
            .then((d) => {
                setProviders(d.providers ?? []);
                setCustom(d.custom ?? []);
                if (d.limits?.custom) setMax(d.limits.custom);
            })
            .catch((e) => setError(e.message));

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function connect(p: Provider) {
        const r = await fetch(`${BASE}/api/connections/${p.provider}/start`, { method: "POST", headers });
        try {
            const d = await json(r);
            if (!r.ok) return setError(d.error || "Could not start connection");
            window.location.href = d.url;
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function disconnect(p: Provider) {
        await fetch(`${BASE}/api/connections/${p.provider}`, { method: "DELETE", headers });
        clearConnectionsCache();
        load();
    }

    const template = SERVICES[preset]?.template;
    const isCustom = preset === "custom";
    // A link box is only needed when the service has no ready-made address.
    const needsLink = isCustom || !template;

    function choosePreset(value: string) {
        setPreset(value);
        setLabel(value === "custom" ? "" : SERVICES[value].label);
        setLink("");
        setFormError(undefined);
        setNotice(undefined);
    }

    async function add() {
        setFormError(undefined);
        setNotice(undefined);
        const name = label.trim();
        const who = handle.trim().replace(/^@/, "");
        if (!name) return setFormError("Give the connection a name.");
        if (!who) return setFormError("Enter your username or handle for it.");
        if (needsLink && link.trim() && !safeUrl(fillTemplate(link.trim(), who)))
            return setFormError("The link must be a web address starting with http:// or https://.");

        // Presets with an address build the link; otherwise use the one typed, or the handle itself if it is a web address.
        const url = template ?? (link.trim() || safeUrl(who) || "");
        setSaving(true);
        try {
            const r = await fetch(`${BASE}/api/connections/custom`, {
                method: "POST",
                headers: { ...headers, "content-type": "application/json" },
                body: JSON.stringify({ label: name, handle: who, url }),
            });
            const d = await json(r);
            if (!r.ok) return setFormError(d.error || "Could not add that connection.");
            clearConnectionsCache();
            setHandle("");
            setLink("");
            setNotice("Added. It now shows on your profile.");
            await load();
        } catch (e) {
            setFormError((e as Error).message);
        } finally {
            setSaving(false);
        }
    }

    async function remove(c: Custom) {
        const r = await fetch(`${BASE}/api/connections/custom/${c.id}`, { method: "DELETE", headers });
        if (!r.ok) {
            const d = await json(r).catch(() => ({}));
            setError(d.error || "Could not remove that connection.");
            return;
        }
        clearConnectionsCache();
        setNotice(undefined);
        load();
    }

    // The exact line to type in a bio for whatever is in the form.
    const bioExample = useMemo(
        () =>
            bioLine(
                serviceKey(label) || (isCustom ? "mysite" : preset),
                handle.trim().replace(/^@/, "") || "username",
            ),
        [label, handle, preset, isCustom],
    );

    if (error)
        return (
            <div className={styles.loader} style={{ flexDirection: "column", gap: "12px" }}>
                <span>{error}</span>
                <Button
                    onClick={() => {
                        setError(undefined);
                        load();
                    }}>
                    Retry
                </Button>
            </div>
        );
    if (!providers)
        return (
            <div className={styles.loader}>
                <Preloader type="ring" />
            </div>
        );

    return (
        <div className={styles.sessions}>
            <h3>Connections</h3>
            <p>
                Show your other accounts on your profile. Link a Canyon Lake Labs app, or add any account
                yourself.
            </p>

            <h4 style={{ marginTop: "20px" }}>Canyon Lake apps</h4>
            {providers.map((p) => (
                <div
                    key={p.provider}
                    style={card(p.linked ? "var(--success, #3ba55d)" : "var(--tertiary-foreground)")}>
                    <div style={{ flex: 1 }}>
                        <b>{p.name}</b>
                        <div style={{ opacity: 0.7 }}>
                            {p.linked ? (
                                <>
                                    <a href={p.url} target="_blank" rel="noreferrer">
                                        @{p.linked.username}
                                    </a>
                                    {p.linked.detail && <span> · {p.linked.detail}</span>}
                                </>
                            ) : (
                                "Not connected"
                            )}
                        </div>
                    </div>
                    {p.linked ? (
                        <Button palette="secondary" onClick={() => disconnect(p)}>
                            Disconnect
                        </Button>
                    ) : (
                        <Button onClick={() => connect(p)}>Connect</Button>
                    )}
                </div>
            ))}

            <h4 style={{ marginTop: "28px" }}>
                Your accounts{" "}
                <span style={{ opacity: 0.6, fontWeight: "normal" }}>
                    {custom.length} of {max}
                </span>
            </h4>
            {custom.length === 0 && (
                <p style={{ opacity: 0.7 }}>
                    Nothing added yet. Pick a service below, or choose Custom to add anything else.
                </p>
            )}
            {custom.map((c) => (
                <div key={c.id} style={card("var(--accent, #fd6671)")}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <b>{c.label}</b>
                        <div style={{ opacity: 0.7, overflowWrap: "anywhere" }}>
                            {c.url ? (
                                <a href={c.url} target="_blank" rel="noreferrer noopener nofollow">
                                    {c.handle}
                                </a>
                            ) : (
                                c.handle
                            )}
                        </div>
                    </div>
                    <Button palette="secondary" onClick={() => remove(c)}>
                        Remove
                    </Button>
                </div>
            ))}

            <div
                style={{
                    marginTop: "14px",
                    padding: "16px",
                    borderRadius: "10px",
                    background: "var(--secondary-background)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                }}>
                <b>Add an account</b>
                <ComboBox value={preset} onChange={(e) => choosePreset(e.currentTarget.value)}>
                    {PRESETS.map((k) => (
                        <option key={k} value={k}>
                            {SERVICES[k].label}
                        </option>
                    ))}
                    <option value="custom">Custom…</option>
                </ComboBox>
                {isCustom && (
                    <InputBox
                        palette="secondary"
                        placeholder="Name, e.g. My Blog"
                        maxLength={32}
                        value={label}
                        disabled={saving}
                        onChange={(e) => setLabel(e.currentTarget.value)}
                    />
                )}
                <InputBox
                    palette="secondary"
                    placeholder={isCustom ? "Username, handle or address" : "Username"}
                    maxLength={64}
                    value={handle}
                    disabled={saving}
                    onChange={(e) => setHandle(e.currentTarget.value)}
                />
                {needsLink && (
                    <InputBox
                        palette="secondary"
                        placeholder="Link (optional), e.g. https://example.com/u/{handle}"
                        maxLength={200}
                        value={link}
                        disabled={saving}
                        onChange={(e) => setLink(e.currentTarget.value)}
                    />
                )}
                {formError && <span style={{ color: "var(--error, #ff5a5a)" }}>{formError}</span>}
                {notice && <span style={{ color: "var(--success, #3ba55d)" }}>{notice}</span>}
                <div>
                    <Button onClick={add} disabled={saving || custom.length >= max}>
                        {saving ? "Adding…" : "Add"}
                    </Button>
                </div>
            </div>

            <div style={{ marginTop: "20px", opacity: 0.85 }}>
                <b>Prefer your bio?</b> Put a line like this in it and it shows up as a connection too:
                <div
                    style={{
                        margin: "8px 0",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        background: "var(--secondary-background)",
                        fontFamily: "var(--monospace-font, monospace)",
                        overflowWrap: "anywhere",
                    }}>
                    {bioExample}
                </div>
                Write the service and the username each between pipes, with a colon between them. Any name
                works, for example <code>{"|my site|:|https://example.com|"}</code>. Accounts added here
                and in your bio are shown together.
            </div>
        </div>
    );
}
