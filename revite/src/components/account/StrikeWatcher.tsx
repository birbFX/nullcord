import { useEffect } from "preact/hooks";
import { decodeTime } from "ulid";

import { useClient } from "../../controllers/client/ClientController";
import { modalController } from "../../controllers/modals/ModalController";

interface Strike {
    _id: string;
    reason: string;
    kind?: string;
    created_at?: string | null;
}

interface SafetyStanding {
    strikes: Strike[];
}

const SEEN_KEY = "nullcord:seen-strikes";
const ACTIVE_DAYS = 90;

function isActive(strike: Strike) {
    if ((strike.kind || "strike") !== "strike") return false;

    const created = strike.created_at
        ? new Date(strike.created_at).getTime()
        : decodeTime(strike._id);
    return Date.now() - created < ACTIVE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * On login, show a modal for any active strike the user has not seen yet.
 */
export default function StrikeWatcher() {
    const client = useClient();

    useEffect(() => {
        let cancelled = false;

        void client.api
            .get("/users/@me/safety")
            .then((data) => {
                if (cancelled) return;

                const standings = data as SafetyStanding;
                const active = (standings.strikes || []).filter(isActive);
                if (active.length === 0) return;

                let seen: string[] = [];
                try {
                    const raw = localStorage.getItem(SEEN_KEY);
                    seen = raw ? JSON.parse(raw) : [];
                } catch {
                    seen = [];
                }

                const unseen = active.filter(
                    (strike) => !seen.includes(strike._id),
                );
                if (unseen.length === 0) return;

                localStorage.setItem(
                    SEEN_KEY,
                    JSON.stringify([
                        ...seen,
                        ...unseen.map((strike) => strike._id),
                    ]),
                );

                modalController.push({
                    type: "strike_notice",
                    strikes: unseen.map((strike) => ({
                        reason: strike.reason,
                    })),
                });
            })
            .catch(() => {
                // Safety data is optional; login must never be blocked by it.
            });

        return () => {
            cancelled = true;
        };
    }, [client]);

    return null;
}
