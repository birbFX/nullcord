export type GradientPreset = {
    id: string;
    name: string;
    css: string;
};

export const GRADIENT_PRESETS: GradientPreset[] = [
    { id: "aurora", name: "Aurora", css: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #7c3aed 100%)" },
    { id: "sunset", name: "Sunset", css: "linear-gradient(135deg, #2b1055 0%, #7597de 100%)" },
    { id: "ember", name: "Ember", css: "linear-gradient(135deg, #200122 0%, #6f0000 100%)" },
    { id: "candy", name: "Candy", css: "linear-gradient(135deg, #ff9a9e 0%, #fad0c4 45%, #a18cd1 100%)" },
    { id: "ocean", name: "Ocean", css: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)" },
    { id: "forest", name: "Forest", css: "linear-gradient(135deg, #0b3d2e 0%, #1f6f5c 55%, #9ad29a 100%)" },
    { id: "nebula", name: "Nebula", css: "linear-gradient(135deg, #1a0033 0%, #4b0082 45%, #00c2ff 100%)" },
    { id: "peach", name: "Peach", css: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)" },
    { id: "mint", name: "Mint", css: "linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)" },
    { id: "midnight", name: "Midnight", css: "linear-gradient(135deg, #000000 0%, #0f2027 50%, #203a43 100%)" },
    { id: "cotton", name: "Cotton", css: "linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)" },
    { id: "vice", name: "Vice", css: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)" },
    { id: "gold", name: "Gold", css: "linear-gradient(135deg, #141e30 0%, #243b55 55%, #f7c948 100%)" },
    { id: "rose", name: "Rose", css: "linear-gradient(135deg, #3a1c71 0%, #d76d77 50%, #ffaf7b 100%)" },
    { id: "abyss", name: "Abyss", css: "linear-gradient(135deg, #000428 0%, #004e92 100%)" },
    { id: "citrus", name: "Citrus", css: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)" },
];

export function customGradient(colourA: string, colourB: string, angle: number) {
    return `linear-gradient(${angle}deg, ${colourA} 0%, ${colourB} 100%)`;
}

/** Average the hex colours in a gradient to get a usable solid accent. */
export function gradientSolid(css: string, fallback = "#5865f2"): string {
    const colours = css.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
    if (colours.length === 0) return fallback;

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;

    for (const value of colours) {
        let hex = value.slice(1);
        if (hex.length === 3) {
            hex = hex
                .split("")
                .map((x) => x + x)
                .join("");
        }
        if (hex.length < 6) continue;
        r += parseInt(hex.slice(0, 2), 16);
        g += parseInt(hex.slice(2, 4), 16);
        b += parseInt(hex.slice(4, 6), 16);
        count++;
    }

    if (!count) return fallback;
    const to = (value: number) =>
        Math.round(value / count)
            .toString(16)
            .padStart(2, "0");
    return `#${to(r)}${to(g)}${to(b)}`;
}

/** Pick readable text for a gradient's average colour. */
export function gradientText(css: string): string {
    const solid = gradientSolid(css, "#191919").slice(1);
    const r = parseInt(solid.slice(0, 2), 16);
    const g = parseInt(solid.slice(2, 4), 16);
    const b = parseInt(solid.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? "#111111" : "#ffffff";
}
