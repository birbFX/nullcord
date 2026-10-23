import questData from "./quests.json";
import { CLL_SERVER_ID } from "./constants";

export const QUESTS_EVENT = "nullcord:quests";

export type Quest = {
    id: string;
    title: string;
    description: string;
    reward: number;
    verification: string;
    target?: number;
    href?: string;
    hrefLabel?: string;
    action?: string;
};

export const QUEST_POOL = questData as Quest[];

export function today() {
    return new Date().toISOString().slice(0, 10);
}

function statsKey(userId: string) {
    return `nullcord:quest-events:${userId}:${today()}`;
}

function spokenKey(userId: string) {
    return `nullcord:spoken-servers:${userId}`;
}

function pendingInvitesKey(userId: string) {
    return `nullcord:pending-invites:${userId}`;
}

export function getQuestStats(userId?: string | null): Record<string, number> {
    if (!userId || typeof localStorage === "undefined") return {};
    try {
        return JSON.parse(localStorage.getItem(statsKey(userId)) ?? "{}");
    } catch {
        return {};
    }
}

export function recordQuestEvent(
    userId: string | null | undefined,
    event: string,
    amount = 1,
) {
    if (!userId || typeof localStorage === "undefined") return;
    const stats = getQuestStats(userId);
    stats[event] = (stats[event] ?? 0) + amount;
    try {
        localStorage.setItem(statsKey(userId), JSON.stringify(stats));
        window.dispatchEvent(
            new CustomEvent(QUESTS_EVENT, { detail: { event, amount } }),
        );
    } catch {
        // storage can be unavailable in private mode
    }
}

function getSpokenServers(userId: string): string[] {
    try {
        return JSON.parse(localStorage.getItem(spokenKey(userId)) ?? "[]");
    } catch {
        return [];
    }
}

/** Records a message, an optional image and first-time server activity. */
export function recordMessageSent(
    userId: string | null | undefined,
    serverId: string | null | undefined,
    hasImage: boolean,
) {
    if (!userId) return;
    recordQuestEvent(userId, "message_sent");
    if (hasImage) recordQuestEvent(userId, "image_sent");

    if (serverId) {
        const spoken = getSpokenServers(userId);
        if (!spoken.includes(serverId)) {
            spoken.push(serverId);
            try {
                localStorage.setItem(spokenKey(userId), JSON.stringify(spoken));
            } catch {
                // ignore
            }
            recordQuestEvent(userId, "first_message_server");
        }
    }
}

type PendingInvite = { serverId: string; code: string; ts: number };

function readPendingInvites(userId: string): PendingInvite[] {
    try {
        const raw = JSON.parse(
            localStorage.getItem(pendingInvitesKey(userId)) ?? "[]",
        ) as PendingInvite[];
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        return raw.filter((invite) => invite.ts >= cutoff);
    } catch {
        return [];
    }
}

export function recordInviteCreated(
    userId: string | null | undefined,
    serverId: string | null | undefined,
    code: string,
) {
    if (!userId) return;
    recordQuestEvent(userId, "invite_created");
    if (!serverId) return;

    const invites = readPendingInvites(userId);
    invites.push({ serverId, code, ts: Date.now() });
    try {
        localStorage.setItem(
            pendingInvitesKey(userId),
            JSON.stringify(invites.slice(-25)),
        );
    } catch {
        // ignore
    }
}

/** Called from the live ServerMemberJoin packet. */
export function recordServerMemberJoin(
    userId: string | null | undefined,
    serverId: string,
) {
    if (!userId) return;
    const invites = readPendingInvites(userId);
    const match = invites.find((invite) => invite.serverId === serverId);
    if (!match) return;

    recordQuestEvent(userId, "invite_joined");
    if (serverId === CLL_SERVER_ID) {
        recordQuestEvent(userId, "invite_joined_cll");
    }

    try {
        localStorage.setItem(
            pendingInvitesKey(userId),
            JSON.stringify(invites.filter((invite) => invite !== match)),
        );
    } catch {
        // ignore
    }
}

export function recordVoiceState(
    userId: string | null | undefined,
    participants: number,
    connected: boolean,
) {
    if (!userId || !connected) return;
    recordQuestEvent(userId, "voice_join");
    if (participants > 1) {
        recordQuestEvent(userId, "voice_with_others");
    }
}

export function questTarget(quest: Quest) {
    return quest.target ?? 1;
}

export function getQuestProgress(
    userId: string | null | undefined,
    quest: Quest,
): { current: number; target: number; verified: boolean } {
    const target = questTarget(quest);
    const current = getQuestStats(userId)[quest.verification] ?? 0;
    return {
        current: Math.min(current, target),
        target,
        verified: current >= target,
    };
}

function hash(input: string) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Six deterministic daily quests per user. */
export function dailyQuests(userId?: string | null): Quest[] {
    const seed = `${today()}:${userId ?? "guest"}`;
    return [...QUEST_POOL]
        .sort((a, b) => hash(seed + a.id) - hash(seed + b.id))
        .slice(0, 6);
}
