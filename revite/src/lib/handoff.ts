/**
 * Two-minute, one-shot handoff between the NullCord Preact client and the
 * Stoat for Web client. Both live on the same origin, so the target client
 * can consume the session once and remove it immediately.
 */
export const HANDOFF_KEY = "nullcord:handoff";
export const HANDOFF_TTL = 120_000;

export type HandoffTarget = "nullcord" | "stoat";

export type HandoffToken = {
    token: string;
    userId: string;
    sessionId: string;
    expires: number;
    target: HandoffTarget;
};

export function writeHandoff(
    session: { _id?: string; token: string; user_id?: string; userId?: string },
    target: HandoffTarget,
) {
    const userId = session.user_id ?? session.userId;
    if (!userId || !session.token || typeof localStorage === "undefined") return;
    const payload: HandoffToken = {
        token: session.token,
        userId,
        sessionId: session._id ?? userId,
        expires: Date.now() + HANDOFF_TTL,
        target,
    };
    try {
        localStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
    } catch {
        // ignore
    }
}

export function consumeHandoff(target: HandoffTarget): HandoffToken | undefined {
    if (typeof localStorage === "undefined") return;
    try {
        const raw = localStorage.getItem(HANDOFF_KEY);
        if (!raw) return;
        localStorage.removeItem(HANDOFF_KEY);
        const data = JSON.parse(raw) as HandoffToken;
        if (data.target !== target) return;
        if (!data.token || !data.userId) return;
        if (Date.now() > data.expires) return;
        return data;
    } catch {
        return;
    }
}
