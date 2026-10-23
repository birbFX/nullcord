import { Star } from "@styled-icons/boxicons-solid";
import { useState } from "preact/hooks";
import { Link } from "react-router-dom";
import styled from "styled-components/macro";

import { Header } from "@revoltchat/ui";

import { isNitro } from "../../lib/owner";
import { useClient } from "../../controllers/client/ClientController";
import {
    getOrbs,
    isAdminUser,
    spendOrbs,
} from "../../lib/orbs";
import { isTouchscreenDevice } from "../../lib/isTouchscreenDevice";
import { SOURCE_URL } from "../../lib/source";

const Container = styled.div`
    flex-grow: 1;
    overflow-y: auto;
    padding: 32px;
    background:
        radial-gradient(900px 400px at 50% -10%, rgba(88, 101, 242, 0.25), transparent 65%),
        var(--background);

    ${isTouchscreenDevice &&
    `
        padding: 72px 18px 90px;
    `}
`;

const Inner = styled.div`
    max-width: 980px;
    margin: 0 auto;
`;

const Hero = styled.div`
    text-align: center;
    margin: 18px 0 32px;

    .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(247, 201, 72, 0.12);
        color: #f7c948;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
    }

    h1 {
        margin: 12px 0 6px;
        font-size: clamp(28px, 5vw, 40px);
        letter-spacing: -0.02em;
    }

    p {
        margin: 0;
        color: var(--secondary-foreground);
    }
`;

const Plans = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 18px;
`;

const Plan = styled.div<{ $featured?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 24px;
    border-radius: 16px;
    background: var(--secondary-background);
    border: 1px solid
        ${(p) => (p.$featured ? "#5865f2" : "var(--tertiary-background)")};
    box-shadow: ${(p) =>
        p.$featured ? "0 0 0 1px rgba(88,101,242,.35), 0 16px 40px rgba(0,0,0,.15)" : "none"};

    h2 {
        margin: 0;
        font-size: 20px;
    }

    .price {
        font-size: 26px;
        font-weight: 800;
    }

    .price small {
        font-size: 12px;
        font-weight: 500;
        color: var(--secondary-foreground);
    }

    ul {
        margin: 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 7px;
        font-size: 13px;
        line-height: 1.45;
        color: var(--primary-foreground);
        flex-grow: 1;
    }

    button {
        border: none;
        border-radius: 9px;
        padding: 11px 14px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        background: ${(p) => (p.$featured ? "#5865f2" : "var(--tertiary-background)")};
        color: ${(p) => (p.$featured ? "white" : "var(--foreground)")};

        &:hover {
            filter: brightness(1.08);
        }

        &:disabled {
            opacity: 0.6;
            cursor: default;
            filter: none;
        }
    }

    .note {
        font-size: 11px;
        color: var(--secondary-foreground);
        text-align: center;
        min-height: 14px;
    }
`;

const Perks = styled.div`
    margin-top: 34px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 14px;

    div {
        padding: 16px;
        border-radius: 12px;
        background: var(--secondary-background);
        font-size: 13px;
        line-height: 1.5;
    }

    strong {
        display: block;
        margin-bottom: 4px;
    }
`;

const Footer = styled.p`
    margin-top: 30px;
    text-align: center;
    font-size: 11px;
    color: var(--secondary-foreground);

    a {
        color: inherit;
    }
`;

export default function Nitro() {
    const client = useClient();
    const userId = client.user?._id;
    const admin = isAdminUser(client.user);
    const [active, setActive] = useState(() => isNitro(client.user));
    const [orbs, setOrbs] = useState(() => getOrbs(userId));
    const [note, setNote] = useState<{ plan: string; text: string }>();

    const redeem = (plan: string, cost: number) => {
        if (active || !userId) return;
        if (!admin && !spendOrbs(userId, cost)) {
            setNote({
                plan,
                text: `Not enough Orbs — you have ${orbs.toLocaleString()}. Earn more in Quests.`,
            });
            return;
        }
        localStorage.setItem(`nullcord:nitro:${userId}`, "1");
        setActive(true);
        setOrbs(getOrbs(userId));
        setNote({ plan, text: `${plan} unlocked with Orbs.` });
    };

    return (
        <Container>
            {isTouchscreenDevice && (
                <Header palette="primary" withTransparency>
                    <Star size={24} />
                    Nitro
                </Header>
            )}
            <Inner>
                <Hero>
                    <span className="badge">
                        <Star size={14} /> {active ? "NITRO ACTIVE" : "NITRO"}
                    </span>
                    <h1>Make NullCord yours.</h1>
                    <p>
                        Bigger uploads, better profiles, more expression — pay
                        with Orbs earned from quests.
                    </p>
                    <p style={{ marginTop: 8, fontWeight: 700 }}>
                        {admin ? "∞" : orbs.toLocaleString()} Orbs ·{" "}
                        <Link to="/quests">earn more →</Link>
                        {admin ? " (admin: unlimited)" : ""}
                    </p>
                </Hero>

                <Plans>
                    <Plan>
                        <h2>Nitro Basic</h2>
                        <div className="price">
                            300 Orbs <small>/ month · or 2,500 / year</small>
                        </div>
                        <ul>
                            <li>Custom and animated emoji &amp; stickers anywhere</li>
                            <li>Unlimited super reactions</li>
                            <li>50 MB file uploads</li>
                            <li>Custom video backgrounds</li>
                            <li>Nitro Basic profile badge</li>
                            <li>Custom app icons</li>
                        </ul>
                        <button
                            disabled={active}
                            onClick={() => redeem("Nitro Basic", 300)}>
                            {active ? "Active" : "Redeem · 300 Orbs"}
                        </button>
                        <div className="note">
                            {note?.plan === "Nitro Basic" ? note.text : ""}
                        </div>
                    </Plan>

                    <Plan $featured>
                        <h2>Nitro</h2>
                        <div className="price">
                            900 Orbs <small>/ month · or 8,000 / year</small>
                        </div>
                        <ul>
                            <li>Everything in Basic, plus:</li>
                            <li>1 GB uploads and 4,000-character messages</li>
                            <li>4K / 60fps streaming</li>
                            <li>2 Server Boosts + 30% off extra boosts</li>
                            <li>Animated avatar, banner and profile themes</li>
                            <li>Per-server profiles and display name styles</li>
                            <li>Custom soundboard sounds anywhere</li>
                            <li>Join up to 200 servers</li>
                            <li>3 Nitro friend passes</li>
                            <li>Orbs multiplier, monthly Orbs and early access</li>
                            <li>Xbox Game Pass Starter + hardware discounts</li>
                        </ul>
                        <button
                            disabled={active}
                            onClick={() => redeem("Nitro", 900)}>
                            {active ? "Active" : "Redeem · 900 Orbs"}
                        </button>
                        <div className="note">
                            {note?.plan === "Nitro" ? note.text : ""}
                        </div>
                    </Plan>
                </Plans>

                <Perks>
                    <div>
                        <strong>Show off your style</strong>
                        Animated avatars and banners, profile themes, per-server
                        profiles, entrance sounds and display name styles.
                    </div>
                    <div>
                        <strong>Make this place your space</strong>
                        Custom emoji and stickers anywhere, 300+ Nitro stickers,
                        custom app icons and soundboard sounds, 20+ app color
                        themes.
                    </div>
                    <div>
                        <strong>No limits, all fun</strong>
                        Bigger files, super reactions, HD streaming, boosts,
                        friend passes, member pricing and longer messages.
                    </div>
                </Perks>

                <Footer>
                    Nitro is paid with Orbs, not money. Orbs and unlocks are
                    stored on this device; admins get Nitro automatically.{" "}
                    <a href={SOURCE_URL} target="_blank" rel="noreferrer">
                        Source code
                    </a>
                </Footer>
            </Inner>
        </Container>
    );
}
