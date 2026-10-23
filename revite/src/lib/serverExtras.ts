import { useEffect, useState } from "preact/hooks";

import { CLL_SERVER_ID } from "./constants";
import { isNitro } from "./owner";
import { recordQuestEvent } from "./quests";

export const SERVER_EXTRAS_EVENT = "nullcord:server-extras";
export const EQUIPPED_TAG_EVENT = "nullcord:equipped-tag";

type Extras = {
    tag?: string;
    boosts?: Record<string, number>;
    vanity?: string;
};

function key(serverId: string) {
    return `nullcord:server:${serverId}`;
}

function read(serverId?: string | null): Extras {
    if (!serverId || typeof localStorage === "undefined") return {};
    try {
        return JSON.parse(localStorage.getItem(key(serverId)) ?? "{}");
    } catch {
        return {};
    }
}

function write(serverId: string, data: Extras) {
    try {
        localStorage.setItem(key(serverId), JSON.stringify(data));
        window.dispatchEvent(new Event(SERVER_EXTRAS_EVENT));
    } catch {
        // ignore storage failures
    }
}

export function getServerTag(serverId?: string | null): string {
    const tag = read(serverId).tag ?? "";
    if (!tag && serverId === CLL_SERVER_ID) return "CLL";
    return tag;
}

export function setServerTag(
    serverId: string,
    tag: string,
    userId?: string | null,
) {
    const data = read(serverId);
    const clean = tag.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4);
    if (clean) data.tag = clean;
    else delete data.tag;
    write(serverId, data);
    if (clean && userId) recordQuestEvent(userId, "server_tag_set");
}

export function getBoosts(serverId?: string | null): Record<string, number> {
    return read(serverId).boosts ?? {};
}

export function boostCount(serverId?: string | null): number {
    return Object.values(getBoosts(serverId)).reduce((a, b) => a + b, 0);
}

export function boostLevel(count: number): 0 | 1 | 2 | 3 {
    if (count >= 14) return 3;
    if (count >= 7) return 2;
    if (count >= 2) return 1;
    return 0;
}

/** Servers that always count as fully boosted. */
export function serverHasInfiniteBoosts(serverId?: string | null): boolean {
    return serverId === CLL_SERVER_ID;
}

/** Kept as a server-aware helper for existing UI call sites. */
export function hasInfiniteBoosts(
    _user?: { _id?: string | null; privileged?: boolean } | null,
    serverId?: string | null,
): boolean {
    return serverHasInfiniteBoosts(serverId);
}

export function boostCapacity(
    user?: { _id?: string | null; privileged?: boolean } | null,
): number {
    if (isNitro(user)) return 2;
    return 0;
}

export function addBoost(
    serverId: string,
    user?: { _id?: string | null; privileged?: boolean } | null,
): boolean {
    if (!user?._id) return false;
    if (serverHasInfiniteBoosts(serverId)) return false;

    const data = read(serverId);
    data.boosts ??= {};
    const own = data.boosts[user._id] ?? 0;
    const total = Object.values(data.boosts).reduce((a, b) => a + b, 0);
    const remaining = boostCapacity(user) - own;
    if (remaining <= 0) return false;

    // Cap at Nitro level 3 even if multiple people boost.
    if (total >= 14) return false;

    data.boosts[user._id] = own + 1;
    write(serverId, data);
    recordQuestEvent(user._id, "server_boosted");
    return true;
}

export function removeBoost(serverId: string, userId?: string | null) {
    if (!userId) return;
    const data = read(serverId);
    if (!data.boosts?.[userId]) return;
    data.boosts[userId] -= 1;
    if (data.boosts[userId] <= 0) delete data.boosts[userId];
    write(serverId, data);
}

/* ------------------------------------------------------------------ tags */

function equippedKey(userId: string) {
    return `nullcord:equipped-tag:${userId}`;
}

export function getEquippedServerTag(
    userId?: string | null,
): { serverId: string; tag: string } | undefined {
    if (!userId || typeof localStorage === "undefined") return;
    try {
        const serverId = localStorage.getItem(equippedKey(userId));
        if (!serverId) return;
        const tag = getServerTag(serverId);
        return tag ? { serverId, tag } : undefined;
    } catch {
        return;
    }
}

export function equipServerTag(
    userId: string | null | undefined,
    serverId: string,
): boolean {
    if (!userId || !getServerTag(serverId)) return false;
    try {
        localStorage.setItem(equippedKey(userId), serverId);
        window.dispatchEvent(new Event(EQUIPPED_TAG_EVENT));
        recordQuestEvent(userId, "server_tag_equipped");
        return true;
    } catch {
        return false;
    }
}

export function unequipServerTag(userId: string | null | undefined) {
    if (!userId) return;
    try {
        localStorage.removeItem(equippedKey(userId));
        window.dispatchEvent(new Event(EQUIPPED_TAG_EVENT));
    } catch {
        // ignore
    }
}

/* --------------------------------------------------------------- vanity */

export function getVanity(serverId?: string | null): string {
    return read(serverId).vanity ?? "";
}

export function canSetVanity(serverId?: string | null): boolean {
    return (
        serverHasInfiniteBoosts(serverId) || boostCount(serverId) >= 14
    );
}

export function setVanity(
    serverId: string,
    code: string,
    userId?: string | null,
): boolean {
    if (!canSetVanity(serverId)) return false;
    const clean = code
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 24);
    const data = read(serverId);
    if (clean) data.vanity = clean;
    else delete data.vanity;
    write(serverId, data);
    if (clean && userId) recordQuestEvent(userId, "vanity_set");
    return true;
}

/** Reactive view of a server's tag/boosts. */
export function useServerExtras(serverId?: string | null) {
    const [extras, setExtras] = useState<Extras>(() => read(serverId));

    useEffect(() => {
        const refresh = () => setExtras(read(serverId));
        refresh();
        window.addEventListener(SERVER_EXTRAS_EVENT, refresh);
        return () => window.removeEventListener(SERVER_EXTRAS_EVENT, refresh);
    }, [serverId]);

    return extras;
}
