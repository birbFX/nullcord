import { isOwner } from "./owner";
import { economy } from "../mobx/stores/Economy";
import type { Quest } from "./quests";

export type { Quest } from "./quests";
export { dailyQuests, QUESTS_EVENT } from "./quests";

export const ORBS_EVENT = "nullcord:orbs";

/** Current server-authoritative balance for the signed-in account. */
export function getOrbs(userId?: string | null): number {
    if (userId && economy.userId && userId !== economy.userId) return 0;
    return economy.orbs;
}

/** @deprecated Orbs are changed only by server endpoints. */
export function addOrbs(_userId: string | null | undefined, _amount: number) {
    // no-op: the server owns the balance
}

/** @deprecated Nitro purchases are performed by economy.redeem(). */
export function spendOrbs(
    _userId: string | null | undefined,
    _amount: number,
): boolean {
    return false;
}

export function isAdminUser(
    user?: { _id?: string | null; privileged?: boolean } | null,
) {
    return !!user && (!!user.privileged || isOwner(user._id));
}

export function formatOrbs(_userId: string | null | undefined, admin: boolean) {
    return admin ? "∞" : economy.orbs.toLocaleString();
}

export function isQuestDone(
    userId: string | null | undefined,
    quest: Quest,
): boolean {
    if (userId && economy.userId && userId !== economy.userId) return false;
    return economy.quest(quest.id)?.claimed ?? false;
}

/** @deprecated Use economy.claim() and the server response. */
export function completeQuest(
    _userId: string | null | undefined,
    _quest: Quest,
): boolean {
    return false;
}

export function isNitroOwner(user?: { _id?: string | null } | null) {
    return isOwner(user?._id);
}
