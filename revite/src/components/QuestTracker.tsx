import { useEffect } from "preact/hooks";
import { useLocation } from "react-router-dom";

import { useClient } from "../controllers/client/ClientController";
import {
    recordMessageSent,
    recordQuestEvent,
    recordServerMemberJoin,
} from "../lib/quests";

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

        const onMessage = (message: any) => {
            if (message?.author_id !== userId) return;
            const channel = client.channels.get(message.channel_id);
            const hasImage = (message.attachments ?? []).some((attachment: any) => {
                const type =
                    attachment?.metadata?.type ??
                    attachment?.content_type ??
                    "";
                if (typeof type === "string" && type.startsWith("image/")) {
                    return true;
                }
                const name =
                    attachment?.filename ?? attachment?.metadata?.name ?? "";
                return /\.(png|jpe?g|gif|webp|avif)$/i.test(name);
            });
            recordMessageSent(userId, channel?.server_id, hasImage);
        };

        const onUpdated = (message: any, packet: any) => {
            if (
                packet?.type === "MessageReact" &&
                packet.user_id === userId
            ) {
                recordQuestEvent(userId, "reaction");
            }
        };

        client.on("packet", listener);
        client.on("message", onMessage);
        client.on("message/updated", onUpdated);
        return () => {
            client.removeListener("packet", listener);
            client.removeListener("message", onMessage);
            client.removeListener("message/updated", onUpdated);
        };
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
