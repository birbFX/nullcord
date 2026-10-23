import { Button } from "@revoltchat/ui";

import { setUiMode, useUiMode, type UiMode } from "../../../lib/uiMode";
import { writeHandoff } from "../../../lib/handoff";
import { state } from "../../../mobx/State";

const MODES: { id: UiMode; name: string; description: string }[] = [
    {
        id: "regular",
        name: "Regular",
        description: "The original NullCord layout and spacing.",
    },
    {
        id: "stoat",
        name: "NullCord (full UI)",
        description:
            "The full Stoat for Web client, rebranded as NullCord.",
    },
    {
        id: "combined",
        name: "Combined",
        description:
            "NullCord colours with the Stoat layout, rail, focus rings and radius.",
    },
];

export default function UiModePicker() {
    const mode = useUiMode();

    return (
        <div style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 4 }}>Interface</h3>
            <p
                style={{
                    marginTop: 0,
                    marginBottom: 12,
                    fontSize: 12,
                    color: "var(--secondary-foreground)",
                }}>
                Choose the original NullCord UI, the Stoat for Web UI, or the
                combined build.
            </p>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 10,
                }}>
                {MODES.map((entry) => (
                    <div
                        key={entry.id}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            padding: 14,
                            borderRadius: 12,
                            border:
                                mode === entry.id
                                    ? "1px solid var(--accent)"
                                    : "1px solid var(--tertiary-background)",
                            background:
                                mode === entry.id
                                    ? "color-mix(in srgb, var(--accent) 12%, var(--secondary-background))"
                                    : "var(--secondary-background)",
                        }}>
                        <div style={{ fontWeight: 800 }}>{entry.name}</div>
                        <div
                            style={{
                                flex: 1,
                                fontSize: 12,
                                lineHeight: 1.45,
                                color: "var(--secondary-foreground)",
                            }}>
                            {entry.description}
                        </div>
                        <Button
                            palette={
                                mode === entry.id ? "primary" : "secondary"
                            }
                            onClick={() => {
                                if (entry.id === "stoat") {
                                    const account =
                                        state.auth.getAccounts()[0]?.session;
                                    if (account) {
                                        writeHandoff(account, "stoat");
                                    }
                                    window.location.href = "/stoat/";
                                    return;
                                }
                                setUiMode(entry.id);
                            }}>
                            {mode === entry.id
                                ? "Active"
                                : entry.id === "stoat"
                                  ? "Open"
                                  : "Use"}
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}
