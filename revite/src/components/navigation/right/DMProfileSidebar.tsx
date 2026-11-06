import { ChevronRight } from "@styled-icons/boxicons-regular";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import { API, User, UserPermission } from "revolt.js";
import styled from "styled-components/macro";
import { decodeTime } from "ulid";

import { useEffect, useState } from "preact/hooks";

import { displayDiscriminator } from "../../../lib/owner";

import { dayjs } from "../../../context/Locale";

import { useClient } from "../../../controllers/client/ClientController";
import { modalController } from "../../../controllers/modals/ModalController";
import Markdown from "../../markdown/Markdown";
import UserBadges from "../../common/user/UserBadges";
import UserIcon from "../../common/user/UserIcon";
import UserStatus from "../../common/user/UserStatus";

const Base = styled.aside.attrs({ className: "dc-thin-scroller" })`
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    padding-top: var(--header-height);
    box-sizing: border-box;
    background: var(--secondary-background);
`;

const Banner = styled.div`
    height: 120px;
    flex-shrink: 0;
    background-size: cover;
    background-position: center;
    background-color: var(--accent);
`;

const AvatarWrap = styled.div`
    position: relative;
    height: 48px;
    margin: 0 16px;

    /* Ring around the avatar. Drawn on a wrapper (not the avatar svg) so the
       round clip can't cut off the status dot in the bottom-right corner. */
    .ring {
        position: absolute;
        top: -48px;
        left: -6px;
        display: flex;
        padding: 6px;
        border-radius: 50%;
        background: var(--secondary-background);
        cursor: pointer;
    }

    .ring > svg {
        overflow: visible;
    }
`;

const Card = styled.div`
    margin: 12px 16px 16px;
    padding: 12px;
    border-radius: 8px;
    background: var(--background);
    color: var(--dc-header-secondary);
    font-size: 14px;
    line-height: 18px;

    .names {
        padding-bottom: 12px;
    }

    .display {
        font-size: 20px;
        font-weight: 700;
        line-height: 24px;
        color: var(--dc-header-primary);
        word-break: break-word;
    }

    .username {
        margin-top: 2px;
        color: var(--dc-header-primary);
        word-break: break-word;
    }

    .badges {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 8px;
    }

    .status {
        margin-top: 8px;
    }

    hr {
        border: none;
        height: 1px;
        margin: 0 0 12px;
        background: var(--dc-modifier-selected);
    }

    h3 {
        margin: 0 0 6px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--dc-header-primary);
    }

    section + section {
        margin-top: 12px;
    }

    [data-component="markdown"] {
        font-size: 14px;
        line-height: 18px;
        color: var(--dc-header-secondary);
    }
`;

const Row = styled.button`
    all: unset;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: calc(100% - 32px);
    margin: 0 16px 8px;
    padding: 12px;
    box-sizing: border-box;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    color: var(--dc-header-primary);
    background: var(--background);

    &:hover {
        background: var(--dc-modifier-hover);
    }

    span.count {
        color: var(--dc-header-secondary);
        font-weight: 500;
    }
`;

const Mutuals = styled.div`
    margin: -4px 16px 8px;
    padding: 4px 0;
    border-radius: 8px;
    background: var(--background);

    a {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 12px;
        font-size: 14px;
        font-weight: 500;
        color: var(--dc-header-primary);

        &:hover {
            background: var(--dc-modifier-hover);
            text-decoration: none;
        }
    }

    img {
        width: 24px;
        height: 24px;
        border-radius: 8px;
        object-fit: cover;
    }

    .initial {
        width: 24px;
        height: 24px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        font-size: 11px;
        background: var(--primary-background);
    }
`;

type Mutual = { users: string[]; servers: string[] };

/**
 * Discord-style user profile panel shown on the right in DMs.
 */
export default observer(({ user }: { user: User }) => {
    const client = useClient();
    const [profile, setProfile] = useState<API.UserProfile | null>();
    const [mutual, setMutual] = useState<Mutual | null>();
    const [open, setOpen] = useState<"servers" | "friends" | null>(null);

    const blocked =
        user.relationship === "Blocked" || user.relationship === "BlockedOther";

    useEffect(() => {
        let cancelled = false;
        setProfile(undefined);
        setMutual(undefined);
        if (!blocked && user.permission & UserPermission.ViewProfile) {
            user.fetchProfile()
                .then((value) => !cancelled && setProfile(value))
                .catch(() => !cancelled && setProfile(null));
        }
        if (!blocked && !user.bot) {
            user.fetchMutual()
                .then((value) => !cancelled && setMutual(value))
                .catch(() => !cancelled && setMutual(null));
        }
        return () => {
            cancelled = true;
        };
    }, [user._id, blocked]);

    const bannerURL = profile?.background
        ? client.generateFileURL(
              profile.background as never,
              { width: 680 },
              true,
          )
        : undefined;

    const openProfile = () =>
        modalController.push({ type: "user_profile", user_id: user._id });

    const servers = (mutual?.servers ?? [])
        .map((id) => client.servers.get(id))
        .filter((x) => x);
    const friends = (mutual?.users ?? [])
        .map((id) => client.users.get(id))
        .filter((x) => x);

    return (
        <Base aria-label="User profile">
            <Banner
                style={
                    bannerURL
                        ? { backgroundImage: `url('${bannerURL}')` }
                        : undefined
                }
            />
            <AvatarWrap>
                <div className="ring" onClick={openProfile}>
                    <UserIcon target={user} size={80} status />
                </div>
            </AvatarWrap>
            <Card>
                <div className="names">
                    <div className="display">
                        {user.display_name ?? user.username}
                    </div>
                    <div className="username">
                        {user.username}#{displayDiscriminator(user)}
                    </div>
                    {!blocked && (
                        <div className="badges">
                            <UserBadges
                                badges={user.badges ?? 0}
                                uid={user._id}
                                privileged={user.privileged}
                            />
                        </div>
                    )}
                    {!blocked && user.status?.text && (
                        <div className="status">
                            <UserStatus user={user} />
                        </div>
                    )}
                </div>
                <hr />
                {profile?.content && (
                    <section>
                        <h3>About Me</h3>
                        <Markdown content={profile.content} />
                    </section>
                )}
                <section>
                    <h3>Member Since</h3>
                    {dayjs(decodeTime(user._id)).format("MMM D, YYYY")}
                </section>
            </Card>

            {servers.length > 0 && (
                <>
                    <Row
                        onClick={() =>
                            setOpen(open === "servers" ? null : "servers")
                        }>
                        <span>
                            Mutual Servers{" "}
                            <span className="count">— {servers.length}</span>
                        </span>
                        <ChevronRight
                            size={20}
                            style={{
                                transform:
                                    open === "servers" ? "rotate(90deg)" : "",
                            }}
                        />
                    </Row>
                    {open === "servers" && (
                        <Mutuals>
                            {servers.map((server) => {
                                const icon = server!.generateIconURL(
                                    { max_side: 64 },
                                    false,
                                );
                                return (
                                    <Link
                                        key={server!._id}
                                        to={`/server/${server!._id}`}>
                                        {icon ? (
                                            <img src={icon} />
                                        ) : (
                                            <span className="initial">
                                                {server!.name.slice(0, 1)}
                                            </span>
                                        )}
                                        {server!.name}
                                    </Link>
                                );
                            })}
                        </Mutuals>
                    )}
                </>
            )}

            {friends.length > 0 && (
                <>
                    <Row
                        onClick={() =>
                            setOpen(open === "friends" ? null : "friends")
                        }>
                        <span>
                            Mutual Friends{" "}
                            <span className="count">— {friends.length}</span>
                        </span>
                        <ChevronRight
                            size={20}
                            style={{
                                transform:
                                    open === "friends" ? "rotate(90deg)" : "",
                            }}
                        />
                    </Row>
                    {open === "friends" && (
                        <Mutuals>
                            {friends.map((friend) => (
                                <a
                                    key={friend!._id}
                                    onClick={() =>
                                        modalController.push({
                                            type: "user_profile",
                                            user_id: friend!._id,
                                        })
                                    }>
                                    <UserIcon target={friend} size={24} />
                                    {friend!.display_name ?? friend!.username}
                                </a>
                            ))}
                        </Mutuals>
                    )}
                </>
            )}

            <Row onClick={openProfile}>View Full Profile</Row>
        </Base>
    );
});
