import { Compass, Palette } from "@styled-icons/boxicons-regular";
import { Link, useLocation } from "react-router-dom";
import styled from "styled-components/macro";

import { Header } from "@revoltchat/ui";

import { isTouchscreenDevice } from "../../lib/isTouchscreenDevice";
import { SOURCE_URL } from "../../lib/source";
import { modalController } from "../../controllers/modals/ModalController";

const Container = styled.div`
    flex-grow: 1;
    overflow-y: auto;
    padding: 32px;
    background: var(--background);

    ${isTouchscreenDevice &&
    `
        padding: 72px 18px 90px;
    `}
`;

const Inner = styled.div`
    max-width: 960px;
    margin: 0 auto;
`;

const Hero = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;

    .icon {
        width: 56px;
        height: 56px;
        display: grid;
        place-items: center;
        border-radius: 16px;
        color: white;
        background: linear-gradient(135deg, #5865f2, #8b5cf6);
    }

    h1 {
        margin: 0;
        font-size: 30px;
        line-height: 1.1;
    }

    p {
        margin: 4px 0 0;
        color: var(--secondary-foreground);
    }
`;

const Section = styled.h2`
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--secondary-foreground);
    margin: 28px 0 12px;
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
`;

const Card = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px;
    border-radius: 14px;
    background: var(--secondary-background);
    border: 1px solid transparent;
    transition: border-color 0.15s ease;

    &:hover {
        border-color: var(--tertiary-foreground);
    }

    h3 {
        margin: 0;
        font-size: 18px;
    }

    p {
        margin: 0;
        color: var(--secondary-foreground);
        font-size: 13px;
        line-height: 1.5;
        flex-grow: 1;
    }

    .actions {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    a.button,
    button.button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 14px;
        border: 0;
        border-radius: 8px;
        background: #5865f2;
        color: white;
        font-family: inherit;
        font-weight: 600;
        font-size: 13px;
        text-decoration: none;
        cursor: pointer;
    }

    a.button.secondary,
    button.button.secondary {
        background: var(--tertiary-background);
        color: var(--foreground);
    }

    a {
        color: inherit;
    }

    .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        background: rgba(88, 101, 242, 0.15);
        color: #8b95ff;
        width: fit-content;
    }

    .pill {
        font-size: 11px;
        color: var(--secondary-foreground);
    }
`;

const ThemesGrid = styled(Grid)`
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
`;

const Preview = styled.div<{ $bg: string; $surface: string; $text: string }>`
    height: 96px;
    border-radius: 10px;
    background: ${(p) => p.$bg};
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;

    span {
        display: block;
        height: 8px;
        border-radius: 4px;
        background: ${(p) => p.$surface};
    }

    span:nth-child(2) {
        width: 70%;
        background: ${(p) => p.$text};
        opacity: 0.7;
    }

    span:nth-child(3) {
        width: 45%;
        background: ${(p) => p.$text};
        opacity: 0.35;
    }
`;

const Footer = styled.div`
    margin-top: 36px;
    font-size: 11px;
    color: var(--secondary-foreground);

    a {
        color: inherit;
    }
`;

const INVITE = import.meta.env.VITE_DISCOVER_INVITE ?? "";

function Themes() {
    return (
        <Inner>
            <Hero>
                <div className="icon">
                    <Palette size={30} />
                </div>
                <div>
                    <h1>Themes</h1>
                    <p>Make NullCord look the way you want.</p>
                </div>
            </Hero>

            <ThemesGrid>
                <Card>
                    <h3>Light</h3>
                    <p>The classic bright look.</p>
                    <Preview $bg="#f7f7fa" $surface="#e6e7ee" $text="#1c1d22">
                        <span />
                        <span />
                        <span />
                    </Preview>
                    <div className="actions">
                        <Link className="button" to="/settings/appearance">
                            Open appearance
                        </Link>
                    </div>
                </Card>
                <Card>
                    <h3>Dark</h3>
                    <p>Soft dark greys, easy on the eyes.</p>
                    <Preview $bg="#161616" $surface="#2a2a2e" $text="#f2f3f5">
                        <span />
                        <span />
                        <span />
                    </Preview>
                    <div className="actions">
                        <Link className="button" to="/settings/appearance">
                            Open appearance
                        </Link>
                    </div>
                </Card>
                <Card>
                    <h3>AMOLED</h3>
                    <p>True black for OLED screens.</p>
                    <Preview $bg="#000000" $surface="#101014" $text="#f2f3f5">
                        <span />
                        <span />
                        <span />
                    </Preview>
                    <div className="actions">
                        <Link className="button" to="/settings/appearance">
                            Open appearance
                        </Link>
                    </div>
                </Card>
            </ThemesGrid>

            <Footer>
                Manage theme variables in Settings → Appearance.{" "}
                <Link to="/discover">Back to Discover</Link>
            </Footer>
        </Inner>
    );
}

export default function Discover() {
    const { pathname } = useLocation();

    if (pathname.replace(/\/+$/, "") === "/discover/themes") {
        return (
            <Container>
                {isTouchscreenDevice && (
                    <Header palette="primary" withTransparency>
                        <Compass size={27} />
                        Discover
                    </Header>
                )}
                <Themes />
            </Container>
        );
    }

    return (
        <Container>
            {isTouchscreenDevice && (
                <Header palette="primary" withTransparency>
                    <Compass size={27} />
                    Discover
                </Header>
            )}
            <Inner>
                <Hero>
                    <div className="icon">
                        <Compass size={30} />
                    </div>
                    <div>
                        <h1>Discover</h1>
                        <p>Find your place on NullCord.</p>
                    </div>
                </Hero>

                <Section>Official</Section>
                <Grid>
                    <Card>
                        <h3>Canyon Lake Labs Official Server</h3>
                        <span className="badge">OFFICIAL</span>
                        <p>
                            The home of NullCord. Announcements, support,
                            development updates and the community that started
                            it all.
                        </p>
                        <div className="actions">
                            {INVITE ? (
                                <a className="button" href={`/invite/${INVITE}`}>
                                    Join server
                                </a>
                            ) : (
                                <span className="pill">
                                    Invite code not configured
                                </span>
                            )}
                        </div>
                    </Card>
                </Grid>

                <Section>Explore</Section>
                <Grid>
                    <Card>
                        <h3>Themes</h3>
                        <p>
                            Browse the built-in looks and make NullCord your
                            own.
                        </p>
                        <div className="actions">
                            <Link className="button secondary" to="/discover/themes">
                                Open themes
                            </Link>
                        </div>
                    </Card>
                    <Card>
                        <h3>Create a server</h3>
                        <p>
                            Start your own community with channels, roles and
                            emoji.
                        </p>
                        <div className="actions">
                            <button
                                className="button secondary"
                                onClick={() =>
                                    modalController.push({
                                        type: "create_server",
                                    })
                                }>
                                Add a server
                            </button>
                        </div>
                    </Card>
                </Grid>

                <Footer>
                    NullCord Discover ·{" "}
                    <a href={SOURCE_URL} target="_blank" rel="noreferrer">
                        Source code
                    </a>
                </Footer>
            </Inner>
        </Container>
    );
}
