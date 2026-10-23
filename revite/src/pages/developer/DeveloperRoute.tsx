import { Redirect } from "react-router-dom";

import { useClient } from "../../controllers/client/ClientController";
import { isDeveloper } from "../../lib/owner";

import Developer from "./Developer";

/**
 * /dev is not public: only platform admins (privileged), the owner, and
 * holders of the Developer badge may open it. Everyone else is sent home.
 *
 * This is a client-side guard for a debug page that talks to the current
 * client; it does not expose any server-side administration routes.
 */
export default function DeveloperRoute() {
    const client = useClient();

    if (!isDeveloper(client.user)) {
        return <Redirect to="/" />;
    }

    return <Developer />;
}
