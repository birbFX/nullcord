import styled from "styled-components/macro";

import { useEffect, useMemo, useState } from "preact/hooks";

import { useClient } from "../../../controllers/client/ClientController";

interface GifResult {
    id: string;
    url: string;
    media_formats: Record<string, { url: string; dimensions: number[] }>;
}

/**
 * Gifbox is proxied by serve-client.js at /gifbox-api so the picker is
 * same-origin and does not need another public hostname.
 */
const GIFBOX_URL =
    import.meta.env.VITE_GIFBOX_URL || "/gifbox-api";

const Panel = styled.div`
    width: min(460px, 94vw);
    height: min(540px, 72vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    background: var(--secondary-background);
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.5);
    color: var(--foreground);
    pointer-events: auto;

    header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 12px 8px;
    }

    header strong {
        font-size: 15px;
        letter-spacing: 0.01em;
    }

    header .close {
        margin-left: auto;
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 8px;
        cursor: pointer;
        color: var(--foreground);
        background: transparent;
        font-size: 20px;
        line-height: 24px;
    }

    header .close:hover {
        background: var(--primary-background);
    }

    .search {
        position: relative;
        padding: 0 12px 10px;
    }

    .search input {
        width: 100%;
        box-sizing: border-box;
        padding: 9px 12px 9px 34px;
        border: 1px solid transparent;
        border-radius: 8px;
        outline: none;
        color: var(--foreground);
        background: var(--primary-background);
        font-size: 14px;
        transition: border-color 0.15s ease;
    }

    .search input:focus {
        border-color: var(--accent, #5865f2);
    }

    .search .icon {
        position: absolute;
        left: 23px;
        top: 50%;
        transform: translateY(-58%);
        opacity: 0.55;
        font-size: 14px;
        pointer-events: none;
    }

    .grid {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 2px 12px 8px;
        columns: 2;
        column-gap: 8px;
        scrollbar-width: thin;
    }

    .gif {
        position: relative;
        display: block;
        width: 100%;
        margin: 0 0 8px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        overflow: hidden;
        background: var(--primary-background);
        cursor: pointer;
        break-inside: avoid;
    }

    .gif img {
        display: block;
        width: 100%;
        height: auto;
        min-height: 60px;
        transition: transform 0.18s ease, opacity 0.18s ease;
    }

    .gif:hover img {
        transform: scale(1.035);
        opacity: 0.88;
    }

    .gif .hint {
        position: absolute;
        left: 6px;
        right: 6px;
        bottom: 6px;
        padding: 4px 6px;
        border-radius: 5px;
        color: #fff;
        background: rgba(0, 0, 0, 0.66);
        font-size: 10px;
        text-align: center;
        opacity: 0;
        transition: opacity 0.15s ease;
        pointer-events: none;
    }

    .gif:hover .hint {
        opacity: 1;
    }

    .skeleton {
        width: 100%;
        margin-bottom: 8px;
        border-radius: 8px;
        background: linear-gradient(
            100deg,
            var(--primary-background) 30%,
            rgba(255, 255, 255, 0.06) 50%,
            var(--primary-background) 70%
        );
        background-size: 200% 100%;
        animation: shimmer 1.2s infinite linear;
        break-inside: avoid;
    }

    @keyframes shimmer {
        from {
            background-position: 200% 0;
        }
        to {
            background-position: -200% 0;
        }
    }

    .state {
        flex: 1;
        display: grid;
        place-items: center;
        padding: 24px;
        text-align: center;
        color: var(--foreground);
        opacity: 0.72;
        font-size: 13px;
        line-height: 20px;
    }

    .state button {
        margin-top: 10px;
        padding: 7px 12px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 7px;
        color: var(--foreground);
        background: var(--primary-background);
        cursor: pointer;
    }

    footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
        padding: 8px 12px 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.07);
        font-size: 11px;
        opacity: 0.55;
    }

    footer a {
        color: inherit;
    }
`;

export default function GifPicker({
    onSelect,
    onClose,
}: {
    onSelect: (url: string) => void;
    onClose: () => void;
}) {
    const client = useClient();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<GifResult[]>([]);
    const [error, setError] = useState<string>();
    const [loading, setLoading] = useState(true);
    const [reload, setReload] = useState(0);

    const token = useMemo(() => {
        const session = (
            client as unknown as { session?: { token?: string } | string }
        ).session;
        return typeof session === "string" ? session : session?.token;
    }, [client]);

    useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;

        const timer = setTimeout(async () => {
            setLoading(true);
            setError(undefined);

            try {
                if (!token) {
                    throw new Error("Sign in to use GIFs.");
                }

                const locale = (
                    (typeof navigator !== "undefined" && navigator.language) ||
                    "en_US"
                ).replace("-", "_");
                const trimmed = query.trim();
                const path = trimmed
                    ? `/search?query=${encodeURIComponent(
                          trimmed,
                      )}&locale=${encodeURIComponent(locale)}&limit=24`
                    : `/trending?locale=${encodeURIComponent(locale)}&limit=24`;

                const res = await fetch(GIFBOX_URL + path, {
                    signal: controller.signal,
                    headers: { "x-session-token": token },
                });

                if (!res.ok) {
                    throw new Error(
                        res.status === 401
                            ? "Your session expired. Sign in again."
                            : "GIF service is unavailable.",
                    );
                }

                const data = (await res.json()) as {
                    results?: GifResult[];
                };
                if (!cancelled) setResults(data.results ?? []);
            } catch (e) {
                if (cancelled || (e as Error).name === "AbortError") return;
                setResults([]);
                setError(
                    (e as Error).message ||
                        "GIF service is unavailable.",
                );
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 280);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, token, reload]);

    return (
        <Panel role="dialog" aria-label="GIF picker">
            <header>
                <strong>GIFs</strong>
                <button
                    className="close"
                    type="button"
                    aria-label="Close GIF picker"
                    onClick={onClose}>
                    ×
                </button>
            </header>

            <div className="search">
                <span className="icon" aria-hidden="true">
                    ⌕
                </span>
                <input
                    autoFocus
                    type="search"
                    placeholder="Search Tenor"
                    value={query}
                    onInput={(e) => setQuery(e.currentTarget.value)}
                />
            </div>

            {loading ? (
                <div className="grid" aria-busy="true">
                    {[150, 110, 180, 130, 160, 120, 170, 140].map(
                        (height, index) => (
                            <div
                                key={index}
                                className="skeleton"
                                style={{ height }}
                            />
                        ),
                    )}
                </div>
            ) : error ? (
                <div className="state">
                    <div>
                        {error}
                        <br />
                        <button
                            type="button"
                            onClick={() => setReload((value) => value + 1)}>
                            Try again
                        </button>
                    </div>
                </div>
            ) : results.length === 0 ? (
                <div className="state">
                    <div>
                        No GIFs found for “{query.trim() || "trending"}”.
                    </div>
                </div>
            ) : (
                <div className="grid">
                    {results.map((gif) => {
                        const preview =
                            gif.media_formats.tinygif ??
                            gif.media_formats.gif ??
                            Object.values(gif.media_formats)[0];
                        return (
                            preview && (
                                <button
                                    key={gif.id}
                                    type="button"
                                    className="gif"
                                    title="Send this GIF"
                                    onClick={() => {
                                        onSelect(gif.url);
                                        onClose();
                                    }}>
                                    <img
                                        loading="lazy"
                                        src={preview.url}
                                        alt=""
                                    />
                                    <span className="hint">Send</span>
                                </button>
                            )
                        );
                    })}
                </div>
            )}

            <footer>
                Powered by{" "}
                <a
                    href="https://tenor.com"
                    target="_blank"
                    rel="noreferrer">
                    Tenor
                </a>
            </footer>
        </Panel>
    );
}
