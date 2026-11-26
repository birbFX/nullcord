import styled from "styled-components/macro";

const Wrap = styled.main`
    min-height: 100%;
    padding: 64px 24px;
    box-sizing: border-box;
    color: var(--foreground);
    background: var(--primary-background);

    .card {
        width: min(760px, 100%);
        margin: 0 auto;
        padding: 32px;
        border: 1px solid var(--tertiary-background);
        border-radius: var(--border-radius);
        background: var(--secondary-background);
    }

    h1 {
        margin: 0 0 8px;
        font-size: 28px;
    }

    .subtitle {
        margin: 0 0 26px;
        color: var(--tertiary-foreground);
        line-height: 20px;
    }

    .links {
        display: grid;
        gap: 10px;
    }

    a.link {
        display: block;
        padding: 16px;
        border: 1px solid var(--tertiary-background);
        border-radius: var(--border-radius);
        color: var(--foreground);
        text-decoration: none;
        transition: background 0.15s ease;
    }

    a.link:hover {
        background: var(--tertiary-background);
    }

    .link strong {
        display: block;
        margin-bottom: 3px;
    }

    .link span {
        color: var(--tertiary-foreground);
        font-size: 13px;
    }

    .footer {
        margin-top: 24px;
        color: var(--tertiary-foreground);
        font-size: 12px;
        line-height: 18px;
    }

    .footer a {
        color: var(--accent);
    }
`;

export default function Support() {
    return (
        <Wrap>
            <div className="card">
                <h1>NullCord Support</h1>
                <p className="subtitle">
                    Help with your account, safety, billing, or the client.
                </p>

                <div className="links">
                    <a
                        className="link"
                        href="https://support.canyonlakelabs.com/topics/nullcord"
                        target="_blank"
                        rel="noreferrer">
                        <strong>Help center</strong>
                        <span>
                            Guides, account help, safety information and
                            contact options.
                        </span>
                    </a>

                    <a className="link" href="/terms">
                        <strong>Terms of Service</strong>
                        <span>
                            The rules and policies every NullCord account
                            agrees to.
                        </span>
                    </a>

                    <a
                        className="link"
                        href="mailto:support@example.com">
                        <strong>Email support</strong>
                        <span>support@example.com</span>
                    </a>
                </div>

                <p className="footer">
                    If you are seeing an account standing or strike notice,
                    read the{" "}
                    <a href="/terms">Terms of Service</a> and open the help
                    center above. Include your username and any case reference
                    when contacting support.
                </p>
            </div>
        </Wrap>
    );
}
