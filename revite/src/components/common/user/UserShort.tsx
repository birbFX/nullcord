import { TimeFive } from "@styled-icons/boxicons-regular";
import { observer } from "mobx-react-lite";
import { useParams } from "react-router-dom";
import { User, API } from "revolt.js";
import styled, { css } from "styled-components/macro";

import { Ref } from "preact";
import { Text } from "preact-i18n";

import { internalEmit } from "../../../lib/eventEmitter";
import { OWNER_COLOUR, isOwner } from "../../../lib/owner";
import { getEquippedServerTag } from "../../../lib/serverExtras";
import { isPluginEnabled } from "../../../lib/plugins";

import { dayjs } from "../../../context/Locale";

import { useClient } from "../../../controllers/client/ClientController";
import { modalController } from "../../../controllers/modals/ModalController";
import Tooltip from "../Tooltip";
import OwnerCrown from "./OwnerCrown";
import UserIcon from "./UserIcon";

const BotBadge = styled.div`
    display: inline-block;
    flex-shrink: 0;
    height: 1.4em;
    padding: 0 4px;
    font-size: 0.6em;
    user-select: none;
    margin-inline-start: 4px;
    text-transform: uppercase;
    color: var(--accent-contrast);
    background: var(--accent);
    border-radius: calc(var(--border-radius) / 2);
`;

const VerifiedBotBadge = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.25em;
    height: 1.25em;
    margin-inline-start: 4px;
    border-radius: 50%;
    background: #3ba55c;
    color: #fff;
    font-size: 0.68em;
    font-weight: 800;
    line-height: 1;
    user-select: none;
`;

type UsernameProps = Omit<
    JSX.HTMLAttributes<HTMLElement>,
    "children" | "as"
> & {
    user?: User;
    prefixAt?: boolean;
    masquerade?: API.Masquerade;
    showServerIdentity?: boolean | "both";

    override?: string;
    innerRef?: Ref<any>;
};

const ServerTag = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-inline-start: 5px;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 800;
    background: var(--primary-background);
    color: var(--foreground);
    vertical-align: 0.1em;

    &::before {
        content: "◆";
        color: #8b95ff;
        font-size: 9px;
    }
`;

const Name = styled.span<{ colour?: string | null }>`
    ${(props) =>
        props.colour &&
        (props.colour.includes("gradient")
            ? css`
                  background: ${props.colour};
                  background-clip: text;
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
              `
            : css`
                  color: ${props.colour};
              `)}
`;

export const Username = observer(
    ({
        user,
        prefixAt,
        masquerade,
        showServerIdentity,
        innerRef,
        override,
        ...otherProps
    }: UsernameProps) => {
        let username =
            (user as unknown as { display_name: string })?.display_name ??
            user?.username;
        let color = masquerade?.colour;
        let timed_out: Date | undefined;
        let serverTag = "";

        if (override) {
            username = override;
        } else if (user && showServerIdentity) {
            if (isPluginEnabled("server-tags")) {
                const equipped = getEquippedServerTag(user._id);
                if (equipped) serverTag = equipped.tag;
            }
            const { server } = useParams<{ server?: string }>();
            if (server) {
                const client = useClient();
                const member = client.members.getKey({
                    server,
                    user: user._id,
                });

                if (member) {
                    if (member.nickname) {
                        if (showServerIdentity === "both") {
                            username = `${member.nickname} (${username})`;
                        } else {
                            username = member.nickname;
                        }
                    }

                    if (member.timeout) {
                        timed_out = member.timeout;
                    }

                    if (!color) {
                        for (const [_, { colour }] of member.orderedRoles) {
                            if (colour) {
                                color = colour;
                            }
                        }
                    }
                }
            }
        }

        const owner = !!user && !masquerade && isOwner(user._id);
        if (owner) {
            // The owner's name is always gold, even if a role colour is set.
            color = OWNER_COLOUR;
        }

        const el = (
            <>
                <Name {...otherProps} ref={innerRef} colour={color}>
                    {prefixAt ? "@" : undefined}
                    {masquerade?.name ?? username ?? (
                        <Text id="app.main.channel.unknown_user" />
                    )}
                </Name>

                {owner && <OwnerCrown />}
                {serverTag ? <ServerTag title="Server tag">{serverTag}</ServerTag> : undefined}

                {timed_out && (
                    <Tooltip
                        content={
                            <Text
                                id="app.main.channel.user_timed_out"
                                fields={{
                                    time: dayjs(timed_out).fromNow(true),
                                }}
                            />
                        }>
                        <TimeFive
                            size={16}
                            color="var(--secondary-foreground)"
                        />
                    </Tooltip>
                )}
            </>
        );

        if (user?.bot) {
            const verified = Boolean(((user.bot as unknown as { flags?: number }).flags ?? 0) & 1);
            return (
                <>
                    {el}
                    <BotBadge>
                        {masquerade ? (
                            <Text id="app.main.channel.bridge" />
                        ) : (
                            <Text id="app.main.channel.bot" />
                        )}
                    </BotBadge>
                    {verified && (
                        <VerifiedBotBadge title="Verified app">✓</VerifiedBotBadge>
                    )}
                </>
            );
        }

        if (override) {
            return (
                <>
                    {el}
                    <BotBadge>
                        <Text id="app.main.channel.bot" />
                    </BotBadge>
                </>
            );
        }

        return el;
    },
);

export default function UserShort({
    user,
    size,
    prefixAt,
    masquerade,
    showServerIdentity,
}: {
    user?: User;
    size?: number;
    prefixAt?: boolean;
    masquerade?: API.Masquerade;
    showServerIdentity?: boolean;
}) {
    const openProfile = () =>
        user &&
        modalController.push({ type: "user_profile", user_id: user._id });

    const handleUserClick = (e: MouseEvent) => {
        if (e.shiftKey && user?._id) {
            e.preventDefault();
            internalEmit("MessageBox", "append", `<@${user?._id}>`, "mention");
        } else {
            openProfile();
        }
    };

    return (
        <>
            <UserIcon
                target={user}
                size={size ?? 24}
                masquerade={masquerade}
                onClick={handleUserClick}
                showServerIdentity={showServerIdentity}
            />
            <Username
                user={user}
                prefixAt={prefixAt}
                masquerade={masquerade}
                onClick={handleUserClick}
                showServerIdentity={showServerIdentity}
            />
        </>
    );
}
