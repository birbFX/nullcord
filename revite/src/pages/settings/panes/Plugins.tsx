import { observer } from "mobx-react-lite";

import styles from "./Panes.module.scss";

import { Button, Checkbox } from "@revoltchat/ui";

import { useApplicationState } from "../../../mobx/State";
import { useClient } from "../../../controllers/client/ClientController";
import {
    BUILTIN_PLUGINS,
    isPluginEnabled,
    setPluginEnabled,
    usePluginStates,
} from "../../../lib/plugins";

interface Plugin {
    namespace: string;
    id: string;
    version: string;
    enabled: boolean | undefined;
}

export const PluginsPage = observer(() => {
    const client = useClient();
    const states = usePluginStates();
    const plugins = useApplicationState().plugins;

    return (
        <div className={styles.plugins}>
            <h3>Plugins</h3>
            <p style={{ color: "var(--secondary-foreground)", fontSize: 13 }}>
                Built-in NullCord plugins. Changes apply immediately and are
                saved on this device.
            </p>

            <div style={{ marginTop: 14 }}>
                {BUILTIN_PLUGINS.map((plugin) => {
                    const enabled =
                        states[plugin.id] ??
                        isPluginEnabled(plugin.id);
                    return (
                        <div
                            key={plugin.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "14px 16px",
                                marginBottom: 8,
                                borderRadius: 9,
                                background: "var(--secondary-background)",
                            }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700 }}>
                                    {plugin.name}
                                    <span
                                        style={{
                                            marginLeft: 8,
                                            fontSize: 10,
                                            padding: "2px 6px",
                                            borderRadius: 999,
                                            background: "var(--tertiary-background)",
                                            color: "var(--secondary-foreground)",
                                        }}>
                                        BUILT-IN
                                    </span>
                                </div>
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: "var(--secondary-foreground)",
                                        marginTop: 2,
                                    }}>
                                    {plugin.description}
                                </div>
                            </div>
                            <Button
                                palette={enabled ? "primary" : "secondary"}
                                onClick={() =>
                                    setPluginEnabled(
                                        plugin.id,
                                        !enabled,
                                        client.user?._id,
                                    )
                                }>
                                {enabled ? "Enabled" : "Disabled"}
                            </Button>
                        </div>
                    );
                })}
            </div>

            <h3 style={{ marginTop: 26 }}>External Plugins</h3>
            {plugins.list().map((plugin: Plugin) => (
                <div
                    key={`${plugin.namespace}/${plugin.id}`}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "14px 16px",
                        marginBottom: 8,
                        borderRadius: 9,
                        background: "var(--secondary-background)",
                    }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>
                            {plugin.namespace} / {plugin.id}
                        </div>
                        <div
                            style={{
                                fontSize: 11,
                                color: "var(--secondary-foreground)",
                            }}>
                            v{plugin.version}
                        </div>
                    </div>
                    <Checkbox
                        value={!!plugin.enabled}
                        onChange={() =>
                            !plugin.enabled
                                ? plugins.load(plugin.namespace, plugin.id)
                                : plugins.unload(plugin.namespace, plugin.id)
                        }
                    />
                    <Button
                        palette="error"
                        onClick={() =>
                            plugins.remove(plugin.namespace, plugin.id)
                        }>
                        Remove
                    </Button>
                </div>
            ))}
            {plugins.list().length === 0 && (
                <div className={styles.empty}>
                    No external plugins installed. Built-in plugins above are
                    always available.
                </div>
            )}
        </div>
    );
});
