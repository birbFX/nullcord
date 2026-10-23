import { useEffect } from "preact/hooks";
import { useLocation } from "react-router-dom";

import { useClient } from "../controllers/client/ClientController";
import { recordQuestEvent, recordServerMemberJoin } from "../lib/quests";

/**
 * Watches real client activity for quest verification. It returns nothing;
 * mount it once inside the authenticated app.
 */
export default function QuestTracker() {
    const client = useClient();
    const { pathname } = useLocation();
    const userId = client.user?._id;

    useEffect(() => {
        if (!userId) return;

        const listener = (packet: any) => {
            if (packet?.type === "ServerMemberJoin" && packet.id) {
                recordServerMemberJoin(userId, packet.id);
            }
        };

        client.on("packet", listener);
        return () => client.removeListener("packet", listener);
    }, [client, userId]);

    useEffect(() => {
        if (!userId) return;

        if (pathname.startsWith("/discover/themes")) {
            recordQuestEvent(userId, "visit_themes");
            recordQuestEvent(userId, "visit_discover");
        } else if (pathname.startsWith("/discover")) {
            recordQuestEvent(userId, "visit_discover");
        } else if (pathname.startsWith("/nitro")) {
            recordQuestEvent(userId, "visit_nitro");
        } else if (pathname.startsWith("/quests")) {
            recordQuestEvent(userId, "visit_quests");
        }
    }, [pathname, userId]);

    return null;
}
