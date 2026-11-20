import { useEffect, useState } from "preact/hooks";

import { clientController } from "../controllers/client/ClientController";

export type Thread = {
    channel: string;
    parent: string;
    name: string;
    creator: string;
    created: number;
    archived: boolean;
};

export type ThreadList = { forums: string[]; threads: Thread[] };

const cache = new Map<string, ThreadList>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function api() {
    return clientController.getAvailableClient().api as any;
}

export async function loadThreads(server: string): Promise<ThreadList> {
    const list: ThreadList = await api().get(`/servers/${server}/threads`);
    cache.set(server, list);
    notify();
    return list;
}

export async function setForum(server: string, channel: string, on: boolean) {
    if (on) await api().put(`/servers/${server}/forums/${channel}`);
    else await api().delete(`/servers/${server}/forums/${channel}`);
    await loadThreads(server);
}

export async function createThread(server: string, parent: string, name: string) {
    const channel = await api().post(`/servers/${server}/threads`, {
        parent,
        name,
    });
    await loadThreads(server);
    return channel;
}

export async function archiveThread(
    server: string,
    thread: string,
    archived: boolean,
) {
    await api().patch(`/servers/${server}/threads/${thread}`, { archived });
    await loadThreads(server);
}

/** Subscribe to the server's forum/thread list. */
export function useThreads(server?: string): ThreadList | undefined {
    const [, tick] = useState(0);
    useEffect(() => {
        if (!server) return;
        const l = () => tick((n) => n + 1);
        listeners.add(l);
        loadThreads(server).catch(() => {});
        return () => void listeners.delete(l);
    }, [server]);
    return server ? cache.get(server) : undefined;
}
