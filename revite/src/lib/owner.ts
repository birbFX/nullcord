import { economy } from "../mobx/stores/Economy";

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

export type NitroTier = "basic" | "nitro";

export function getNitroTier(
    userOrId?:
        | string
        | { _id?: string | null; privileged?: boolean }
        | null,
): NitroTier | null {
    if (!userOrId) return null;

    if (typeof userOrId === "string") {
        if (NITRO_IDS.has(userOrId) || userOrId === OWNER_ID) return "nitro";
        if (economy.userId === userOrId) return economy.nitro;
        return null;
    }

    if (userOrId.privileged || isOwner(userOrId._id)) return "nitro";
    const id = userOrId._id ?? undefined;
    if (id && economy.userId === id) return economy.nitro;
    return null;
}

export function isNitro(
    userOrId?:
        | string
        | { _id?: string | null; privileged?: boolean }
        | null,
): boolean {
    return getNitroTier(userOrId) !== null;
}

/** Full Nitro only; Nitro Basic does not include themes or boosts. */
export function isNitroFull(
    userOrId?:
        | string
        | { _id?: string | null; privileged?: boolean }
        | null,
): boolean {
    return getNitroTier(userOrId) === "nitro";
}

/**
 * @deprecated Nitro is changed by the server economy endpoint.
 * This remains only for older call sites during migration.
 */
export function setNitroTier(_userId: string, _tier: NitroTier | null) {
    // Server-authoritative. Use economy.redeem() instead.
}


/** Display-only discriminator override for the owner account. */
export function displayDiscriminator(
    user?: { _id?: string | null; discriminator?: string | null } | null,
): string {
    if (isOwner(user?._id)) return "0001";
    return user?.discriminator ?? "0000";
}
