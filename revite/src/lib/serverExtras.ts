import { useEffect, useState } from "preact/hooks";

import { isNitro, isOwner } from "./owner";

export const SERVER_EXTRAS_EVENT = "nullcord:server-extras";

type Extras = {
    tag?: string;
    boosts?: Record<string, number>;
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
    return read(serverId).tag ?? "";
}

export function setServerTag(serverId: string, tag: string) {
    const data = read(serverId);
    const clean = tag.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4);
    if (clean) data.tag = clean;
    else delete data.tag;
    write(serverId, data);
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

export function hasInfiniteBoosts(
    user?: { _id?: string | null; privileged?: boolean } | null,
): boolean {
    return !!user && (!!user.privileged || isOwner(user._id));
}

export function boostCapacity(
    user?: { _id?: string | null; privileged?: boolean } | null,
): number {
    if (hasInfiniteBoosts(user)) return Infinity;
    if (isNitro(user)) return 2;
    return 0;
}

export function addBoost(
    serverId: string,
    user?: { _id?: string | null; privileged?: boolean } | null,
): boolean {
    if (!user?._id) return false;
    if (hasInfiniteBoosts(user)) return true;

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
