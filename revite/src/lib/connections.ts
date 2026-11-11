export interface Connection {
    service: string;
    label: string;
    handle: string;
    url?: string;
}

const SERVICES: Record<string, { label: string; url?: (h: string) => string }> =
    {
        github: { label: "GitHub", url: (h) => `https://github.com/${h}` },
        twitch: { label: "Twitch", url: (h) => `https://twitch.tv/${h}` },
        youtube: { label: "YouTube", url: (h) => `https://youtube.com/@${h}` },
        twitter: { label: "Twitter / X", url: (h) => `https://x.com/${h}` },
        x: { label: "Twitter / X", url: (h) => `https://x.com/${h}` },
        reddit: { label: "Reddit", url: (h) => `https://reddit.com/u/${h}` },
        instagram: {
            label: "Instagram",
            url: (h) => `https://instagram.com/${h}`,
        },
        tiktok: { label: "TikTok", url: (h) => `https://tiktok.com/@${h}` },
        steam: { label: "Steam" },
        spotify: { label: "Spotify" },
        discord: { label: "Discord" },
        website: { label: "Website" },
    };

const LINE = new RegExp(`^\\s*(${Object.keys(SERVICES).join("|")})\\s*[:=]\\s*(\\S.*?)\\s*$`, "i");

/** Reads linked accounts from profile bio lines such as `github: octocat`. */
export function parseConnections(content?: string | null): Connection[] {
    if (!content) return [];

    const found: Connection[] = [];
    for (const line of content.split("\n")) {
        const m = LINE.exec(line);
        if (!m) continue;

        const service = m[1].toLowerCase();
        const handle = m[2].replace(/^@/, "");
        const def = SERVICES[service];
        let url = def.url?.(encodeURIComponent(handle));
        if (service === "website") {
            url = /^https?:\/\//i.test(handle) ? handle : undefined;
        }

        found.push({ service, label: def.label, handle, url });
    }

    return found;
}
