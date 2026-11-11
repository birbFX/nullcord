import styled from "styled-components/macro";

import { useEffect, useState } from "preact/hooks";

interface GifResult {
    id: string;
    url: string;
    media_formats: Record<string, { url: string; dimensions: number[] }>;
}

/** Gifbox is published next to the API, e.g. nullcord-api.* -> nullcord-gifbox.* */
const GIFBOX_URL: string =
    import.meta.env.VITE_GIFBOX_URL ||
    String(import.meta.env.VITE_API_URL ?? "").replace("-api.", "-gifbox.");

const Panel = styled.div`
    width: min(420px, 94vw);
    height: 380px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 8px;
    background: var(--secondary-background);

    input {
        padding: 8px 10px;
        border-radius: 6px;
        border: none;
        color: var(--foreground);
        background: var(--primary-background);
    }

    .grid {
        flex: 1;
        overflow-y: auto;
        columns: 2;
        column-gap: 6px;
    }

    img {
        width: 100%;
        margin-bottom: 6px;
        border-radius: 4px;
        cursor: pointer;
        display: block;
    }

    .note {
        opacity: 0.7;
        font-size: 13px;
    }
`;

export default function GifPicker({
    onSelect,
    onClose,
}: {
    onSelect: (url: string) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<GifResult[]>([]);
    const [error, setError] = useState<string>();

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const path = query.trim()
                    ? `/search?query=${encodeURIComponent(query.trim())}&limit=24`
                    : "/trending?limit=24";
                const res = await fetch(GIFBOX_URL + path, {
                    signal: controller.signal,
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                setResults((await res.json()).results ?? []);
                setError(undefined);
            } catch (e) {
                if ((e as Error).name !== "AbortError") {
                    setError("GIF service is unavailable.");
                }
            }
        }, 300);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    return (
        <Panel>
            <input
                autoFocus
                placeholder="Search GIFs"
                value={query}
                onInput={(e) => setQuery(e.currentTarget.value)}
            />
            {error && <div className="note">{error}</div>}
            <div className="grid">
                {results.map((gif) => {
                    const preview =
                        gif.media_formats.tinygif ??
                        gif.media_formats.gif ??
                        Object.values(gif.media_formats)[0];
                    return (
                        preview && (
                            <img
                                key={gif.id}
                                loading="lazy"
                                src={preview.url}
                                onClick={() => {
                                    onSelect(gif.url);
                                    onClose();
                                }}
                            />
                        )
                    );
                })}
            </div>
        </Panel>
    );
}
