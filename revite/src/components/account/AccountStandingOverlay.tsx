import { createPortal } from "preact/compat";
import { useEffect, useState } from "preact/hooks";

import AccountStanding from "../../pages/login/AccountStanding";
import { accountStanding } from "../../lib/accountStanding";
import type { BanInfo } from "../../controllers/client/jsx/error";

export default function AccountStandingOverlay() {
    const [info, setInfo] = useState<BanInfo | undefined>(
        accountStanding.info,
    );

    useEffect(() => {
        const handler = (event: Event) => {
            setInfo((event as CustomEvent<BanInfo | undefined>).detail);
        };

        window.addEventListener("nullcord:account-standing", handler);
        return () =>
            window.removeEventListener("nullcord:account-standing", handler);
    }, []);

    if (!info || typeof document === "undefined") return null;

    return createPortal(<AccountStanding info={info} />, document.body);
}
