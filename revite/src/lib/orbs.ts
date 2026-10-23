import { isOwner } from "./owner";

export const ORBS_EVENT = "nullcord:orbs";

export type Quest = {
    id: string;
    title: string;
    description: string;
    reward: number;
    href?: string;
    hrefLabel?: string;
};

export const QUEST_POOL: Quest[] = [
    {
        id: "bug",
        title: "Report a real bug",
        description:
            "Open an issue on GitHub for a real bug, then claim your Orbs.",
        reward: 150,
        href: "https://github.com/birbFX/nullcord/issues/new",
        hrefLabel: "Open an issue",
    },
    {
        id: "hello",
        title: "Say hello",
        description: "Send a message in any channel today.",
        reward: 25,
    },
    {
        id: "reactions",
        title: "Spread reactions",
        description: "React to five messages.",
        reward: 30,
    },
    {
        id: "invite",
        title: "Bring a friend",
        description: "Invite someone to the Canyon Lake Labs Official Server.",
        reward: 100,
        href: "/invite/canyonlake",
        hrefLabel: "Copy invite",
    },
    {
        id: "profile",
        title: "Dress up",
        description: "Set a display name or write a bio.",
        reward: 40,
    },
    {
        id: "voice",
        title: "Hang out in voice",
        description: "Join a voice channel with someone.",
        reward: 60,
    },
    {
        id: "theme",
        title: "Change your look",
        description: "Pick a different theme in Appearance settings.",
        reward: 35,
    },
    {
        id: "discover",
        title: "Explore Discover",
        description: "Visit the Discover page and browse the themes.",
        reward: 20,
        href: "/discover",
        hrefLabel: "Open Discover",
    },
    {
        id: "nitro",
        title: "Window shopping",
        description: "Check out the Nitro page and see what Orbs can buy.",
        reward: 15,
        href: "/nitro",
        hrefLabel: "Open Nitro",
    },
];

function today() {
    return new Date().toISOString().slice(0, 10);
}

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

function hash(input: string) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Four deterministic daily quests per user. */
export function dailyQuests(userId?: string | null): Quest[] {
    const seed = `${today()}:${userId ?? "guest"}`;
    return [...QUEST_POOL]
        .sort((a, b) => hash(seed + a.id) - hash(seed + b.id))
        .slice(0, 4);
}

function completedToday(userId: string): Record<string, string> {
    try {
        return JSON.parse(localStorage.getItem(questKey(userId)) ?? "{}");
    } catch {
        return {};
    }
}

export function isQuestDone(userId: string | null | undefined, questId: string) {
    if (!userId || typeof localStorage === "undefined") return false;
    return completedToday(userId)[questId] === today();
}

export function completeQuest(
    userId: string | null | undefined,
    quest: Quest,
): boolean {
    if (!userId || typeof localStorage === "undefined") return false;
    if (isQuestDone(userId, quest.id)) return false;

    const done = completedToday(userId);
    done[quest.id] = today();
    localStorage.setItem(questKey(userId), JSON.stringify(done));
    addOrbs(userId, quest.reward);
    return true;
}

export function isNitroOwner(user?: { _id?: string | null } | null) {
    return isOwner(user?._id);
}
