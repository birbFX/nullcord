// @ts-expect-error No typings.
import rgba from "color-rgba";
import { makeAutoObservable, computed, action } from "mobx";

import { isTouchscreenDevice } from "../../../lib/isTouchscreenDevice";

import {
    Theme,
    PRESETS,
    Variables,
    DEFAULT_FONT,
    DEFAULT_MONO_FONT,
    Fonts,
    MonospaceFonts,
    ComputedVariables,
} from "../../../context/Theme";

import Settings from "../Settings";

const SURFACES = [
    "primary-background",
    "background",
    "secondary-background",
    "tertiary-background",
    "primary-header",
    "secondary-header",
    "block",
    "message-box",
];
const TEXT = ["foreground", "secondary-foreground", "tertiary-foreground"];

/**
 * Helper class for reading and writing themes.
 */
export default class STheme {
    private settings: Settings;

    /**
     * Construct a new theme helper.
     * @param settings Settings parent class
     */
    constructor(settings: Settings) {
        this.settings = settings;
        makeAutoObservable(this);

        this.setBase = this.setBase.bind(this);
        this.reset = this.reset.bind(this);
    }

    @computed toJSON() {
        return JSON.parse(
            JSON.stringify({
                ...this.getVariables(),
                css: this.getCSS(),
                font: this.getFont(),
                monospaceFont: this.getMonospaceFont(),
            }),
        );
    }

    @action hydrate(data: Partial<Theme>, resetCSS = false) {
        if (resetCSS) this.setCSS();

        for (const key of Object.keys(data)) {
            const value = data[key as keyof Theme] as string;
            switch (key) {
                case "css": {
                    this.setCSS(value);
                    break;
                }
                case "font": {
                    this.setFont(value as Fonts);
                    break;
                }
                case "monospaceFont": {
                    this.setMonospaceFont(value as MonospaceFonts);
                    break;
                }
                default:
                    this.setVariable(key as Variables, value);
            }
        }
    }

    /**
     * Get the base theme used for this theme.
     * @returns Id of base theme
     */
    @computed getBase() {
        return this.settings.get("appearance:theme:base") ?? "dark";
    }

    /**
     * Get whether the theme is light.
     * @returns True if the theme is light
     */
    @computed isLight() {
        return (
            this.settings.get("appearance:theme:light") ??
            this.getBase() === "light"
        );
    }

    /**
     * Get the current theme's CSS variables.
     * @returns Record of CSS variables
     */
    @computed getVariables(): Theme {
        return {
            ...PRESETS[this.getBase()],
            ...this.settings.get("appearance:theme:overrides"),
            light: this.isLight(),
        };
    }

    /**
     * When only some surfaces are recoloured, shift the untouched ones by the
     * same amount so the whole page blends instead of mixing palettes.
     */
    @computed private blendedOverrides(): Record<string, string> {
        const overrides = (this.settings.get("appearance:theme:overrides") ??
            {}) as Record<string, string>;
        const preset = PRESETS[this.getBase()] as unknown as Record<
            string,
            string
        >;

        const anchorKey = SURFACES.find((k) => overrides[k]);
        if (!anchorKey) return overrides;

        const to = rgba(overrides[anchorKey]);
        const from = rgba(preset[anchorKey]);
        // gradients and other non-colour values: leave everything as set
        if (!to || !from) return overrides;
        if (SURFACES.some((k) => overrides[k] && !rgba(overrides[k])))
            return overrides;

        const delta = [0, 1, 2].map((i) => to[i] - from[i]);
        const blended: Record<string, string> = { ...overrides };
        for (const key of SURFACES) {
            if (overrides[key]) continue;
            const base = rgba(preset[key]);
            if (!base) continue;
            const [r, g, b] = [0, 1, 2].map((i) =>
                Math.max(0, Math.min(255, Math.round(base[i] + delta[i]))),
            );
            blended[key] = `rgb(${r}, ${g}, ${b})`;
        }

        // readable text on the new surface if the user didn't pick any
        const text = getContrastingColour(overrides[anchorKey]);
        const light = text === "black";
        for (const key of TEXT) {
            if (overrides[key]) continue;
            const wantLight = !light;
            const presetIsLight = !this.isLight();
            if (wantLight !== presetIsLight)
                blended[key] = light ? "#2E3338" : "#F2F3F5";
        }
        return blended;
    }

    @computed computeVariables(): ComputedVariables {
        const variables = {
            ...this.getVariables(),
            ...this.blendedOverrides(),
        } as Record<string, string | boolean | number>;

        for (const key of Object.keys(variables)) {
            const value = variables[key];
            if (typeof value === "string") {
                variables[`${key  }-contrast`] = getContrastingColour(value);
            }
        }

        return {
            ...(variables as unknown as Theme),
            "min-opacity": this.settings.get("appearance:transparency", true)
                ? 0
                : 1,
            "header-height": isTouchscreenDevice ? "56px" : "48px",
            "effective-bottom-offset": isTouchscreenDevice
                ? "var(--bottom-navigation-height)"
                : "0px",
        };
    }

    @action setVariable(key: Variables, value: string) {
        this.settings.set("appearance:theme:overrides", {
            ...this.settings.get("appearance:theme:overrides"),
            [key]: value,
        });
    }

    /**
     * Get a specific value of a variable by its key.
     * @param key Variable
     * @returns Value of variable
     */
    @computed getVariable(key: Variables) {
        return (this.settings.get("appearance:theme:overrides")?.[key] ??
            PRESETS[this.getBase()]?.[key])!;
    }

    /**
     * Get the contrasting colour of a variable by its key.
     * @param key Variable
     * @returns Contrasting value
     */
    @computed getContrastingVariable(key: Variables, fallback?: string) {
        return getContrastingColour(this.getVariable(key), fallback);
    }

    @action setFont(font: Fonts) {
        this.settings.set("appearance:theme:font", font);
    }

    /**
     * Get the current applied font.
     * @returns Current font
     */
    @computed getFont() {
        return this.settings.get("appearance:theme:font") ?? DEFAULT_FONT;
    }

    @action setMonospaceFont(font: MonospaceFonts) {
        this.settings.set("appearance:theme:monoFont", font);
    }

    /**
     * Get the current applied monospace font.
     * @returns Current monospace font
     */
    @computed getMonospaceFont() {
        return (
            this.settings.get("appearance:theme:monoFont") ?? DEFAULT_MONO_FONT
        );
    }

    @action setCSS(value?: string) {
        if (value && value.length > 0) {
            this.settings.set("appearance:theme:css", value);
        } else {
            this.settings.remove("appearance:theme:css");
        }
    }

    /**
     * Get the currently applied CSS snippet.
     * @returns CSS string
     */
    @computed getCSS() {
        return this.settings.get("appearance:theme:css");
    }

    @computed isModified() {
        return (
            Object.keys(this.settings.get("appearance:theme:overrides") ?? {})
                .length > 0
        );
    }

    @action setBase(base?: "light" | "dark") {
        if (base) {
            this.settings.set("appearance:theme:base", base);
        } else {
            this.settings.remove("appearance:theme:base");
        }
    }

    @action reset() {
        this.settings.remove("appearance:theme:overrides");
        this.settings.remove("appearance:theme:css");
    }
}

function getContrastingColour(hex: string, fallback?: string): string {
    if (typeof hex !== "string") return "black";

    const colour = rgba(hex);
    if (!colour) return fallback ? getContrastingColour(fallback) : "black";

    // https://awik.io/determine-color-bright-dark-using-javascript/
    // http://alienryderflex.com/hsp.html
    const [r, g, b] = colour;
    // const hsp = Math.sqrt(0.299 * r ** 2 + 0.587 * g ** 2 + 0.114 * b ** 2);
    // Using Skia numbers.
    const hsp = Math.sqrt(0.2126 * r ** 2 + 0.7152 * g ** 2 + 0.0722 * b ** 2);
    return hsp > 175 ? "black" : "white";
}
