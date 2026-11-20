import { observable, runInAction } from "mobx";
import { Client } from "revolt.js";

export type CustomBadge = {
    id: string;
    name: string;
    description: string;
    kind: "preset" | "emoji" | "image";
    value: string;
    colour?: string | null;
    created: number;
};

export type BadgeCatalog = {
    badges: CustomBadge[];
    presets: string[];
    can_manage: boolean;
};

/**
 * Custom badges live on the server (owner-managed catalog plus per-user
 * assignments). This is an in-memory cache only.
 */
const userBadges = observable.map<string, CustomBadge[]>({}, { deep: false });
const fetchedAt = new Map<string, number>();
const inflight = new Set<string>();
const STALE_MS = 60_000;
let apiClient: Client | undefined;

export function setBadgeClient(client?: Client) {
    apiClient = client;
    if (!client) {
        runInAction(() => userBadges.clear());
        fetchedAt.clear();
    }
}

export function getUserCustomBadges(uid?: string | null): CustomBadge[] {
    if (!uid) return [];
    if (
        apiClient &&
        !inflight.has(uid) &&
        Date.now() - (fetchedAt.get(uid) ?? 0) > STALE_MS
    ) {
        inflight.add(uid);
        fetchedAt.set(uid, Date.now());
        (apiClient.api.get(`/users/${uid}/nullcord/badges` as any) as Promise<
            CustomBadge[]
        >)
            .then((list) => runInAction(() => userBadges.set(uid, list)))
            .catch(() => {})
            .finally(() => inflight.delete(uid));
    }
    return userBadges.get(uid) ?? [];
}

/** Drop cached badges so the next read refetches (after owner edits). */
export function invalidateCustomBadges() {
    fetchedAt.clear();
}

const api = () => apiClient!.api as any;

export const fetchBadgeCatalog = (): Promise<BadgeCatalog> =>
    api().get("/users/@me/nullcord/badge-catalog");
export const createCustomBadge = (data: {
    name: string;
    description?: string;
    kind: string;
    value: string;
    colour?: string;
}): Promise<CustomBadge> => api().post("/users/@me/nullcord/badge-catalog", data);
export const editCustomBadge = (id: string, data: Partial<CustomBadge>) =>
    api().patch(`/users/@me/nullcord/badge-catalog/${id}`, data);
export const deleteCustomBadge = (id: string) =>
    api().delete(`/users/@me/nullcord/badge-catalog/${id}`);
export const giveCustomBadge = (id: string, user: string) =>
    api().put(`/users/@me/nullcord/badge-catalog/${id}/users/${user}`);
export const takeCustomBadge = (id: string, user: string) =>
    api().delete(`/users/@me/nullcord/badge-catalog/${id}/users/${user}`);

/** Read an image file into a data URI, shrinking it to fit the 110 KB cap. */
export async function imageToDataUri(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = () => rej(new Error("Could not read that image"));
            i.src = url;
        });
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        return canvas.toDataURL("image/png");
    } finally {
        URL.revokeObjectURL(url);
    }
}
