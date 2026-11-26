import styled from "styled-components/macro";

import { useEffect, useState } from "preact/hooks";

import type { BanInfo } from "../../controllers/client/jsx/error";

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 9999;
    overflow-y: auto;
    background: #313338;
    color: #f2f3f5;
    font-family:
        var(--font-primary),
        "gg sans",
        "Noto Sans",
        "Helvetica Neue",
        Helvetica,
        Arial,
        sans-serif;
    -webkit-font-smoothing: antialiased;
`;

const TopBar = styled.div`
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 40px;
    padding: 8px 20px;
    box-sizing: border-box;
    background: #a12828;
    color: #fff;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    line-height: 18px;

    a.learn {
        flex-shrink: 0;
        padding: 4px 8px;
        border: 1px solid rgba(255, 255, 255, 0.5);
        border-radius: 4px;
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        text-decoration: none;
        transition:
            background 0.15s ease,
            border-color 0.15s ease;
    }

    a.learn:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: #fff;
    }

    @media (max-width: 640px) {
        align-items: flex-start;
        flex-direction: column;
        padding: 10px 16px;
    }
`;

const Content = styled.main`
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    padding: 100px 24px 64px;
    box-sizing: border-box;

    @media (max-width: 640px) {
        padding: 40px 16px 56px;
    }
`;

const Header = styled.section`
    display: flex;
    align-items: center;
    gap: 22px;
    margin-bottom: 30px;

    .avatar {
        flex: 0 0 auto;
        width: 110px;
        height: 110px;
        display: grid;
        place-items: center;
        overflow: hidden;
        border-radius: 50%;
        background: #2b2d31;
    }

    .avatar img {
        width: 74px;
        height: 74px;
        object-fit: contain;
        opacity: 0.32;
        filter: grayscale(1) brightness(2);
        user-select: none;
    }

    h1 {
        margin: 0 0 7px;
        font-size: 24px;
        font-weight: 700;
        line-height: 30px;
        color: #f2f3f5;
    }

    p {
        margin: 0;
        max-width: 620px;
        color: #b5bac1;
        font-size: 16px;
        line-height: 21px;
    }

    @media (max-width: 640px) {
        align-items: flex-start;
        gap: 14px;

        .avatar {
            width: 68px;
            height: 68px;
        }

        .avatar img {
            width: 46px;
            height: 46px;
        }

        h1 {
            font-size: 20px;
            line-height: 26px;
        }

        p {
            font-size: 14px;
            line-height: 19px;
        }
    }
`;

const Progress = styled.section`
    position: relative;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    margin: 30px 0 24px;

    .line {
        position: absolute;
        top: 6px;
        left: 10%;
        right: 10%;
        height: 2px;
        background: #4e5058;
    }

    .step {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        min-width: 0;
    }

    .dot {
        width: 14px;
        height: 14px;
        display: grid;
        place-items: center;
        box-sizing: border-box;
        border: 2px solid #4e5058;
        border-radius: 50%;
        background: #4e5058;
    }

    .step.active .dot {
        border-color: #dbdee1;
        background: #dbdee1;
    }

    .step.final .dot {
        width: 28px;
        height: 28px;
        margin-top: -7px;
        border-color: #dbdee1;
        background: #313338;
        color: #dbdee1;
    }

    .step.active.final .dot {
        background: #313338;
    }

    .label {
        max-width: 100%;
        color: #b5bac1;
        font-size: 14px;
        line-height: 18px;
        text-align: center;
        white-space: nowrap;
    }

    .step.active .label {
        color: #dbdee1;
        font-weight: 600;
    }

    @media (max-width: 640px) {
        margin: 28px 0;

        .line {
            left: 8%;
            right: 8%;
        }

        .label {
            font-size: 11px;
            white-space: normal;
        }

        .step {
            gap: 10px;
        }
    }
`;

const Rows = styled.section`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const Row = styled.div`
    overflow: hidden;
    border-radius: 4px;
    background: #2b2d31;

    .rowButton {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 10px 18px;
        box-sizing: border-box;
        border: 0;
        background: transparent;
        color: #f2f3f5;
        text-align: left;
        cursor: pointer;
    }

    .rowButton:hover {
        background: #35373c;
    }

    .rowIcon {
        flex: 0 0 auto;
        width: 24px;
        display: grid;
        place-items: center;
        color: #f2f3f5;
    }

    .rowTitle {
        font-size: 16px;
        font-weight: 600;
        line-height: 20px;
    }

    .rowSub {
        margin-top: 2px;
        color: #b5bac1;
        font-size: 14px;
        line-height: 18px;
    }

    .chevron {
        flex: 0 0 auto;
        margin-left: auto;
        color: #b5bac1;
        transition: transform 0.18s ease;
    }

    .chevron.open {
        transform: rotate(180deg);
    }

    .rowBody {
        padding: 2px 18px 18px 54px;
        color: #b5bac1;
        font-size: 14px;
        line-height: 20px;
    }

    .rowBody p {
        margin: 0 0 12px;
    }

    dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 7px 18px;
        margin: 0;
    }

    dt {
        color: #949ba4;
        font-weight: 500;
    }

    dd {
        margin: 0;
        color: #dbdee1;
        overflow-wrap: anywhere;
    }

    .empty {
        color: #949ba4;
    }

    @media (max-width: 640px) {
        .rowButton {
            padding: 14px 14px;
            gap: 10px;
        }

        .rowBody {
            padding: 2px 14px 16px 48px;
        }

        .rowTitle {
            font-size: 15px;
        }

        .rowSub {
            font-size: 13px;
        }
    }
`;

const Support = styled.p`
    margin: 26px 0 0;
    color: #949ba4;
    font-size: 13px;
    line-height: 19px;
    text-align: center;

    a {
        color: #00a8fc;
        text-decoration: none;
    }

    a:hover {
        text-decoration: underline;
    }

    button {
        padding: 0;
        border: 0;
        color: #00a8fc;
        background: transparent;
        font: inherit;
        cursor: pointer;
    }

    button:hover {
        text-decoration: underline;
    }
`;

function Chevron({ open }: { open: boolean }) {
    return (
        <svg
            className={`chevron${open ? " open" : ""}`}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true">
            <path
                d="M5 8.5 12 15.5 19 8.5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    );
}

function WarningIcon() {
    return (
        <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true">
            <path
                d="M12 3.6 22 21H2L12 3.6Z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
            />
            <path
                d="M12 9.2v5.2"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
            />
            <circle cx="12" cy="17.7" r="1.05" fill="currentColor" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true">
            <path
                d="M6 6l12 12M18 6 6 18"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
            />
        </svg>
    );
}

function formatExpiry(value?: string | null) {
    if (!value) return "Permanent";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function describe(info: BanInfo) {
    const expiry = info.expiresAt ? formatExpiry(info.expiresAt) : null;

    if (info.type === "IpBanned") {
        return expiry
            ? `Your network is suspended until ${expiry}. You can no longer use NullCord from this connection.`
            : "Your network has been suspended. You can no longer use NullCord from this connection.";
    }

    return expiry
        ? `Your account is suspended until ${expiry}. You can no longer use NullCord until then.`
        : "Due to serious policy violations, your account is permanently suspended. You can no longer use NullCord.";
}

function isExpired(info: BanInfo) {
    if (!info.expiresAt) return false;
    const date = new Date(info.expiresAt);
    return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

export default function AccountStanding({
    info,
    onDismiss,
}: {
    info: BanInfo;
    onDismiss?: () => void;
}) {
    const [activeOpen, setActiveOpen] = useState(false);
    const [expiredOpen, setExpiredOpen] = useState(false);

    useEffect(() => {
        if (!info.expiresAt) return;

        const expiry = new Date(info.expiresAt).getTime();
        if (Number.isNaN(expiry)) return;

        let timer: number | undefined;
        const schedule = () => {
            const remaining = expiry + 1500 - Date.now();
            if (remaining <= 0) {
                window.location.assign("/login");
                return;
            }

            // setTimeout overflows above ~24 days; re-arm hourly instead.
            timer = window.setTimeout(schedule, Math.min(remaining, 60 * 60 * 1000));
        };

        schedule();
        return () => {
            if (timer !== undefined) window.clearTimeout(timer);
        };
    }, [info.expiresAt]);

    const active = info.violations?.length
        ? info.violations.length
        : isExpired(info)
          ? 0
          : 1;
    const expired = info.violations?.length
        ? 0
        : isExpired(info)
          ? 1
          : 0;

    const typeLabel =
        info.type === "IpBanned" ? "Network ban" : "Account ban";

    return (
        <Overlay>
            <TopBar>
                <span>
                    You lost access to NullCord. Review your violations to
                    understand for how long and why.
                </span>
                <a
                    className="learn"
                    href="/support"
                    target="_blank"
                    rel="noreferrer">
                    Learn More
                </a>
            </TopBar>

            <Content>
                <Header>
                    <div className="avatar">
                        <img src="/assets/logo.png" alt="" draggable={false} />
                    </div>
                    <div>
                        <h1>
                            {info.type === "IpBanned"
                                ? "Your network is suspended"
                                : "Your account is suspended"}
                        </h1>
                        <p>{describe(info)}</p>
                    </div>
                </Header>

                <Progress aria-label="Account standing">
                    <div className="line" />
                    {[
                        "All good",
                        "Limited",
                        "Very limited",
                        "At risk",
                        "Suspended",
                    ].map((label, index) => {
                        const activeStep = index === 4;
                        return (
                            <div
                                key={label}
                                className={`step${activeStep ? " active final" : ""}`}>
                                <div className="dot">
                                    {activeStep && <CloseIcon />}
                                </div>
                                <div className="label">{label}</div>
                            </div>
                        );
                    })}
                </Progress>

                <Rows>
                    <Row>
                        <button
                            type="button"
                            className="rowButton"
                            aria-expanded={activeOpen}
                            onClick={() => setActiveOpen((value) => !value)}>
                            <span className="rowIcon">
                                <WarningIcon />
                            </span>
                            <span>
                                <div className="rowTitle">
                                    Active violations — {active}
                                </div>
                                <div className="rowSub">
                                    These affect your account status until
                                    they expire.
                                </div>
                            </span>
                            <Chevron open={activeOpen} />
                        </button>
                        {activeOpen && (
                            <div className="rowBody">
                                <p>
                                    {info.message ||
                                        "This account was suspended by NullCord staff."}
                                </p>
                                <dl>
                                    <dt>Type</dt>
                                    <dd>{typeLabel}</dd>
                                    <dt>Expires</dt>
                                    <dd>{formatExpiry(info.expiresAt)}</dd>
                                    {info.violations?.map((violation, index) => (
                                        <div key={index} style={{ display: "contents" }}>
                                            <dt>Reason {index + 1}</dt>
                                            <dd>{violation.reason}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>
                        )}
                    </Row>

                    <Row>
                        <button
                            type="button"
                            className="rowButton"
                            aria-expanded={expiredOpen}
                            onClick={() => setExpiredOpen((value) => !value)}>
                            <span className="rowIcon">
                                <WarningIcon />
                            </span>
                            <span>
                                <div className="rowTitle">
                                    Expired violations — {expired}
                                </div>
                                <div className="rowSub">
                                    These no longer affect your account
                                    status.
                                </div>
                            </span>
                            <Chevron open={expiredOpen} />
                        </button>
                        {expiredOpen && (
                            <div className="rowBody">
                                {expired > 0 ? (
                                    <p>
                                        This violation has expired and no
                                        longer affects your account.
                                    </p>
                                ) : (
                                    <p className="empty">
                                        There are no expired violations on
                                        this account.
                                    </p>
                                )}
                            </div>
                        )}
                    </Row>
                </Rows>

                <Support>
                    Think this is a mistake?{" "}
                    <a
                        href="/support"
                        target="_blank"
                        rel="noreferrer">
                        Contact NullCord support
                    </a>
                    .
                    {onDismiss && (
                        <>
                            {" "}
                            <button type="button" onClick={onDismiss}>
                                Back to sign in
                            </button>
                        </>
                    )}
                </Support>
            </Content>
        </Overlay>
    );
}
