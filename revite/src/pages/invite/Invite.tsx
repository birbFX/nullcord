                            {invite.type === "Server" && (
                                <>
                                    #{invite.channel_name} •{" "}
                                    <Text
                                        id="app.special.invite.user_count"
                                        fields={{
                                            member_count: invite.member_count,
                                        }}
                                    />
                                </>
                            )}
import { ArrowBack } from "@styled-icons/boxicons-regular";
import { Redirect, useHistory, useParams } from "react-router-dom";
import { API } from "revolt.js";

import styles from "./Invite.module.scss";
import { Text } from "preact-i18n";
import { useEffect, useState } from "preact/hooks";

import { Button, Category, Error, Preloader } from "@revoltchat/ui";

import { TextReact } from "../../lib/i18n";

import { useApplicationState } from "../../mobx/State";

import ServerIcon from "../../components/common/ServerIcon";
import UserIcon from "../../components/common/user/UserIcon";
import {
    useClient,
    useSession,
} from "../../controllers/client/ClientController";
import RequiresOnline from "../../controllers/client/jsx/RequiresOnline";
import { takeError } from "../../controllers/client/jsx/error";

export const PENDING_INVITE_KEY = "nullcord:pendingInvite";

export default function Invite() {
    const history = useHistory();
    const session = useSession();
    const client = useClient();

    const layout = useApplicationState().layout;

    const { code } = useParams<{ code: string }>();
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [invite, setInvite] = useState<API.InviteResponse | undefined>(
        undefined,
    );

    useEffect(() => {
        if (typeof invite === "undefined") {
            client
                .fetchInvite(code)
                .then((data) => setInvite(data))
                .catch((err) => setError(takeError(err)));
        }
    }, [code, invite]);

    if (code === undefined) return <Redirect to={layout.getLastPath()} />;

    if (typeof invite === "undefined") {
        return (
            <div className={styles.preloader}>
                <RequiresOnline>
                    {error ? (
                        <div
                            className={styles.invite}
                            style={{
                                background: "var(--secondary-background)",
                                width: "100%",
                                height: "100%",
                            }}>
                            <div className={styles.details}>
                                <h1>
                                    <Text id="app.special.invite.invalid" />
                                </h1>
                                <h2>
                                    <Text id="app.special.invite.invalid_desc" />
                                </h2>
                                <div style="cursor: pointer;">
                                    <Button palette="secondary">
                                        <ArrowBack
                                            size={32}
                                            onClick={() =>
                                                history.push(
                                                    layout.getLastPath(),
                                                )
                                            }
                                        />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <Preloader type="spinner" />
                    )}
                </RequiresOnline>
            </div>
        );
    }

    const join = async () => {
        if (!session) {
            // Remember the invite so it resumes after logging in / signing up
            try {
                localStorage.setItem(PENDING_INVITE_KEY, code);
            } catch (e) {
                /* storage unavailable */
            }
            return history.push("/login");
        }

        setProcessing(true);
        setError(undefined);

        try {
            await client.joinInvite(invite);

            history.push(
                invite.type === "Group"
                    ? `/channel/${invite.channel_id}`
                    : `/server/${invite.server_id}/channel/${invite.channel_id}`,
            );
        } catch (err) {
            setError(takeError(err));
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div
            className={styles.invite}
            style={{
                backgroundImage:
                    invite.type === "Server" && invite.server_banner
                        ? `url('${client?.generateFileURL(
                              invite.server_banner,
                          )}')`
                        : undefined,
            }}>
            <div className={styles.leave}>
                <ArrowBack
                    size={32}
                    onClick={() => history.push(layout.getLastPath())}
                />
            </div>

            {!processing && (
                <div className={styles.icon}>
                    {invite.type === "Server" ? (
                        <ServerIcon
                            attachment={invite.server_icon}
                            server_name={invite.server_name}
                            size={64}
                        />
                    ) : (
                        <UserIcon size={64} attachment={invite.user_avatar} />
                    )}
                </div>
            )}

            <div className={styles.details}>
                {processing ? (
                    <Preloader type="ring" />
                ) : (
                    <>
                        <h1>
                            {invite.type === "Server"
                                ? invite.server_name
                                : invite.channel_name}
                        </h1>
                        <h2>
                            {invite.type === "Server" && (
                                <>#{invite.channel_name} • </>
                            )}
                            <Text
                                id="app.special.invite.user_count"
                                fields={{
                                    member_count:
                                        invite.type === "Server"
                                            ? invite.member_count
                                            : 0,
                                }}
                            />
                        </h2>
                        <h3>
                            <TextReact
                                id="app.special.invite.invited_by"
                                fields={{
                                    user: (
                                        <>
                                            <UserIcon
                                                size={24}
                                                attachment={invite.user_avatar}
                                            />{" "}
                                            {invite.user_name}
                                        </>
                                    ),
                                }}
                            />
                        </h3>
                        <Category>
                            <Error error={error} />
                        </Category>
                        <Button
                            palette="secondary"
                            onClick={join}>                            {!session ? (
                                <Text id="app.special.invite.login" />
                            ) : (
                                <Text id="app.special.invite.accept" />
                            )}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
