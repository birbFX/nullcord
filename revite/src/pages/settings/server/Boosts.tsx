import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import { Server } from "revolt.js";

import styles from "./Panes.module.scss";

import { Button } from "@revoltchat/ui";

import { useClient } from "../../../controllers/client/ClientController";
import {
    addBoost,
    boostCapacity,
    boostLevel,
    serverHasInfiniteBoosts,
    removeBoost,
    useServerExtras,
} from "../../../lib/serverExtras";

interface Props {
    server: Server;
}

const LEVELS = [
    { level: 1, at: 2, perks: "Better upload quality + server banner" },
    { level: 2, at: 7, perks: "Higher upload limit + custom invite splash" },
    { level: 3, at: 14, perks: "Max uploads, 4K streaming, vanity URL" },
];

export const Boosts = observer(({ server }: Props) => {
    const client = useClient();
    const user = client.user;
    const extras = useServerExtras(server._id);

    const boosts = Object.values(extras.boosts ?? {}).reduce((a, b) => a + b, 0);
    const infinite = serverHasInfiniteBoosts(server._id);
    const level = infinite ? 3 : boostLevel(boosts);
    const capacity = boostCapacity(user);
    const myBoosts = user?._id ? extras.boosts?.[user._id] ?? 0 : 0;
    const next = LEVELS.find((entry) => entry.level === level + 1);

    return (
        <div className={styles.overview}>
            <h3>Boost Server</h3>
            <p style={{ marginTop: -6, color: "var(--secondary-foreground)" }}>
                Boosts unlock perks for everyone in {server.name}. Nitro
                includes 2 boosts. Canyon Lake Labs has permanent infinite
                boosts; every other server needs real boosts.
            </p>

            <div
                style={{
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                    margin: "16px 0",
                }}>
                <div
                    style={{
                        flex: 1,
                        minWidth: 160,
                        padding: 16,
                        borderRadius: 8,
                        background: "var(--secondary-background)",
                    }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Boosts</div>
                    <div style={{ fontSize: 28, fontWeight: 800 }}>
                        {infinite ? "∞" : boosts}
                    </div>
                </div>
                <div
                    style={{
                        flex: 1,
                        minWidth: 160,
                        padding: 16,
                        borderRadius: 8,
                        background: "var(--secondary-background)",
                    }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Level</div>
                    <div style={{ fontSize: 28, fontWeight: 800 }}>{level}</div>
                </div>
                <div
                    style={{
                        flex: 1,
                        minWidth: 160,
                        padding: 16,
                        borderRadius: 8,
                        background: "var(--secondary-background)",
                    }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Your boosts</div>
                    <div style={{ fontSize: 28, fontWeight: 800 }}>
                        {infinite
                            ? "∞/∞"
                            : `${myBoosts}/${capacity}`}
                    </div>
                </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {infinite ? (
                    <Button palette="secondary" disabled>
                        Unlimited boosts active
                    </Button>
                ) : capacity > 0 ? (
                    <Button
                        palette="primary"
                        disabled={boosts >= 14}
                        onClick={() => addBoost(server._id, user)}>
                        Boost server
                    </Button>
                ) : (
                    <Link to="/nitro">
                        <Button palette="secondary">
                            Nitro required — get Nitro
                        </Button>
                    </Link>
                )}
                {myBoosts > 0 && (
                    <Button
                        palette="secondary"
                        onClick={() => removeBoost(server._id, user?._id)}>
                        Remove my boost
                    </Button>
                )}
            </div>

            {next && (
                <p style={{ color: "var(--secondary-foreground)" }}>
                    {infinite
                        ? "You already have the highest level."
                        : `${Math.max(0, next.at - boosts)} more boost${
                              next.at - boosts === 1 ? "" : "s"
                          } to reach Level ${next.level}.`}
                </p>
            )}

            <hr />
            <h3>Perks</h3>
            {LEVELS.map((entry) => (
                <div
                    key={entry.level}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        marginBottom: 8,
                        borderRadius: 8,
                        background:
                            level >= entry.level
                                ? "rgba(59,130,246,0.14)"
                                : "var(--secondary-background)",
                    }}>
                    <b style={{ minWidth: 64 }}>Level {entry.level}</b>
                    <span style={{ flex: 1 }}>{entry.perks}</span>
                    <span style={{ fontSize: 12, opacity: 0.65 }}>
                        {entry.at} boosts
                    </span>
                </div>
            ))}
        </div>
    );
});
