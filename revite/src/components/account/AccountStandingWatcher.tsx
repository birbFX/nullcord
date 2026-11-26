import { useEffect } from "preact/hooks";

import { useClient } from "../../controllers/client/ClientController";
import { modalController } from "../../controllers/modals/ModalController";

/**
 * When a platform ban lands, force a full page reload to /login.
 *
 * The ban screen itself is shown by the login flow after the user submits
 * credentials, so there is no instant overlay racing session revocation.
 */
export default function AccountStandingWatcher() {
    const client = useClient();

    useEffect(() => {
        let timer: number | undefined;

        const handler = (packet: any) => {
            if (packet?.type !== "AccountStanding" || timer !== undefined) {
                return;
            }

            modalController.clear();

            // Give the admin panel time to revoke the session first.
            timer = window.setTimeout(() => {
                window.location.assign("/login");
            }, 1500);
        };

        client.addListener("packet", handler);
        return () => {
            client.removeListener("packet", handler);
            // Keep the pending redirect alive: revoking the session unmounts
            // this component, and the full reload is what clears stale modals.
        };
    }, [client]);

    return null;
}
