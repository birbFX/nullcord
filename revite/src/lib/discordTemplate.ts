import { Client } from "revolt.js";

/** Pull a template code out of discord.new/CODE, discord.com/template/CODE or a bare code. */
export function parseTemplateCode(input: string) {
    const value = input.trim();
    const match = value.match(
        /(?:discord\.new|discord(?:app)?\.com\/template)\/([A-Za-z0-9_-]+)/,
    );
    if (match) return match[1];
    return /^[A-Za-z0-9_-]+$/.test(value) ? value : "";
}

const bit = (n: number) => BigInt(1) << BigInt(n);

/** Discord permission bit -> NullCord permission bit. */
const PERMISSION_MAP: [bigint, bigint][] = [
    [bit(4), bit(0)], // manage channels
    [bit(5), bit(1)], // manage guild
    [bit(28), (bit(3)) | (bit(2))], // manage roles
    [bit(30), bit(4)], // manage emojis
    [bit(1), bit(6)], // kick
    [bit(2), bit(7)], // ban
    [bit(40), bit(8)], // timeout
    [bit(26), bit(10)], // change nickname
    [bit(27), bit(11)], // manage nicknames
    [bit(10), bit(20)], // view channel
    [bit(16), bit(21)], // read history
    [bit(11), bit(22)], // send messages
    [bit(13), bit(23)], // manage messages
    [bit(29), bit(24)], // manage webhooks
    [bit(0), bit(25)], // invite
    [bit(14), bit(26)], // embeds
    [bit(15), bit(27)], // upload files
    [bit(6), bit(29)], // reactions
];

function mapPermissions(raw: string | number): number {
    let discord: bigint;
    try {
        discord = BigInt(raw);
    } catch {
        return 0;
    }
    let out = BigInt(0);
    if (discord & (bit(3))) {
        for (const [, to] of PERMISSION_MAP) out |= to;
    } else {
        for (const [from, to] of PERMISSION_MAP) if (discord & from) out |= to;
    }
    return Number(out);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run an API call, waiting out rate limits (429) instead of failing. */
async function paced<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            const res = err?.response;
            if (res?.status !== 429 || attempt >= 8) throw err;
            const header = Number(res.headers?.["x-ratelimit-reset-after"]);
            const body = Number(res.data?.retry_after);
            const wait = header || body || 2000;
            // headers are in ms for this API, but guard against seconds
            await sleep(Math.min(Math.max(wait < 50 ? wait * 1000 : wait, 500), 15000) + 100);
        }
    }
}

const clamp = (s: string, n: number) => (s ?? "").slice(0, n) || "channel";

export async function fetchTemplate(client: Client, code: string) {
    return (await client.api.get(
        `/users/@me/nullcord/template/${code}` as any,
    )) as any;
}

/** Create a NullCord server from a Discord template and return its id. */
export async function importTemplate(
    client: Client,
    template: any,
    onProgress?: (text: string) => void,
): Promise<string> {
    const src = template.serialized_source_guild;
    if (!src) throw "InvalidTemplate";

    onProgress?.("Creating server…");
    const server = await paced(() =>
        client.servers.createServer({
            name: clamp(src.name || template.name, 32),
        }),
    );
    const defaults = [...((server as any).channel_ids ?? [])] as string[];

    // Roles (highest position first, so ranking matches Discord).
    const roles: any[] = (src.roles ?? [])
        .slice()
        .sort((a: any, b: any) => b.position - a.position);
    for (const role of roles) {
        const perms = mapPermissions(role.permissions);
        if (role.id === src.id || role.name === "@everyone" || role.id === 0) {
            if (perms) {
                await paced(() => server.setPermissions("default", perms)).catch(
                    () => undefined,
                );
            }
            continue;
        }
        onProgress?.(`Role: ${role.name}`);
        try {
            const created: any = await paced(() =>
                server.createRole(clamp(role.name, 32)),
            );
            const colour = role.color
                ? `#${role.color.toString(16).padStart(6, "0")}`
                : undefined;
            await paced(() =>
                server.editRole(created.id, {
                    colour,
                    hoist: !!role.hoist,
                } as any),
            );
            if (perms)
                await paced(() =>
                    server.setPermissions(created.id, {
                        allow: perms,
                        deny: 0,
                    } as any),
                );
        } catch (err) {
            console.error("Template role failed", role.name, err);
        }
    }

    // Channels, ordered by position; categories become NullCord categories.
    const all: any[] = (src.channels ?? [])
        .slice()
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
    const cats = all.filter((c) => c.type === 4);
    const made = new Map<string, string>();
    for (const ch of all) {
        if (ch.type === 4) continue;
        const voice = ch.type === 2 || ch.type === 13;
        onProgress?.(`Channel: ${ch.name}`);
        try {
            const created: any = await paced(() =>
                server.createChannel({
                    type: voice ? "Voice" : "Text",
                    name: clamp(ch.name, 32),
                    description: ch.topic
                        ? String(ch.topic).slice(0, 1024)
                        : undefined,
                    nsfw: ch.nsfw ? true : undefined,
                } as any),
            );
            made.set(String(ch.id), created._id);
        } catch (err) {
            console.error("Template channel failed", ch.name, err);
        }
    }

    const categories = cats
        .map((cat) => ({
            id: String(cat.id),
            title: clamp(cat.name, 32),
            channels: all
                .filter((c) => c.type !== 4 && String(c.parent_id) === String(cat.id))
                .map((c) => made.get(String(c.id)))
                .filter(Boolean) as string[],
        }))
        .filter((c) => c.channels.length);
    const loose = all
        .filter((c) => c.type !== 4 && !c.parent_id)
        .map((c) => made.get(String(c.id)))
        .filter(Boolean) as string[];
    if (loose.length)
        categories.unshift({ id: "uncategorized", title: "Channels", channels: loose });
    if (categories.length)
        await paced(() => server.edit({ categories } as any)).catch(
            () => undefined,
        );

    // Remove the auto-created default channel(s) once real ones exist.
    if (made.size) {
        for (const id of defaults)
            await paced(() => client.api.delete(`/channels/${id}` as any)).catch(
                () => undefined,
            );
    }

    return server._id;
}
