import questData from "./quests.json";

import { economy } from "../mobx/stores/Economy";

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

/**
 * @deprecated Quest events are recorded by the server. Kept as a no-op so
 * older client call sites do not need to change all at once.
 */
export function recordQuestEvent(
    _userId: string | null | undefined,
    _event: string,
    _amount = 1,
) {
    // no-op: server hooks own quest progress
}

export function getQuestStats(_userId?: string | null): Record<string, number> {
    return {};
}

export function recordMessageSent(
    _userId: string | null | undefined,
    _serverId: string | null | undefined,
    _hasImage: boolean,
) {
    // no-op: server records message/image/first-server quests
}

export function recordInviteCreated(
    _userId: string | null | undefined,
    _serverId: string | null | undefined,
    _code: string,
) {
    // no-op: server records invite creation
}

export function recordServerMemberJoin(
    _userId: string | null | undefined,
    _serverId: string,
) {
    // no-op: server records accepted invites
}

export function recordVoiceState(
    _userId: string | null | undefined,
    _participants: number,
    _connected: boolean,
) {
    // no-op: server records voice presence quests
}

export function questTarget(quest: Quest) {
    return quest.target ?? 1;
}

export function getQuestProgress(
    _userId: string | null | undefined,
    quest: Quest,
): { current: number; target: number; verified: boolean } {
    const state = economy.quest(quest.id);
    const target = state?.target ?? questTarget(quest);
    const current = state?.progress ?? 0;
    return {
        current: Math.min(current, target),
        target,
        verified: state?.verified ?? false,
    };
}

/** Six daily quests chosen by the server. */
export function dailyQuests(_userId?: string | null): Quest[] {
    return economy.quests
        .map((state) => QUEST_POOL.find((quest) => quest.id === state.id))
        .filter((quest): quest is Quest => !!quest);
}
