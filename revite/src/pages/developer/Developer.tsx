import { Wrench } from "@styled-icons/boxicons-solid";

import { useEffect, useState } from "preact/hooks";

import { Button } from "@revoltchat/ui";

import PaintCounter from "../../lib/PaintCounter";
import { TextReact } from "../../lib/i18n";

import { PageHeader } from "../../components/ui/Header";
import { useClient } from "../../controllers/client/ClientController";

const row: JSX.CSSProperties = {
    display: "flex",
    gap: 10,
    alignItems: "baseline",
    padding: "2px 0",
    fontSize: 13,
};

const key: JSX.CSSProperties = {
    minWidth: 190,
    color: "var(--secondary-foreground)",
};

const card: JSX.CSSProperties = {
    border: "1px solid var(--tertiary-background)",
    borderRadius: 8,
    padding: 16,
    margin: "0 16px 16px",
};

function value(v: unknown) {
    return typeof v === "string" ? v : JSON.stringify(v);
}

export default function Developer() {
    const client = useClient();
    const user = client.user!;
    const userPermission = user.permission;

    const [ping, setPing] = useState<undefined | number>(client.websocket.ping);
    const [connected, setConnected] = useState(client.websocket.connected);
    const [ready, setReady] = useState(client.websocket.ready);
    const [apiPing, setApiPing] = useState<number | null>(null);
    const [apiPingError, setApiPingError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [crash, setCrash] = useState(false);

    useEffect(() => {
        setPing(client.websocket.ping);
        const timer = setInterval(() => {
            setPing(client.websocket.ping);
            setConnected(client.websocket.connected);
            setReady(client.websocket.ready);
        }, 2000);

        return () => clearInterval(timer);
    }, []);

    const measureApi = async () => {
        setApiPingError(null);
        const started = performance.now();
        try {
            const res = await fetch(`${client.apiURL}/`, {
                headers: { Accept: "application/json" },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setApiPing(Math.round(performance.now() - started));
        } catch (err) {
            setApiPing(null);
            setApiPingError(String(err));
        }
    };

    const debugInfo = () => ({
        api_url: client.apiURL,
        websocket: {
            connected: client.websocket.connected,
            ready: client.websocket.ready,
            ping: client.websocket.ping ?? null,
        },
        api_ping_ms: apiPing,
        user: {
            id: user._id,
            username: `${user.username}#${user.discriminator}`,
            privileged: user.privileged,
            badges: user.badges,
        },
        counts: {
            servers: client.servers.size,
            channels: client.channels.size,
            users: client.users.size,
            members: client.members.size,
            unread: (client.unreads as any)?.channels?.size ?? 0,
        },
        features: (client as any).configuration?.features ?? null,
        user_agent: navigator.userAgent,
        location: location.href,
        timestamp: new Date().toISOString(),
    });

    const copyDebug = async () => {
        const text = JSON.stringify(debugInfo(), null, 2);
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            console.log("[dev] debug info", text);
            setCopied(false);
        }
    };

    const reconnect = () => {
        try {
            client.websocket.disconnect();
            client.websocket.connect();
        } catch (err) {
            console.error("[dev] reconnect failed", err);
        }
    };

    const clearCache = async () => {
        try {
            if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
            }
            if ("caches" in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
            }
        } catch (err) {
            console.error("[dev] cache clear failed", err);
        }
        location.reload();
    };

    return (
        <div>
            <PageHeader icon={<Wrench size="24" />}>Developer Tab</PageHeader>

            <div style={card}>
                <h3 style={{ margin: "0 0 10px" }}>Connection</h3>
                <div style={row}>
                    <span style={key}>API URL</span>
                    <code>{client.apiURL}</code>
                </div>
                <div style={row}>
                    <span style={key}>WebSocket</span>
                    <code>
                        {connected ? "connected" : "disconnected"}
                        {ready ? " / ready" : " / not ready"}
                    </code>
                </div>
                <div style={row}>
                    <span style={key}>Gateway ping</span>
                    <code>{ping ?? "?"} ms</code>
                </div>
                <div style={row}>
                    <span style={key}>API latency</span>
                    <code>
                        {apiPing !== null ? `${apiPing} ms` : "not measured"}
                        {apiPingError ? ` (${apiPingError})` : ""}
                    </code>
                </div>
                <div style={row}>
                    <span style={key}>User</span>
                    <code>
                        {user.username}#{user.discriminator} ({user._id})
                    </code>
                </div>
                <div style={row}>
                    <span style={key}>Privileged / badges</span>
                    <code>
                        {String(user.privileged)} / {user.badges ?? 0}
                    </code>
                </div>
                <div style={row}>
                    <span style={key}>Permission against self</span>
                    <code>{value(userPermission)}</code>
                </div>
            </div>

            <div style={card}>
                <h3 style={{ margin: "0 0 10px" }}>Client state</h3>
                <div style={row}>
                    <span style={key}>Servers</span>
                    <code>{client.servers.size}</code>
                </div>
                <div style={row}>
                    <span style={key}>Channels</span>
                    <code>{client.channels.size}</code>
                </div>
                <div style={row}>
                    <span style={key}>Users</span>
                    <code>{client.users.size}</code>
                </div>
                <div style={row}>
                    <span style={key}>Members</span>
                    <code>{client.members.size}</code>
                </div>
                <div style={row}>
                    <span style={key}>Unread entries</span>
                    <code>{(client.unreads as any)?.channels?.size ?? 0}</code>
                </div>
            </div>

            <div style={card}>
                <h3 style={{ margin: "0 0 10px" }}>Actions</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button palette="secondary" onClick={measureApi}>
                        Ping API
                    </Button>
                    <Button palette="secondary" onClick={reconnect}>
                        Reconnect gateway
                    </Button>
                    <Button palette="secondary" onClick={copyDebug}>
                        {copied ? "Copied!" : "Copy debug info"}
                    </Button>
                    <Button palette="secondary" onClick={clearCache}>
                        Clear cache &amp; reload
                    </Button>
                </div>
            </div>

            <div style={card}>
                <h3 style={{ margin: "0 0 10px" }}>Rendering</h3>
                <PaintCounter always />
            </div>

            <div style={card}>
                <h3 style={{ margin: "0 0 10px" }}>Danger zone</h3>
                <Button palette="error" onClick={() => setCrash(true)}>
                    Click to crash app
                </Button>
                {crash &&
                    (window as any).sus.sus() /* intentionally missing */}
            </div>

            <div style={{ padding: "0 16px 16px" }}>
                <TextReact
                    id="login.open_mail_provider"
                    fields={{ provider: <b>GAMING!</b> }}
                />
            </div>
        </div>
    );
}
