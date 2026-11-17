import { useEffect, useMemo, useState } from "preact/hooks";

export interface Connection {
    service: string;
    label: string;
    handle: string;
    url?: string;
    /** Extra text from the service, such as a chess player's ratings. */
    detail?: string;
}

/**
 * Where a connection can come from. Accounts added in Settings > Connections (and the linked
 * apps) are kept on the server; anything typed into a bio is read from the text itself.
 */
export const CONNECTIONS_API = "/connections-api";

/**
 * Built-in services. `template` turns a handle into a link; `{handle}` is replaced with the
 * handle, URL-encoded. The GUI offers these as presets, and bio lines name them the same way.
 */
export const SERVICES: Record<string, { label: string; template?: string }> = {
    github: { label: "GitHub", template: "https://github.com/{handle}" },
    twitch: { label: "Twitch", template: "https://twitch.tv/{handle}" },
    youtube: { label: "YouTube", template: "https://youtube.com/@{handle}" },
    twitter: { label: "Twitter / X", template: "https://x.com/{handle}" },
    x: { label: "Twitter / X", template: "https://x.com/{handle}" },
    reddit: { label: "Reddit", template: "https://reddit.com/u/{handle}" },
    instagram: {
        label: "Instagram",
        template: "https://instagram.com/{handle}",
    },
    tiktok: { label: "TikTok", template: "https://tiktok.com/@{handle}" },
    steam: { label: "Steam" },
    spotify: { label: "Spotify" },
    discord: { label: "Discord" },
    website: { label: "Website" },
};

/** Lowercase letters and digits only, so `Git Hub` and `github` are the same service. */
export const serviceKey = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Only plain web links are ever turned into clickable anchors. Bios are written by other
 * people, so `javascript:`, `data:` and links with an embedded login are refused.
 */
export function safeUrl(text?: string | null): string | undefined {
    if (!text) return undefined;
    try {
        const u = new URL(text.trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
        if (u.username || u.password) return undefined;
        return u.href;
    } catch {
        return undefined;
    }
}

export const fillTemplate = (template: string, handle: string) =>
    template.replace(/\{handle\}/g, encodeURIComponent(handle));

/**
 * The bio format: `|github|:|octocat|`, one per line. The pipes make an intentional line
 * unmistakable, so ordinary sentences such as "website: coming soon" are never picked up, and
 * any name works, not only the built-in services (`|my site|:|https://example.com|`).
 */
const LINE = /^\s*\|([^|\n]{1,32})\|\s*:\s*\|([^|\n]{1,64})\|\s*$/;

/** The line to type in a bio for a connection, in the format `parseConnections` reads. */
export const bioLine = (service: string, handle: string) =>
    `|${service}|:|${handle}|`;

/** Reads connections from profile bio lines such as `|github|:|octocat|`. */
export function parseConnections(content?: string | null): Connection[] {
    if (!content) return [];

    const found: Connection[] = [];
    for (const line of content.split("\n")) {
        const m = LINE.exec(line);
        if (!m) continue;

        const name = m[1].trim();
        const handle = m[2].trim().replace(/^@/, "");
        const service = serviceKey(name);
        if (!service || !handle) continue;

        const def = SERVICES[service];
        let url: string | undefined;
        if (def?.template) url = safeUrl(fillTemplate(def.template, handle));
        // A handle that is itself a web address (a website, or a custom service) links to it.
        else url = safeUrl(handle);

        found.push({ service, label: def?.label ?? name, handle, url });
    }

    return found;
}

interface RemoteProvider {
    provider: string;
    username: string;
    url?: string;
    detail?: string | null;
}

interface RemoteCustom {
    service: string;
    label: string;
    handle: string;
    url?: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
    gitclone: "GitClone",
    vortex: "Vortex",
    snap: "Snap",
    chess: "CLL Chess",
};

/** Turns the server's answer into plain connections, checking every link again. */
export function fromRemote(data: {
    connections?: RemoteProvider[];
    custom?: RemoteCustom[];
}): Connection[] {
    const out: Connection[] = [];
    for (const p of data.connections ?? []) {
        out.push({
            service: p.provider,
            label: PROVIDER_LABELS[p.provider] ?? p.provider,
            handle: p.username,
            url: safeUrl(p.url),
            detail: p.detail ? String(p.detail).slice(0, 80) : undefined,
        });
    }
    for (const c of data.custom ?? []) {
        out.push({
            service: c.service,
            label: c.label,
            handle: c.handle,
            url: safeUrl(c.url),
        });
    }
    return out;
}

/** Accounts added in Settings come first; bio lines add whatever is not already listed. */
export function mergeConnections(
    remote: Connection[],
    bio: Connection[],
): Connection[] {
    const seen = new Set<string>();
    const key = (c: Connection) => `${c.service}|${c.handle.toLowerCase()}`;
    const out: Connection[] = [];
    for (const c of [...remote, ...bio]) {
        if (seen.has(key(c))) continue;
        seen.add(key(c));
        out.push(c);
    }
    return out;
}

const cache = new Map<string, { at: number; list: Connection[] }>();
const TTL = 60_000;

/** Forget what was fetched, e.g. right after someone adds or removes a connection. */
export const clearConnectionsCache = () => cache.clear();

export async function fetchRemoteConnections(
    userId: string,
): Promise<Connection[]> {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < TTL) return hit.list;

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
        const r = await fetch(
            `${CONNECTIONS_API}/api/users/${encodeURIComponent(
                userId,
            )}/connections`,
            { signal: ctl.signal },
        );
        if (!r.ok) return [];
        const list = fromRemote(await r.json());
        cache.set(userId, { at: Date.now(), list });
        return list;
    } catch {
        // The connections service being down should never break a profile.
        return [];
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Everything to show on someone's profile: linked apps and accounts added in Settings, plus
 * any `|service|:|handle|` lines in their bio. The bio part is available immediately.
 */
export function useProfileConnections(
    userId: string | undefined,
    bio?: string | null,
): Connection[] {
    const [remote, setRemote] = useState<Connection[]>([]);

    useEffect(() => {
        let live = true;
        setRemote([]);
        if (userId)
            fetchRemoteConnections(userId).then((l) => live && setRemote(l));
        return () => {
            live = false;
        };
    }, [userId]);

    return useMemo(
        () => mergeConnections(remote, parseConnections(bio)),
        [remote, bio],
    );
}
