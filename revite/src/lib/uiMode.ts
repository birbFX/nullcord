import { useEffect, useState } from "preact/hooks";

export type UiMode = "regular" | "stoat" | "combined";

export const UI_MODE_EVENT = "nullcord:ui-mode";
const STORAGE_KEY = "nullcord:ui-mode";
const DEFAULT_MODE: UiMode = "combined";

export function getUiMode(): UiMode {
    if (typeof localStorage === "undefined") return DEFAULT_MODE;
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        if (value === "regular" || value === "stoat" || value === "combined") {
            return value;
        }
    } catch {
        // ignore
    }
    return DEFAULT_MODE;
}

export function applyUiMode(mode: UiMode = getUiMode()) {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.ui = mode;
}

export function setUiMode(mode: UiMode) {
    try {
        localStorage.setItem(STORAGE_KEY, mode);
    } catch {
        // ignore
    }
    applyUiMode(mode);
    try {
        document.cookie = `nullcord_client=${mode === "stoat" ? "stoat" : "nullcord"}; path=/; SameSite=Lax`;
    } catch {
        // ignore
    }
    window.dispatchEvent(new Event(UI_MODE_EVENT));
}

export function useUiMode() {
    const [mode, setMode] = useState<UiMode>(getUiMode);

    useEffect(() => {
        const refresh = () => setMode(getUiMode());
        window.addEventListener(UI_MODE_EVENT, refresh);
        return () => window.removeEventListener(UI_MODE_EVENT, refresh);
    }, []);

    return mode;
}
