import { makeAutoObservable } from "mobx";

import type { BanInfo, BanViolation } from "../controllers/client/jsx/error";

/**
 * Global account-standing state.
 *
 * This is deliberately outside the login page: when the admin panel bans a
 * logged-in user, the gateway pushes an AccountStanding event and the app can
 * cover the UI immediately, before the revoked session redirects to /login.
 */
class AccountStandingStore {
    info?: BanInfo;

    constructor() {
        makeAutoObservable(this);
    }

    show(info: BanInfo) {
        this.info = info;
        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent("nullcord:account-standing", {
                    detail: info,
                }),
            );
        }
    }

    clear() {
        this.info = undefined;
        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent("nullcord:account-standing", {
                    detail: undefined,
                }),
            );
        }
    }
}

const globalKey = "__nullcordAccountStanding";
const globalStore = globalThis as typeof globalThis & {
    [globalKey]?: AccountStandingStore;
};

// The overlay lives in the main bundle while the gateway watcher lives in the
// lazy RevoltApp chunk. Keep one instance even if the bundler duplicates this
// tiny module across chunks.
export const accountStanding: AccountStandingStore =
    globalStore[globalKey] ?? (globalStore[globalKey] = new AccountStandingStore());

/**
 * Normalise either the login error payload or the gateway event payload.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normaliseBanInfo(value: any): BanInfo | undefined {
    if (
        !value ||
        (value.type !== "AccountBanned" && value.type !== "IpBanned")
    ) {
        return undefined;
    }

    const violations: BanViolation[] | undefined = Array.isArray(
        value.violations,
    )
        ? value.violations
              .filter(
                  (entry: any) =>
                      entry && typeof entry.reason === "string",
              )
              .map((entry: any) => ({
                  reason: entry.reason,
                  created_at: entry.created_at ?? null,
              }))
        : undefined;

    return {
        type: value.type,
        message: value.message || undefined,
        expiresAt: value.expires_at ?? value.expiresAt ?? null,
        violations,
    };
}
