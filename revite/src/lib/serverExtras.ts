import { observable, runInAction } from "mobx";
import { Client } from "revolt.js";
import { useEffect, useState } from "preact/hooks";

import { CLL_SERVER_ID } from "./constants";
import { OWNER_ID, isNitroFull } from "./owner";
import { recordQuestEvent } from "./quests";

export const SERVER_EXTRAS_EVENT = "nullcord:server-extras";
export const EQUIPPED_TAG_EVENT = "nullcord:equipped-tag";

type Extras = {
    tag?: string;
    boosts?: Record<string, number>;
    vanity?: string;
};

type UserTag = {
    serverId?: string;
    tag?: string;
    nitro?: string | null;
    accent?: string;
    colors?: string[];
    angle?: number;
};

/**
 * Tags, boosts, vanity links and equipped tags live on the server. This is
 * only an in-memory cache of what the API returned, so every device and every
 * other user sees the same thing. Nothing here touches localStorage.
 */
const extrasCache = observable.map<string, Extras>({}, { deep: false });
const userTags = observable.map<string, UserTag>({}, { deep: false });
const fetchedAt = new Map<string, number>();
const capacities = new Map<string, number>();
const inflight = new Set<string>();
const STALE_MS = 60_000;

let apiClient: Client | undefined;

export function setExtrasClient(client?: Client) {
    apiClient = client;
    if (!client) {
        runInAction(() => {
            extrasCache.clear();
            userTags.clear();
        });
        fetchedAt.clear();
        capacities.clear();
    }
}

function notify() {
    window.dispatchEvent(new Event(SERVER_EXTRAS_EVENT));
    window.dispatchEvent(new Event(EQUIPPED_TAG_EVENT));
}

function stale(id: string) {
    return Date.now() - (fetchedAt.get(id) ?? 0) > STALE_MS;
}

function applyServer(serverId: string, data: any) {
    runInAction(() =>
        extrasCache.set(serverId, {
            tag: data.tag ?? undefined,
            vanity: data.vanity ?? undefined,
            boosts: data.boosts ?? {},
        }),
    );
    if (typeof data.capacity === "number")
        capacities.set(serverId, data.capacity);
    fetchedAt.set(`s:${serverId}`, Date.now());
    notify();
}

function applyUser(userId: string, data: any) {
    runInAction(() =>
        userTags.set(userId, {
            serverId: data.server ?? undefined,
            tag: data.tag ?? undefined,
            nitro: data.nitro ?? null,
            accent: data.accent ?? undefined,
            colors: data.colors ?? [],
            angle: data.angle ?? undefined,
        }),
    );
    fetchedAt.set(`u:${userId}`, Date.now());
    notify();
}

export async function refreshServerExtras(serverId: string) {
    const id = `s:${serverId}`;
    if (!apiClient || inflight.has(id)) return;
    inflight.add(id);
    try {
        applyServer(
            serverId,
            await apiClient.api.get(`/servers/${serverId}/extras` as any),
        );
    } catch (err) {
        fetchedAt.set(id, Date.now());
        console.error("Could not load server extras", err);
    } finally {
        inflight.delete(id);
    }
}

export async function refreshUserTag(userId: string) {
    const id = `u:${userId}`;
    if (!apiClient || inflight.has(id)) return;
    inflight.add(id);
    try {
        applyUser(
            userId,
            await apiClient.api.get(`/users/${userId}/nullcord` as any),
        );
    } catch {
        fetchedAt.set(id, Date.now());
    } finally {
        inflight.delete(id);
    }
}

function read(serverId?: string | null): Extras {
    if (!serverId) return {};
    if (stale(`s:${serverId}`)) refreshServerExtras(serverId);
    return extrasCache.get(serverId) ?? {};
}

/** Public Nitro tier of any user, fetched from the server. */
export function getUserNitro(userId?: string | null): string | null {
    if (!userId) return null;
    if (stale(`u:${userId}`)) refreshUserTag(userId);
    return userTags.get(userId)?.nitro ?? null;
}

let lastError = "";

function describeError(err: any): string {
    const type = err?.response?.data?.type ?? err?.data?.type ?? err?.type;
    if (type === "MissingPermission") return "You need the Manage Server permission in this server.";
    if (type === "NotFound" || type === "NotInServer") return "You must be a member of this server.";
    if (type === "InvalidOperation") return "That server has no tag yet, or you are not a member.";
    return typeof type === "string" ? type : "Something went wrong, please try again.";
}

/** Human-readable reason the last tag/boost request failed. */
export function getLastExtrasError() {
    return lastError;
}

async function send(
    promise: Promise<unknown> | undefined,
    serverId?: string,
    userId?: string,
) {
    try {
        const data = await promise;
        if (serverId) applyServer(serverId, data);
        else if (userId) applyUser(userId, data);
        return true;
    } catch (err) {
        console.error(err);
        lastError = describeError(err);
        if (serverId) refreshServerExtras(serverId);
        if (userId) refreshUserTag(userId);
        return false;
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
): Promise<boolean> {
    const clean = tag.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6);
    return send(
        apiClient?.api.patch(`/servers/${serverId}/extras` as any, undefined, { data: {
            tag: clean,
        } } as any),
        serverId,
    ).then((ok) => {
        if (ok && clean && userId) recordQuestEvent(userId, "server_tag_set");
        return ok;
    });
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

function isAdminUser(user?: { _id?: string | null; privileged?: boolean } | null) {
    return !!user && (!!user.privileged || user._id === OWNER_ID);
}

export function boostCapacity(
    user?: { _id?: string | null; privileged?: boolean } | null,
    serverId?: string | null,
): number {
    if (isAdminUser(user)) return 1000;
    if (serverId && capacities.has(serverId)) return capacities.get(serverId)!;
    return isNitroFull(user) ? 2 : 0;
}

export function addBoost(
    serverId: string,
    user?: { _id?: string | null; privileged?: boolean } | null,
): boolean {
    if (!user?._id || serverHasInfiniteBoosts(serverId)) return false;
    const own = getBoosts(serverId)[user._id] ?? 0;
    if (own >= boostCapacity(user, serverId)) return false;
    if (!isAdminUser(user) && boostCount(serverId) >= 14) return false;
    send(
        apiClient?.api.put(`/servers/${serverId}/extras/boost` as any, undefined, { data: {
            count: own + 1,
        } } as any),
        serverId,
    ).then((ok) => ok && recordQuestEvent(user._id!, "server_boosted"));
    return true;
}

export function removeBoost(serverId: string, userId?: string | null) {
    if (!userId) return;
    const own = getBoosts(serverId)[userId] ?? 0;
    if (!own) return;
    send(
        apiClient?.api.put(`/servers/${serverId}/extras/boost` as any, undefined, { data: {
            count: own - 1,
        } } as any),
        serverId,
    );
}

/* ------------------------------------------------------------------ tags */

export function getEquippedServerTag(
    userId?: string | null,
): { serverId: string; tag: string } | undefined {
    if (!userId) return;
    if (stale(`u:${userId}`)) refreshUserTag(userId);
    const t = userTags.get(userId);
    return t?.serverId && t.tag
        ? { serverId: t.serverId, tag: t.tag }
        : undefined;
}

export function equipServerTag(
    userId: string | null | undefined,
    serverId: string,
): Promise<boolean> {
    if (!userId || !getServerTag(serverId)) {
        lastError = "That server has no tag yet.";
        return Promise.resolve(false);
    }
    return send(
        apiClient?.api.put("/users/@me/nullcord/tag" as any, undefined, { data: {
            server: serverId,
        } } as any),
        undefined,
        userId,
    ).then((ok) => {
        if (ok) recordQuestEvent(userId, "server_tag_equipped");
        return ok;
    });
}

export function unequipServerTag(userId: string | null | undefined) {
    if (!userId) return;
    send(
        apiClient?.api.put("/users/@me/nullcord/tag" as any, undefined, { data: { server: null } } as any),
        undefined,
        userId,
    );
}

/* --------------------------------------------------------------- vanity */

export function getVanity(serverId?: string | null): string {
    return read(serverId).vanity ?? "";
}

export function canSetVanity(
    serverId?: string | null,
    user?: { _id?: string | null; privileged?: boolean } | null,
): boolean {
    return (
        isAdminUser(user) ||
        serverHasInfiniteBoosts(serverId) ||
        boostCount(serverId) >= 14
    );
}

export function setVanity(
    serverId: string,
    code: string,
    userId?: string | null,
): boolean {
    if (!canSetVanity(serverId, apiClient?.user)) return false;
    const clean = code
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 24);
    send(
        apiClient?.api.patch(`/servers/${serverId}/extras` as any, undefined, { data: {
            vanity: clean,
        } } as any),
        serverId,
    ).then(
        (ok) => ok && clean && userId && recordQuestEvent(userId, "vanity_set"),
    );
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

/* ------------------------------------------------------- card gradient */

export const MAX_GRADIENT_COLORS = 6;

/** Gradient stops and angle of a user's profile card, stored on the server. */
export function getProfileColors(userId?: string | null): {
    colors: string[];
    angle: number;
} {
    if (!userId) return { colors: [], angle: 135 };
    if (stale(`u:${userId}`)) refreshUserTag(userId);
    const t = userTags.get(userId);
    const colors = t?.colors?.length ? t.colors : t?.accent ? [t.accent] : [];
    return { colors, angle: t?.angle ?? 135 };
}

export function buildGradient(colors: string[], angle: number): string | undefined {
    if (!colors.length) return;
    if (colors.length === 1) return `linear-gradient(${angle}deg, ${colors[0]}, ${colors[0]})`;
    return `linear-gradient(${angle}deg, ${colors.join(", ")})`;
}

/** CSS background for a user's profile card, if they set one. */
export function getProfileGradient(userId?: string | null): string | undefined {
    const { colors, angle } = getProfileColors(userId);
    return buildGradient(colors, angle);
}

export function setProfileColors(
    userId: string | null | undefined,
    colors: string[],
    angle: number,
) {
    if (!userId) return Promise.resolve(false);
    return send(
        apiClient?.api.put("/users/@me/nullcord/accent" as any, undefined, { data: {
            colors,
            angle,
        } } as any),
        undefined,
        userId,
    );
}
