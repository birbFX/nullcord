/**
 * Canyon Lake Labs — owner / developer helpers.
 *
 * The owner account is identified by its user id (birbfx). Change OWNER_ID
 * here if ownership ever moves; every owner visual (gold name, crown) and
 * the /dev guard read from this file.
 */
export const OWNER_ID = "01M5KCFRPDZZHPADH5BKJT19VG";

/** Gold used for the owner's name. */
export const OWNER_COLOUR = "#f7c948";

/** Bit 1 of user.badges = Developer. */
export const DEVELOPER_BADGE = 1;

export function isOwner(id?: string | null): boolean {
    return !!id && id === OWNER_ID;
}

export function isDeveloper(
    user?: {
        _id?: string;
        privileged?: boolean;
        badges?: number | null;
    } | null,
): boolean {
    if (!user) return false;
    if (isOwner(user._id) || user.privileged) return true;
    return (
        typeof user.badges === "number" &&
        (user.badges & DEVELOPER_BADGE) !== 0
    );
}

/** Accounts with Nitro enabled by default (UI only; billing is not implemented). */
export const NITRO_IDS = new Set<string>([OWNER_ID]);

function hasLocalNitro(id?: string | null): boolean {
    if (!id || typeof localStorage === "undefined") return false;
    try {
        return localStorage.getItem(`nullcord:nitro:${id}`) === "1";
    } catch {
        return false;
    }
}

export function isNitro(
    userOrId?:
        | string
        | { _id?: string | null; privileged?: boolean }
        | null,
): boolean {
    if (!userOrId) return false;
    if (typeof userOrId === "string") {
        return (
            NITRO_IDS.has(userOrId) ||
            userOrId === OWNER_ID ||
            hasLocalNitro(userOrId)
        );
    }
    if (userOrId.privileged) return true;
    const id = userOrId._id ?? undefined;
    return !!id && (NITRO_IDS.has(id) || id === OWNER_ID || hasLocalNitro(id));
}
