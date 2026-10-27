import { useState } from "preact/hooks";

import styles from "./Components.module.scss";

type NullCordOption = {
    label: string;
    value: string;
    description?: string;
    emoji?: string;
    default?: boolean;
};

type NullCordComponent = {
    type: "button" | "select";
    custom_id: string;
    label?: string;
    style?: string;
    emoji?: string;
    disabled?: boolean;
    url?: string;
    placeholder?: string;
    min_values?: number;
    max_values?: number;
    options?: NullCordOption[];
    row?: number;
};

export default function MessageComponents({ message }: { message: any }) {
    const [busy, setBusy] = useState(false);
    const components: NullCordComponent[] = message.components ?? [];
    if (!components.length) return null;

    const rows = new Map<number, NullCordComponent[]>();
    for (const component of components) {
        const row = component.row ?? (component.type === "select" ? 0 : 1);
        const list = rows.get(row) ?? [];
        list.push(component);
        rows.set(row, list);
    }

    async function invoke(component: NullCordComponent, values: string[] = []) {
        if (busy || component.disabled) return;
        setBusy(true);
        try {
            const api = message.client?.api;
            const apiConfig = api?.config ?? {};
            const baseURL = String(apiConfig.baseURL || message.client?.apiURL || "").replace(/\/$/, "");
            const response = await fetch(
                `${baseURL}/channels/${message.channel_id}/messages/${message._id}/interactions`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        ...(apiConfig.headers ?? {}),
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        custom_id: component.custom_id,
                        component_type: component.type,
                        values,
                    }),
                },
            );
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error("NullCord component interaction failed", error);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={styles.components}>
            {[...rows.entries()]
                .sort(([a], [b]) => a - b)
                .map(([row, rowComponents]) => (
                    <div className={styles.row} key={row}>
                        {rowComponents.map((component) =>
                            component.type === "select" ? (
                                <SelectComponent
                                    key={component.custom_id}
                                    component={component}
                                    disabled={busy}
                                    onSelect={(value) => invoke(component, [value])}
                                />
                            ) : (
                                <ButtonComponent
                                    key={component.custom_id}
                                    component={component}
                                    disabled={busy}
                                    onPress={() => invoke(component)}
                                />
                            ),
                        )}
                    </div>
                ))}
        </div>
    );
}

function ButtonComponent({
    component,
    disabled,
    onPress,
}: {
    component: NullCordComponent;
    disabled: boolean;
    onPress: () => void;
}) {
    const classes = [styles.button];
    if (component.style && styles[component.style]) {
        classes.push(styles[component.style]);
    }

    if (component.style === "link" && component.url) {
        return (
            <a
                className={classes.join(" ")}
                href={component.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
            >
                {component.emoji && <span>{component.emoji}</span>}
                {component.label || "Open"}
            </a>
        );
    }

    return (
        <button
            type="button"
            className={classes.join(" ")}
            disabled={disabled || component.disabled}
            onClick={(event) => {
                event.stopPropagation();
                onPress();
            }}
        >
            {component.emoji && <span>{component.emoji}</span>}
            {component.label || "Button"}
        </button>
    );
}

function SelectComponent({
    component,
    disabled,
    onSelect,
}: {
    component: NullCordComponent;
    disabled: boolean;
    onSelect: (value: string) => void;
}) {
    const [selected, setSelected] = useState("");
    const options = component.options ?? [];

    return (
        <details
            className={styles.select}
            onToggle={(event) => {
                if (!(event.currentTarget as HTMLDetailsElement).open) {
                    setSelected("");
                }
            }}
        >
            <summary>
                <span className={selected ? undefined : styles.placeholder}>
                    {selected
                        ? options.find((option) => option.value === selected)?.label
                        : component.placeholder || "Select an option..."}
                </span>
            </summary>
            <div className={styles.menu}>
                {options.map((option) => (
                    <button
                        type="button"
                        className={styles.option}
                        key={option.value}
                        disabled={disabled || component.disabled}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setSelected(option.value);
                            (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                            onSelect(option.value);
                        }}
                    >
                        {option.emoji && (
                            <span className={styles.optionEmoji}>{option.emoji}</span>
                        )}
                        <span className={styles.optionText}>
                            <span className={styles.optionLabel}>{option.label}</span>
                            {option.description && (
                                <span className={styles.optionDescription}>
                                    {option.description}
                                </span>
                            )}
                        </span>
                    </button>
                ))}
            </div>
        </details>
    );
}
