import { isOwner } from "./owner";
import { getQuestProgress, today, type Quest } from "./quests";

export type { Quest } from "./quests";
export { dailyQuests, QUESTS_EVENT } from "./quests";

export const ORBS_EVENT = "nullcord:orbs";

function orbKey(userId: string) {
    return `nullcord:orbs:${userId}`;
}

function questKey(userId: string) {
    return `nullcord:quests:${userId}`;
}

export function getOrbs(userId?: string | null): number {
    if (!userId || typeof localStorage === "undefined") return 0;
    try {
        return parseInt(localStorage.getItem(orbKey(userId)) ?? "0", 10) || 0;
    } catch {
        return 0;
    }
}

function setOrbs(userId: string, value: number) {
    localStorage.setItem(orbKey(userId), String(Math.max(0, value)));
    window.dispatchEvent(new Event(ORBS_EVENT));
}

export function addOrbs(userId: string | null | undefined, amount: number) {
    if (!userId || typeof localStorage === "undefined") return;
    setOrbs(userId, getOrbs(userId) + amount);
}

export function spendOrbs(userId: string | null | undefined, amount: number) {
    if (!userId || typeof localStorage === "undefined") return false;
    const balance = getOrbs(userId);
    if (balance < amount) return false;
    setOrbs(userId, balance - amount);
    return true;
}

export function isAdminUser(
    user?: { _id?: string | null; privileged?: boolean } | null,
) {
    return !!user && (!!user.privileged || isOwner(user._id));
}

export function formatOrbs(userId: string | null | undefined, admin: boolean) {
    return admin ? "∞" : getOrbs(userId).toLocaleString();
}

function completedToday(userId: string): Record<string, string> {
    try {
        return JSON.parse(localStorage.getItem(questKey(userId)) ?? "{}");
    } catch {
        return {};
    }
}

export function isQuestDone(userId: string | null | undefined, quest: Quest) {
    if (!userId || typeof localStorage === "undefined") return false;
    return completedToday(userId)[quest.id] === today();
}

export function completeQuest(
    userId: string | null | undefined,
    quest: Quest,
): boolean {
    if (!userId || typeof localStorage === "undefined") return false;
    if (isQuestDone(userId, quest)) return false;

    // Only pay out when the event tracker actually saw the requirement.
    if (!getQuestProgress(userId, quest).verified) return false;

    const done = completedToday(userId);
    done[quest.id] = today();
    localStorage.setItem(questKey(userId), JSON.stringify(done));
    addOrbs(userId, quest.reward);
    return true;
}

export function isNitroOwner(user?: { _id?: string | null } | null) {
    return isOwner(user?._id);
}
