import { useApplicationState } from "../../../mobx/State";
import { Button } from "@revoltchat/ui";

/**
 * Material 3 surface palette adapted from Stoat for Web
 * (https://github.com/stoatchat/for-web, AGPL-3.0).
 *
 * The original client is SolidJS + Material 3; NullCord is Preact, so this
 * ports the colour/token layer rather than importing the component tree.
 */
const FOR_WEB_COLORS = {
    accent: "#d0bcff",
    background: "#141218",
    "primary-background": "#1d1b20",
    "secondary-background": "#211f26",
    "tertiary-background": "#2b2930",
    foreground: "#e6e0e9",
    "secondary-foreground": "#cac4d0",
    "tertiary-foreground": "#938f99",
    "primary-header": "#2b2930",
    "secondary-header": "#36343b",
    block: "#1d1b20",
    "message-box": "#2b2930",
    mention: "#4f378b",
    hover: "rgba(208, 188, 255, 0.08)",
    tooltip: "#36343b",
};

const FOR_WEB_CSS = `/* Material 3 tokens adapted from stoatchat/for-web (AGPL-3.0) */
:root {
  --border-radius: 12px;
  --transitions-fast: .1s ease-in-out;
  --transitions-medium: .2s ease;
  --effects-blur-md: blur(20px);
  --fw-radius-xs: 4px;
  --fw-radius-sm: 8px;
  --fw-radius-md: 12px;
  --fw-radius-lg: 16px;
  --fw-radius-xl: 28px;
}
`;

export default function ForWebTheme() {
    const theme = useApplicationState().settings.theme;

    return (
        <div
            style={{
                padding: 16,
                borderRadius: 14,
                background: "var(--secondary-background)",
                marginBottom: 16,
            }}>
            <h3 style={{ margin: "0 0 4px" }}>Stoat Web UI</h3>
            <p
                style={{
                    margin: "0 0 12px",
                    fontSize: 12,
                    color: "var(--secondary-foreground)",
                }}>
                Material 3 surface colours, spacing and rounded panels adapted
                from the Stoat for Web client (AGPL-3.0).
            </p>
            <Button
                palette="secondary"
                onClick={() =>
                    theme.hydrate({
                        ...(FOR_WEB_COLORS as any),
                        css: FOR_WEB_CSS,
                    })
                }>
                Apply Stoat Web theme
            </Button>
        </div>
    );
}
