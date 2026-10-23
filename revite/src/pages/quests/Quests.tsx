import { Gift } from "@styled-icons/boxicons-solid";
import { useEffect, useState } from "preact/hooks";
import { Link, useHistory } from "react-router-dom";
import styled from "styled-components/macro";

import { Button, Header } from "@revoltchat/ui";

import { useClient } from "../../controllers/client/ClientController";
import {
    ORBS_EVENT,
    completeQuest,
    dailyQuests,
    getOrbs,
    isAdminUser,
    isQuestDone,
} from "../../lib/orbs";
import {
    QUESTS_EVENT,
    getQuestProgress,
    recordQuestEvent,
} from "../../lib/quests";
import { isTouchscreenDevice } from "../../lib/isTouchscreenDevice";
import { SOURCE_URL } from "../../lib/source";

const Container = styled.div`
    flex-grow: 1;
    overflow-y: auto;
    padding: 32px;
    background:
        radial-gradient(800px 380px at 50% -10%, rgba(247, 201, 72, 0.16), transparent 65%),
        var(--background);

    ${isTouchscreenDevice &&
    `
        padding: 72px 18px 90px;
    `}
`;

const Inner = styled.div`
    max-width: 920px;
    margin: 0 auto;
`;

const Hero = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
    margin-bottom: 24px;

    h1 {
        margin: 0 0 4px;
        font-size: 30px;
    }

    p {
        margin: 0;
        color: var(--secondary-foreground);
    }
`;

const Balance = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 12px;
    background: rgba(247, 201, 72, 0.1);
    border: 1px solid rgba(247, 201, 72, 0.3);

    .value {
        font-size: 24px;
        font-weight: 800;
        color: #f7c948;
    }

    .label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--secondary-foreground);
    }
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
`;

const QuestCard = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px;
    border-radius: 14px;
    background: var(--secondary-background);
    border: 1px solid var(--tertiary-background);
    transition: opacity 0.15s ease, filter 0.15s ease;

    &[data-locked="true"] {
        opacity: 0.62;
        filter: grayscale(0.55);
    }

    h3 {
        margin: 0;
        font-size: 16px;
    }

    p {
        margin: 0;
        color: var(--secondary-foreground);
        font-size: 13px;
        line-height: 1.5;
        flex-grow: 1;
    }

    .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .reward {
        font-size: 12px;
        font-weight: 800;
        color: #f7c948;
    }

    .progress {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--secondary-foreground);
    }

    .verified {
        color: #5dd47a;
        font-weight: 700;
    }

    a {
        color: #8b95ff;
        font-size: 12px;
    }
`;

const Footer = styled.p`
    margin-top: 28px;
    font-size: 11px;
    color: var(--secondary-foreground);

    a {
        color: inherit;
    }
`;

export default function Quests() {
    const client = useClient();
    const history = useHistory();
    const userId = client.user?._id;
    const admin = isAdminUser(client.user);
    const [orbs, setOrbs] = useState(() => getOrbs(userId));
    const [, setTick] = useState(0);

    useEffect(() => {
        const update = () => {
            setOrbs(getOrbs(userId));
            setTick((x) => x + 1);
        };
        window.addEventListener(ORBS_EVENT, update);
        window.addEventListener(QUESTS_EVENT, update);
        return () => {
            window.removeEventListener(ORBS_EVENT, update);
            window.removeEventListener(QUESTS_EVENT, update);
        };
    }, [userId]);

    useEffect(() => {
        if (userId) recordQuestEvent(userId, "visit_quests");
    }, [userId]);

    const quests = dailyQuests(userId);

    const openQuietServer = () => {
        if (!userId) return;
        let spoken: string[] = [];
        try {
            spoken = JSON.parse(
                localStorage.getItem(`nullcord:spoken-servers:${userId}`) ??
                    "[]",
            );
        } catch {
            spoken = [];
        }

        for (const server of client.servers.values()) {
            if (spoken.includes(server._id)) continue;
            const channel = server.channel_ids
                .map((id) => client.channels.get(id))
                .find(
                    (channel) =>
                        channel?.channel_type === "TextChannel" &&
                        channel.havePermission?.("SendMessage"),
                );
            if (channel) {
                history.push(`/server/${server._id}/channel/${channel._id}`);
                return;
            }
        }

        history.push("/");
    };

    return (
        <Container>
            {isTouchscreenDevice && (
                <Header palette="primary" withTransparency>
                    <Gift size={24} />
                    Quests
                </Header>
            )}
            <Inner>
                <Hero>
                    <div>
                        <h1>Quests</h1>
                        <p>
                            Six daily quests. Progress is verified from real
                            client activity, so locked quests cannot be
                            claimed.
                        </p>
                    </div>
                    <Balance>
                        <span className="label">Orbs</span>
                        <span className="value">
                            {admin ? "∞" : orbs.toLocaleString()}
                        </span>
                        {!admin && (
                            <Link to="/nitro" className="label">
                                Spend →
                            </Link>
                        )}
                    </Balance>
                </Hero>

                <Grid>
                    {quests.map((quest) => {
                        const done = isQuestDone(userId, quest);
                        const progress = getQuestProgress(userId, quest);
                        const locked = !progress.verified && !done;

                        return (
                            <QuestCard
                                key={quest.id}
                                data-locked={locked ? "true" : "false"}>
                                <h3>{quest.title}</h3>
                                <p>{quest.description}</p>
                                <div className="row">
                                    <span className="reward">
                                        +{quest.reward} Orbs
                                    </span>
                                    {quest.href && (
                                        <a
                                            href={quest.href}
                                            target={
                                                quest.href.startsWith("http")
                                                    ? "_blank"
                                                    : undefined
                                            }
                                            rel="noreferrer">
                                            {quest.hrefLabel ?? "Open"}
                                        </a>
                                    )}
                                </div>
                                <div className="progress">
                                    {done || progress.verified ? (
                                        <span className="verified">
                                            ✓ Verified
                                        </span>
                                    ) : (
                                        <span>Not completed yet</span>
                                    )}
                                    <span>
                                        {progress.current}/{progress.target}
                                    </span>
                                </div>
                                {quest.action === "quiet_server" &&
                                    !progress.verified &&
                                    !done && (
                                        <Button
                                            palette="secondary"
                                            onClick={openQuietServer}>
                                            Open a quiet server
                                        </Button>
                                    )}
                                <Button
                                    palette={done ? "secondary" : "primary"}
                                    disabled={done || !progress.verified}
                                    onClick={() => {
                                        if (completeQuest(userId, quest)) {
                                            setTick((x) => x + 1);
                                        }
                                    }}>
                                    {done
                                        ? "Claimed today"
                                        : progress.verified
                                          ? "Claim"
                                          : "Verify first"}
                                </Button>
                            </QuestCard>
                        );
                    })}
                </Grid>

                <Footer>
                    Verification is automatic: messages, images, reactions,
                    invites, joins, voice presence, profile changes, themes,
                    server tags, boosts and plugin changes are tracked
                    locally. Quests rotate by date. Orbs are stored on this
                    device; admins have unlimited Orbs.{" "}
                    <Link to="/nitro">See what Orbs can buy →</Link> ·{" "}
                    <a href={SOURCE_URL} target="_blank" rel="noreferrer">
                        Source code
                    </a>
                </Footer>
            </Inner>
        </Container>
    );
}
