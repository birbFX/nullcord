import { isOwner } from "./owner";
import { addOrbs } from "./orbs";
import { QUESTS_EVENT, today } from "./quests";

/**
 * One-time migration for the Nitro Basic / full Nitro split.
 *
 * - Non-admin legacy Nitro unlocks are removed and refunded in Orbs.
 * - Today's quest claims are reset once so those Orbs can be claimed again.
 * - The marker makes this happen exactly once per user on this device.
 */
export function runOneTimeMigrations(
    user?: { _id?: string | null; privileged?: boolean } | null,
) {
    const userId = user?._id;
    if (!userId || typeof localStorage === "undefined") return;

    const marker = `nullcord:migration:nitro-split-v1:${userId}`;
    try {
        if (localStorage.getItem(marker)) return;
    } catch {
        return;
    }

    const admin = !!user?.privileged || isOwner(userId);

    try {
        if (!admin) {
            const legacy = localStorage.getItem(`nullcord:nitro:${userId}`);
            if (legacy) {
                const refund = legacy === "basic" ? 300 : 900;
                localStorage.removeItem(`nullcord:nitro:${userId}`);
                addOrbs(userId, refund);
                localStorage.setItem(
                    `nullcord:nitro-refund:${userId}`,
                    String(refund),
                );
            }

            const questKey = `nullcord:quests:${userId}`;
            const claims = JSON.parse(
                localStorage.getItem(questKey) ?? "{}",
            ) as Record<string, string>;
            let changed = false;
            for (const id of Object.keys(claims)) {
                if (claims[id] === today()) {
                    delete claims[id];
                    changed = true;
                }
            }
            if (changed) {
                localStorage.setItem(questKey, JSON.stringify(claims));
                window.dispatchEvent(new Event(QUESTS_EVENT));
            }
        }

        localStorage.setItem(marker, "1");
        window.dispatchEvent(new Event("nullcord:nitro-changed"));
    } catch {
        // storage failures are non-fatal; try again next load
    }
}
