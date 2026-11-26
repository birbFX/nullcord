import { useEffect, useRef } from "preact/hooks";

import { useClient } from "../../controllers/client/ClientController";

interface Game {
    id: string;
    label: string;
}

interface DesktopBridge {
    isDesktop?: boolean;
    getGame: () => Promise<Game | null>;
    onGameChange: (callback: (game: Game | null) => void) => () => void;
}

declare global {
    interface Window {
        nullcordDesktop?: DesktopBridge;
    }
}

interface SavedStatus {
    text?: string | null;
    presence?: string | null;
}

/**
 * Desktop-only game presence.
 *
 * The desktop shell detects a few games (Portal RTX, Garry's Mod) and sends
 * changes over IPC. We replace the custom status with "Playing …" while a
 * game is open, then restore the previous status when it closes.
 */
export default function DesktopRPC() {
    const client = useClient();
    const currentGame = useRef<Game | null>(null);
    const userId = client.user?._id;

    useEffect(() => {
        const bridge = window.nullcordDesktop;
        if (!bridge || !userId) return;

        const storageKey = `nullcord:desktop:custom-status:${userId}`;
        let disposed = false;

        const readSaved = (): SavedStatus | undefined => {
            try {
                const raw = localStorage.getItem(storageKey);
                return raw ? JSON.parse(raw) : undefined;
            } catch {
                return undefined;
            }
        };

        const editStatus = async (
            status: Record<string, unknown>,
            remove?: string[],
        ) => {
            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    await client.users.edit({
                        status,
                        ...(remove ? { remove: remove as never } : {}),
                    });
                    return true;
                } catch (error) {
                    const response = (
                        error as {
                            response?: {
                                status?: number;
                                data?: { retry_after?: number };
                            };
                        }
                    ).response;

                    if (response?.status !== 429 || attempt === 2) {
                        return false;
                    }

                    const wait = Math.min(
                        Math.max((response.data?.retry_after ?? 10) * 1000, 1000),
                        15000,
                    );
                    await new Promise((resolve) =>
                        window.setTimeout(resolve, wait),
                    );
                }
            }

            return false;
        };

        const restore = async () => {
            const saved = readSaved();
            if (!saved) return;

            const ok = await editStatus(
                {
                    ...(client.user?.status ?? {}),
                    text: saved.text || undefined,
                    presence:
                        (saved.presence as never) ||
                        client.user?.status?.presence,
                },
                saved.text ? undefined : ["StatusText"],
            );
            if (ok) localStorage.removeItem(storageKey);
        };

        const apply = async (game: Game | null) => {
            if (disposed) return;
            currentGame.current = game;

            if (!game) {
                await restore();
                return;
            }

            if (!readSaved()) {
                const status = client.user?.status;
                localStorage.setItem(
                    storageKey,
                    JSON.stringify({
                        text: status?.text ?? null,
                        presence: status?.presence ?? null,
                    }),
                );
            }

            await editStatus({
                ...(client.user?.status ?? {}),
                text: `Playing ${game.label}`,
            });
        };

        void bridge.getGame().then((game) => {
            if (!disposed) void apply(game);
        });
        const unsubscribe = bridge.onGameChange((game) => {
            void apply(game);
        });

        // Best-effort restore on quit. If the request is aborted, the saved
        // status remains and is restored when NullCord is opened again.
        const onPageHide = () => {
            if (!currentGame.current) return;
            const saved = readSaved();
            if (!saved) return;

            try {
                const api = client.api as unknown as {
                    req: (
                        method: string,
                        path: string,
                        data: unknown,
                        config: { keepalive?: boolean },
                    ) => Promise<unknown>;
                };
                void api
                    .req(
                        "PATCH",
                        "/users/@me",
                        {
                            status: {
                                ...(client.user?.status ?? {}),
                                text: saved.text || undefined,
                                presence:
                                    (saved.presence as never) ||
                                    client.user?.status?.presence,
                            },
                            ...(saved.text
                                ? {}
                                : { remove: ["StatusText"] }),
                        },
                        { keepalive: true },
                    )
                    .catch(() => undefined);
            } catch {
                // next launch will restore it
            }
        };

        window.addEventListener("pagehide", onPageHide);
        return () => {
            disposed = true;
            unsubscribe();
            window.removeEventListener("pagehide", onPageHide);
        };
    }, [client, userId]);

    return null;
}
