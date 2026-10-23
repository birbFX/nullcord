import { useEffect, useState } from "preact/hooks";

import { recordQuestEvent } from "./quests";

export const PLUGINS_EVENT = "nullcord:plugins";

export type BuiltinPlugin = {
    id: string;
    name: string;
    description: string;
    defaultEnabled: boolean;
};

export const BUILTIN_PLUGINS: BuiltinPlugin[] = [
    {
        id: "server-tags",
        name: "Server Tags",
        description:
            "Show your equipped server tag as a diamond badge next to your username.",
        defaultEnabled: true,
    },
    {
        id: "quest-helper",
        name: "Quest Helper",
        description:
            "Show today's verified quest count in the Home sidebar.",
        defaultEnabled: true,
    },
    {
        id: "no-snow",
        name: "No Snow",
        description: "Disable the seasonal snowfall on the Home page.",
        defaultEnabled: false,
    },
];

const STORAGE_KEY = "nullcord:plugins";

function read(): Record<string, boolean> {
    if (typeof localStorage === "undefined") return {};
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    } catch {
        return {};
    }
}

export function getPluginStates(): Record<string, boolean> {
    return read();
}

export function isPluginEnabled(id: string): boolean {
    const state = read()[id];
    if (typeof state === "boolean") return state;
    return BUILTIN_PLUGINS.find((plugin) => plugin.id === id)?.defaultEnabled ?? false;
}

export function setPluginEnabled(
    id: string,
    enabled: boolean,
    userId?: string | null,
) {
    const state = read();
    state[id] = enabled;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        window.dispatchEvent(new Event(PLUGINS_EVENT));
        if (userId) recordQuestEvent(userId, "plugin_enabled");
    } catch {
        // ignore
    }
}

export function usePluginStates() {
    const [state, setState] = useState<Record<string, boolean>>(read);

    useEffect(() => {
        const refresh = () => setState(read());
        window.addEventListener(PLUGINS_EVENT, refresh);
        return () => window.removeEventListener(PLUGINS_EVENT, refresh);
    }, []);

    return state;
}
