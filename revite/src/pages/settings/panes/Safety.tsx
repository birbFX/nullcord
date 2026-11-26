import { CheckShield, ShieldX, Error } from "@styled-icons/boxicons-solid";
import dayjs from "dayjs";
import { observer } from "mobx-react-lite";
import { decodeTime } from "ulid";
import styled from "styled-components/macro";

import { useEffect, useState } from "preact/hooks";

import { Preloader } from "@revoltchat/ui";

import { useClient } from "../../../controllers/client/ClientController";

interface SafetyStrike {
    _id: string;
    reason: string;
    kind?: string;
    created_at?: string | null;
    expires_at?: string | null;
}

interface SafetyStanding {
    banned: boolean;
    suspended: boolean;
    banned_until?: string | null;
    suspended_until?: string | null;
    strikes: SafetyStrike[];
}

const Page = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 760px;
    color: var(--foreground);

    h2 {
        margin: 0 0 4px;
        font-size: 22px;
        font-weight: 700;
    }

    .intro {
        margin: 0;
        color: var(--tertiary-foreground);
        font-size: 14px;
        line-height: 20px;
    }
`;

const Card = styled.section`
    padding: 20px;
    border-radius: var(--border-radius);
    background: var(--secondary-background);

    .status {
        display: flex;
        align-items: center;
        gap: 14px;
    }

    .statusIcon {
        width: 46px;
        height: 46px;
        display: grid;
        place-items: center;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--primary-background);
        color: var(--tertiary-foreground);
    }

    .status.good .statusIcon {
        color: var(--success, #23a55a);
    }

    .status.bad .statusIcon {
        color: var(--error);
    }

    .statusText {
        min-width: 0;
    }

    .statusTitle {
        margin: 0 0 3px;
        font-size: 17px;
        font-weight: 700;
    }

    .statusBody {
        margin: 0;
        color: var(--tertiary-foreground);
        font-size: 13px;
        line-height: 18px;
    }
`;

const Progress = styled.div`
    position: relative;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    margin-top: 26px;

    .line {
        position: absolute;
        top: 6px;
        left: 10%;
        right: 10%;
        height: 2px;
        background: var(--tertiary-background);
    }

    .step {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        min-width: 0;
    }

    .dot {
        width: 14px;
        height: 14px;
        box-sizing: border-box;
        border: 2px solid var(--tertiary-background);
        border-radius: 50%;
        background: var(--tertiary-background);
    }

    .step.active .dot {
        border-color: var(--accent);
        background: var(--accent);
    }

    .label {
        color: var(--tertiary-foreground);
        font-size: 12px;
        line-height: 16px;
        text-align: center;
        white-space: nowrap;
    }

    .step.active .label {
        color: var(--foreground);
        font-weight: 700;
    }

    @media (max-width: 560px) {
        .label {
            font-size: 10px;
            white-space: normal;
        }
    }
`;

const Section = styled.section`
    overflow: hidden;
    border-radius: var(--border-radius);
    background: var(--secondary-background);

    .head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 15px 18px;
    }

    .head svg {
        flex-shrink: 0;
        color: var(--tertiary-foreground);
    }

    .headTitle {
        font-size: 15px;
        font-weight: 700;
    }

    .headSub {
        margin-top: 2px;
        color: var(--tertiary-foreground);
        font-size: 12px;
    }

    .count {
        margin-left: auto;
        color: var(--tertiary-foreground);
        font-size: 12px;
        font-weight: 600;
    }

    .list {
        border-top: 1px solid var(--tertiary-background);
    }

    .strike {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 18px;
    }

    .strike + .strike {
        border-top: 1px solid var(--tertiary-background);
    }

    .strikeIcon {
        flex-shrink: 0;
        margin-top: 1px;
        color: var(--tertiary-foreground);
    }

    .strikeReason {
        font-size: 13px;
        line-height: 18px;
        overflow-wrap: anywhere;
    }

    .strikeMeta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 12px;
        margin-top: 4px;
        color: var(--tertiary-foreground);
        font-size: 11px;
    }

    .kind {
        color: var(--foreground);
        font-weight: 600;
        text-transform: capitalize;
    }

    .empty {
        padding: 16px 18px;
        border-top: 1px solid var(--tertiary-background);
        color: var(--tertiary-foreground);
        font-size: 13px;
    }
`;

const Footer = styled.p`
    margin: 0;
    color: var(--tertiary-foreground);
    font-size: 12px;
    line-height: 18px;

    a {
        color: var(--accent);
    }
`;

const STEP_LABELS = ["All good", "Limited", "Very limited", "At risk", "Suspended"];

function strikeActive(strike: SafetyStrike, standing: SafetyStanding) {
    const now = Date.now();
    const kind = strike.kind || "strike";

    if (kind === "ban") {
        if (!standing.banned) return false;
        if (!strike.expires_at) return true;
        return new Date(strike.expires_at).getTime() > now;
    }

    if (kind === "suspension") {
        return standing.suspended;
    }

    const created = strike.created_at
        ? new Date(strike.created_at).getTime()
        : decodeTime(strike._id);
    return now - created < 90 * 24 * 60 * 60 * 1000;
}

function kindLabel(kind?: string) {
    switch (kind) {
        case "ban":
            return "Ban";
        case "suspension":
            return "Suspension";
        default:
            return "Strike";
    }
}

export const Safety = observer(() => {
    const client = useClient();
    const [standing, setStanding] = useState<SafetyStanding | undefined>();
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        let cancelled = false;
        void client.api
            .get("/users/@me/safety")
            .then((data) => {
                if (!cancelled) setStanding(data as SafetyStanding);
            })
            .catch(() => {
                if (!cancelled) {
                    setError("Could not load your safety standing.");
                }
            });

        return () => {
            cancelled = true;
        };
    }, [client]);

    if (error) {
        return (
            <Page>
                <h2>Safety standing</h2>
                <p className="intro">{error}</p>
            </Page>
        );
    }

    if (!standing) return <Preloader type="ring" />;

    const active = standing.strikes.filter((strike) =>
        strikeActive(strike, standing),
    );
    const expired = standing.strikes.filter(
        (strike) => !strikeActive(strike, standing),
    );

    const statusIndex = standing.banned || standing.suspended
        ? 4
        : active.length >= 3
          ? 3
          : active.length === 2
            ? 2
            : active.length === 1
              ? 1
              : 0;

    const suspended = statusIndex === 4;
    const good = statusIndex === 0;

    return (
        <Page>
            <div>
                <h2>Safety standing</h2>
                <p className="intro">
                    Your platform safety record, violation history and current
                    standing. Active violations are considered in future
                    moderation decisions.
                </p>
            </div>

            <Card>
                <div className={`status ${good ? "good" : suspended ? "bad" : ""}`}>
                    <div className="statusIcon">
                        {good ? <CheckShield size={26} /> : <ShieldX size={26} />}
                    </div>
                    <div className="statusText">
                        <h3 className="statusTitle">
                            {suspended
                                ? "Your account is suspended"
                                : good
                                  ? "Your account is in good standing"
                                  : `Your account is ${STEP_LABELS[statusIndex].toLowerCase()}`}
                        </h3>
                        <p className="statusBody">
                            {suspended
                                ? "This account currently has a platform restriction."
                                : good
                                  ? "No active violations are on your account."
                                  : "Review the active violations below. Further violations may affect your account standing."}
                        </p>
                    </div>
                </div>

                <Progress>
                    <div className="line" />
                    {STEP_LABELS.map((label, index) => (
                        <div
                            key={label}
                            className={`step${index === statusIndex ? " active" : ""}`}>
                            <div className="dot" />
                            <div className="label">{label}</div>
                        </div>
                    ))}
                </Progress>
            </Card>

            <Section>
                <div className="head">
                    <Error size={20} />
                    <div>
                        <div className="headTitle">Active violations</div>
                        <div className="headSub">
                            These affect your account status until they expire.
                        </div>
                    </div>
                    <div className="count">{active.length}</div>
                </div>
                <div className="list">
                    {active.length === 0 ? (
                        <div className="empty">No active violations.</div>
                    ) : (
                        active.map((strike) => (
                            <div className="strike" key={strike._id}>
                                <Error size={17} className="strikeIcon" />
                                <div>
                                    <div className="strikeReason">
                                        {strike.reason}
                                    </div>
                                    <div className="strikeMeta">
                                        <span className="kind">
                                            {kindLabel(strike.kind)}
                                        </span>
                                        <span>
                                            {strike.created_at
                                                ? dayjs(
                                                      strike.created_at,
                                                  ).format("MMM D, YYYY")
                                                : dayjs(
                                                      decodeTime(strike._id),
                                                  ).format("MMM D, YYYY")}
                                        </span>
                                        {strike.expires_at && (
                                            <span>
                                                Expires{" "}
                                                {dayjs(
                                                    strike.expires_at,
                                                ).format("MMM D, YYYY")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Section>

            <Section>
                <div className="head">
                    <Error size={20} />
                    <div>
                        <div className="headTitle">Expired violations</div>
                        <div className="headSub">
                            These no longer affect your account status.
                        </div>
                    </div>
                    <div className="count">{expired.length}</div>
                </div>
                <div className="list">
                    {expired.length === 0 ? (
                        <div className="empty">No expired violations.</div>
                    ) : (
                        expired.map((strike) => (
                            <div className="strike" key={strike._id}>
                                <Error size={17} className="strikeIcon" />
                                <div>
                                    <div className="strikeReason">
                                        {strike.reason}
                                    </div>
                                    <div className="strikeMeta">
                                        <span className="kind">
                                            {kindLabel(strike.kind)}
                                        </span>
                                        <span>
                                            {strike.created_at
                                                ? dayjs(
                                                      strike.created_at,
                                                  ).format("MMM D, YYYY")
                                                : dayjs(
                                                      decodeTime(strike._id),
                                                  ).format("MMM D, YYYY")}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Section>

            <Footer>
                Think something is wrong?{" "}
                <a
                    href="https://support.canyonlakelabs.com/topics/nullcord"
                    target="_blank"
                    rel="noreferrer">
                    Contact NullCord support
                </a>
                .
            </Footer>
        </Page>
    );
});
