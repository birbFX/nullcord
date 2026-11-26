import { useEffect } from "preact/hooks";

import { useClient } from "../../controllers/client/ClientController";
import { accountStanding, normaliseBanInfo } from "../../lib/accountStanding";

/**
 * Listens for platform ban pushes while the user is connected.
 */
export default function AccountStandingWatcher() {
    const client = useClient();

    useEffect(() => {
        const handler = (packet: any) => {
            if (packet?.type !== "AccountStanding") return;

            const info = normaliseBanInfo(packet.info);
            if (info) accountStanding.show(info);
        };

        client.addListener("packet", handler);
        return () => client.removeListener("packet", handler);
    }, [client]);

    return null;
}
