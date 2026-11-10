import { useEffect, useState } from "preact/hooks";

import { Button, Preloader } from "@revoltchat/ui";

import { useClient } from "../../../controllers/client/ClientController";

import styles from "./Panes.module.scss";

interface Provider {
    provider: string;
    name: string;
    url: string;
    linked: { username: string } | null;
}

const BASE = "/connections-api";

export function Connections() {
    const client = useClient();
    const session = (client as unknown as { session?: { token?: string } | string })
        .session;
    const token = typeof session === "string" ? session : session?.token;
    const headers = { "x-session-token": token ?? "" };

    const [providers, setProviders] = useState<Provider[] | undefined>();
    const [error, setError] = useState<string | undefined>();

    const load = () =>
        fetch(`${BASE}/api/connections`, { headers })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load connections"))))
            .then((d) => setProviders(d.providers))
            .catch((e) => setError(e.message));

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function connect(p: Provider) {
        const r = await fetch(`${BASE}/api/connections/${p.provider}/start`, { method: "POST", headers });
        if (!r.ok) return setError("Could not start connection");
        window.location.href = (await r.json()).url;
    }

    async function disconnect(p: Provider) {
        await fetch(`${BASE}/api/connections/${p.provider}`, { method: "DELETE", headers });
        load();
    }

    if (error) return <div className={styles.loader}>{error}</div>;
    if (!providers)
        return (
            <div className={styles.loader}>
                <Preloader type="ring" />
            </div>
        );

    return (
        <div className={styles.sessions}>
            <h3>Connections</h3>
            <p>Link your NullCord account to other Canyon Lake Labs apps.</p>
            {providers.map((p) => (
                <div key={p.provider} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0" }}>
                    <div style={{ flex: 1 }}>
                        <b>{p.name}</b>
                        <div style={{ opacity: 0.7 }}>
                            {p.linked ? (
                                <a href={p.url} target="_blank" rel="noreferrer">
                                    @{p.linked.username}
                                </a>
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
        </div>
    );
}
