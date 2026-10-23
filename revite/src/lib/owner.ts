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
