import { observer } from "mobx-react-lite";
import { useHistory } from "react-router-dom";
import { Channel as ChannelI } from "revolt.js";
import styled from "styled-components/macro";

import { useState } from "preact/hooks";

import { createThread, useThreads } from "../../lib/forums";
import ChannelHeader from "./ChannelHeader";

const Wrap = styled.div`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 16px;
    gap: 12px;
    overflow-y: auto;

    h2 {
        margin: 0;
        font-size: 20px;
        color: var(--foreground);
    }

    .new {
        display: flex;
        gap: 8px;

        input {
            flex: 1;
            padding: 10px 12px;
            border-radius: 6px;
            border: 1px solid var(--tertiary-background);
            background: var(--secondary-background);
            color: var(--foreground);
        }

        button {
            all: unset;
            cursor: pointer;
            padding: 10px 16px;
            border-radius: 6px;
            font-weight: 600;
            color: #fff;
            background: var(--accent);
        }
    }

    .error {
        color: var(--error);
        font-size: 13px;
    }

    .empty {
        margin: auto;
        text-align: center;
        color: var(--tertiary-foreground);
    }

    .post {
        all: unset;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px 14px;
        border-radius: 8px;
        background: var(--secondary-background);

        &:hover {
            background: var(--primary-header);
        }

        .title {
            font-weight: 700;
            color: var(--foreground);
        }

        .meta {
            font-size: 12px;
            color: var(--tertiary-foreground);
        }
    }
`;

export default observer(({ channel }: { channel: ChannelI }) => {
    const history = useHistory();
    const list = useThreads(channel.server_id);
    const [title, setTitle] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const posts = (list?.threads ?? [])
        .filter((t) => t.parent === channel._id)
        .sort((a, b) => b.created - a.created);

    async function submit() {
        const name = title.trim();
        if (!name) return setError("Your post needs a title.");
        if (name.length > 28)
            return setError("Post titles can be at most 28 characters.");
        setBusy(true);
        setError("");
        try {
            const created = await createThread(
                channel.server_id!,
                channel._id,
                name,
            );
            setTitle("");
            history.push(`/server/${channel.server_id}/channel/${created._id}`);
        } catch (err: any) {
            setError(
                err?.response?.data?.error ||
                    err?.response?.data?.type ||
                    "Could not create the post.",
            );
        }
        setBusy(false);
    }

    return (
        <>
            <ChannelHeader channel={channel} />
            <Wrap>
                <h2>Forum posts</h2>
                <div className="new">
                    <input
                        value={title}
                        maxLength={28}
                        placeholder="Post title"
                        onInput={(e) => setTitle(e.currentTarget.value)}
                        onKeyDown={(e) => e.key === "Enter" && submit()}
                    />
                    <button disabled={busy} onClick={submit}>
                        New Post
                    </button>
                </div>
                {error && <div className="error">{error}</div>}
                {posts.length === 0 ? (
                    <div className="empty">No posts yet. Start the first one!</div>
                ) : (
                    posts.map((p) => (
                        <button
                            key={p.channel}
                            className="post"
                            onClick={() =>
                                history.push(
                                    `/server/${channel.server_id}/channel/${p.channel}`,
                                )
                            }>
                            <span className="title">
                                {p.archived ? "🔒 " : ""}
                                {p.name}
                            </span>
                            <span className="meta">
                                {new Date(p.created).toLocaleString()}
                            </span>
                        </button>
                    ))
                )}
            </Wrap>
        </>
    );
});
