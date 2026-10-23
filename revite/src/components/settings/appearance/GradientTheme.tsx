import { useState } from "preact/hooks";
import { Link } from "react-router-dom";

import { Button } from "@revoltchat/ui";

import { useClient } from "../../../controllers/client/ClientController";
import { useApplicationState } from "../../../mobx/State";
import {
    customGradient,
    gradientText,
    GRADIENT_PRESETS,
} from "../../../lib/gradients";
import { isNitroFull } from "../../../lib/owner";
import { recordQuestEvent } from "../../../lib/quests";

export default function GradientTheme({ onApplied }: { onApplied?: () => void }) {
    const client = useClient();
    const theme = useApplicationState().settings.theme;
    const userId = client.user?._id;
    const nitro = isNitroFull(client.user);

    const selectedKey = `nullcord:gradient:${userId ?? "guest"}`;
    const prevKey = `nullcord:gradient-prev:${userId ?? "guest"}`;
    const surfaceVars = [
        "background",
        "primary-background",
        "primary-header",
        "secondary-background",
        "secondary-header",
        "tertiary-background",
        "block",
        "message-box",
    ];
    const textVars = [
        "foreground",
        "secondary-foreground",
        "tertiary-foreground",
    ];
    // Accent is intentionally excluded: keep the user's existing accent.
    const allVars = [...surfaceVars, ...textVars];

    const [selected, setSelected] = useState(
        () => localStorage.getItem(selectedKey) ?? "",
    );
    const [colourA, setColourA] = useState("#1e3a8a");
    const [colourB, setColourB] = useState("#7c3aed");
    const [angle, setAngle] = useState(135);

    if (!nitro) {
        return (
            <div style={{ fontSize: 13, color: "var(--secondary-foreground)" }}>
                Gradient themes are a Nitro feature.{" "}
                <Link to="/nitro">Get Nitro with Orbs</Link>.
            </div>
        );
    }

    const apply = (css: string) => {
        try {
            if (!localStorage.getItem(prevKey)) {
                localStorage.setItem(
                    prevKey,
                    JSON.stringify(
                        {
                            vars: Object.fromEntries(
                                allVars.map((key) => [
                                    key,
                                    theme.getVariable(key as any),
                                ]),
                            ),
                            css: theme.getCSS() ?? "",
                        },
                    ),
                );
            }

            // Drop custom CSS overrides for the duration of the gradient;
            // otherwise leftover CSS can recolour only part of the client.
            theme.setCSS("");
            const text = gradientText(css);
            for (const key of surfaceVars) {
                theme.setVariable(key as any, css);
            }
            for (const key of textVars) {
                theme.setVariable(key as any, text);
            }
            localStorage.setItem(selectedKey, css);
            setSelected(css);
            recordQuestEvent(userId, "gradient_applied");
            recordQuestEvent(userId, "theme_changed");
            onApplied?.();
        } catch (err) {
            console.error(err);
        }
    };

    const clear = () => {
        try {
            const raw = localStorage.getItem(prevKey);
            if (raw) {
                const prev = JSON.parse(raw);
                const values = prev.vars ?? prev;
                for (const key of allVars) {
                    const value =
                        values[key] ??
                        (key === "background" || key === "primary-background"
                            ? prev.primary
                            : undefined);
                    if (value) theme.setVariable(key as any, value);
                }
                if (typeof prev.css === "string") theme.setCSS(prev.css);
            } else {
                const fallback =
                    theme.getBase() === "light" ? "#ffffff" : "#191919";
                for (const key of surfaceVars) {
                    theme.setVariable(key as any, fallback);
                }
                for (const key of textVars) {
                    theme.setVariable(
                        key as any,
                        theme.getBase() === "light" ? "#111111" : "#ffffff",
                    );
                }
            }
            localStorage.removeItem(prevKey);
            localStorage.removeItem(selectedKey);
            setSelected("");
            recordQuestEvent(userId, "theme_changed");
            onApplied?.();
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div style={{ marginTop: 8 }}>
            <h3 style={{ marginBottom: 4 }}>Nitro gradient themes</h3>
            <p
                style={{
                    marginTop: 0,
                    color: "var(--secondary-foreground)",
                    fontSize: 12,
                }}>
                Pick a preset or build your own gradient. Saved on this
                device.
            </p>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))",
                    gap: 8,
                    margin: "12px 0",
                }}>
                {GRADIENT_PRESETS.map((preset) => (
                    <button
                        key={preset.id}
                        title={preset.name}
                        onClick={() => apply(preset.css)}
                        style={{
                            height: 38,
                            borderRadius: 8,
                            cursor: "pointer",
                            background: preset.css,
                            border:
                                selected === preset.css
                                    ? "2px solid var(--accent)"
                                    : "1px solid var(--tertiary-background)",
                        }}
                    />
                ))}
            </div>

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    padding: 12,
                    borderRadius: 9,
                    background: "var(--secondary-background)",
                }}>
                <label style={{ fontSize: 12 }}>
                    From{" "}
                    <input
                        type="color"
                        value={colourA}
                        onChange={(e) => setColourA(e.currentTarget.value)}
                        style={{ verticalAlign: "middle" }}
                    />
                </label>
                <label style={{ fontSize: 12 }}>
                    To{" "}
                    <input
                        type="color"
                        value={colourB}
                        onChange={(e) => setColourB(e.currentTarget.value)}
                        style={{ verticalAlign: "middle" }}
                    />
                </label>
                <label style={{ fontSize: 12 }}>
                    Angle {angle}°
                    <input
                        type="range"
                        min={0}
                        max={360}
                        value={angle}
                        onInput={(e) =>
                            setAngle(Number(e.currentTarget.value))
                        }
                        style={{ verticalAlign: "middle", marginLeft: 6 }}
                    />
                </label>
                <div
                    style={{
                        width: 90,
                        height: 34,
                        borderRadius: 8,
                        background: customGradient(colourA, colourB, angle),
                    }}
                />
                <Button
                    palette="primary"
                    onClick={() =>
                        apply(customGradient(colourA, colourB, angle))
                    }>
                    Apply gradient
                </Button>
                {selected && (
                    <Button palette="secondary" onClick={clear}>
                        Remove gradient
                    </Button>
                )}
            </div>
        </div>
    );
}
