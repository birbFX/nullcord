import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";

import styles from "./Panes.module.scss";
import { Text } from "preact-i18n";

import CollapsibleSection from "../../../components/common/CollapsibleSection";
import AdvancedOptions from "../../../components/settings/appearance/AdvancedOptions";
import AppearanceOptions from "../../../components/settings/appearance/AppearanceOptions";
import ChatOptions from "../../../components/settings/appearance/ChatOptions";
import UiModePicker from "../../../components/settings/appearance/UiModePicker";
import GradientTheme from "../../../components/settings/appearance/GradientTheme";
import ThemeOverrides from "../../../components/settings/appearance/ThemeOverrides";
import ThemeSelection from "../../../components/settings/appearance/ThemeSelection";
import { useClient } from "../../../controllers/client/ClientController";
import { useApplicationState } from "../../../mobx/State";
import { setUiMode } from "../../../lib/uiMode";
import { isNitroFull } from "../../../lib/owner";

export const Appearance = observer(() => {
    const client = useClient();
    const state = useApplicationState();
    const nitro = isNitroFull(client.user);

    const resetTheme = () => {
        const userId = client.user?._id;
        state.settings.theme.reset();
        if (userId) {
            localStorage.removeItem(`nullcord:gradient:${userId}`);
            localStorage.removeItem(`nullcord:gradient-prev:${userId}`);
        }
        setUiMode("combined");
    };

    return (
        <div className={styles.appearance}>
            <ThemeSelection />
            <div
                style={{
                    display: "flex",
                    gap: 8,
                    "align-items": "center",
                    "flex-wrap": "wrap",
                    marginTop: 8,
                }}>
                <button
                    onClick={resetTheme}
                    style={{
                        border: 0,
                        borderRadius: 999,
                        padding: "9px 16px",
                        fontWeight: 700,
                        cursor: "pointer",
                        background: "var(--accent)",
                        color: "var(--accent-contrast)",
                    }}>
                    Reset custom theme
                </button>
                <span style={{ fontSize: 11, color: "var(--secondary-foreground)" }}>
                    Clears overrides, custom CSS and gradient leftovers.
                </span>
            </div>
            <hr />
            <UiModePicker />
            <GradientTheme />
            <hr />
            <AppearanceOptions />
            <hr />
            <ChatOptions />
            <hr />
            <CollapsibleSection
                defaultValue={true}
                id="settings_overrides"
                summary={
                    nitro
                        ? "Custom theme colors (Nitro)"
                        : "Custom theme colors 🔒"
                }>
                {nitro ? (
                    <ThemeOverrides />
                ) : (
                    <div style={{ fontSize: 13, color: "var(--secondary-foreground)" }}>
                        Custom theme overrides are a Nitro feature.{" "}
                        <Link to="/nitro">Get Nitro with Orbs</Link>.
                    </div>
                )}
            </CollapsibleSection>
            <CollapsibleSection
                id="settings_advanced_appearance"
                defaultValue={false}
                summary={<Text id="app.settings.pages.appearance.advanced" />}>
                <AdvancedOptions />
            </CollapsibleSection>
        </div>
    );
});

// <DisplayCompactShim />
