import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";

import styles from "./Panes.module.scss";
import { Text } from "preact-i18n";

import CollapsibleSection from "../../../components/common/CollapsibleSection";
import AdvancedOptions from "../../../components/settings/appearance/AdvancedOptions";
import AppearanceOptions from "../../../components/settings/appearance/AppearanceOptions";
import ChatOptions from "../../../components/settings/appearance/ChatOptions";
import GradientTheme from "../../../components/settings/appearance/GradientTheme";
import ThemeOverrides from "../../../components/settings/appearance/ThemeOverrides";
import ThemeSelection from "../../../components/settings/appearance/ThemeSelection";
import { useClient } from "../../../controllers/client/ClientController";
import { isNitro } from "../../../lib/owner";

export const Appearance = observer(() => {
    const client = useClient();
    const nitro = isNitro(client.user);

    return (
        <div className={styles.appearance}>
            <ThemeSelection />
            <hr />
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
