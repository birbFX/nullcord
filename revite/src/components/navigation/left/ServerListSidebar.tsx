import { Plus } from "@styled-icons/boxicons-regular";
import { Compass } from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import { Link, useLocation, useParams } from "react-router-dom";
import { Channel, Server } from "revolt.js";
import styled, { css } from "styled-components/macro";

import { useTriggerEvents } from "preact-context-menu";
import { useState } from "preact/hooks";

import { isTouchscreenDevice } from "../../../lib/isTouchscreenDevice";

import { useApplicationState } from "../../../mobx/State";

import { useClient } from "../../../controllers/client/ClientController";
import { modalController } from "../../../controllers/modals/ModalController";
import Tooltip from "../../common/Tooltip";

const Rail = styled.nav`
    width: var(--dc-rail-width);
    height: 100%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 12px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    background: var(--background);

    &::-webkit-scrollbar {
        display: none;
    }

    ${isTouchscreenDevice &&
    css`
        padding-bottom: 50px;
    `}
`;

const Separator = styled.div`
    width: 32px;
    height: 2px;
    flex-shrink: 0;
    margin: 0 0 8px;
    border-radius: 1px;
    background: var(--dc-modifier-selected);
`;

const Slot = styled.div<{ dropTarget?: boolean }>`
    position: relative;
    width: var(--dc-rail-width);
    display: flex;
    justify-content: center;
    flex-shrink: 0;
    margin-bottom: 8px;

    ${(props) =>
        props.dropTarget &&
        css`
            &::after {
                content: "";
                position: absolute;
                top: -5px;
                left: 16px;
                right: 16px;
                height: 2px;
                border-radius: 1px;
                background: var(--success);
            }
        `}
`;

const Pill = styled.span<{ state: "none" | "unread" | "hover" | "active" }>`
    position: absolute;
    left: 0;
    top: 50%;
    width: 8px;
    margin-left: -4px;
    border-radius: 0 4px 4px 0;
    background: var(--dc-header-primary);
    transform: translateY(-50%);
    transition: height 0.15s ease-out, opacity 0.15s ease-out;
    pointer-events: none;

    ${(props) => {
        switch (props.state) {
            case "active":
                return css`
                    height: 40px;
                `;
            case "hover":
                return css`
                    height: 20px;
                `;
            case "unread":
                return css`
                    height: 8px;
                `;
            default:
                return css`
                    height: 0;
                    opacity: 0;
                `;
        }
    }}
`;

const Icon = styled.div<{
    active?: boolean;
    variant?: "home" | "server" | "action";
    hasImage?: boolean;
}>`
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    overflow: hidden;
    cursor: pointer;
    user-select: none;
    border-radius: 50%;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.2;
    text-align: center;
    color: var(--dc-header-primary);
    background: ${(props) =>
        props.hasImage ? "transparent" : "var(--primary-background)"};
    transition: border-radius 0.15s ease-out, background-color 0.15s ease-out,
        color 0.15s ease-out;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
    }

    /* Home logo: brand colour at rest, white on hover/active. */
    img.logo {
        width: 28px;
        height: 28px;
        object-fit: contain;
    }

    img.logo.lit {
        display: none;
    }

    &:hover img.logo.lit {
        display: block;
    }

    &:hover img.logo.idle {
        display: none;
    }

    ${(props) =>
        props.active &&
        css`
            img.logo.lit {
                display: block;
            }

            img.logo.idle {
                display: none;
            }
        `}

    &:active {
        transform: translateY(1px);
    }

    ${(props) =>
        props.variant === "action" &&
        css`
            color: var(--success);
        `}

    &:hover {
        border-radius: 16px;
        ${(props) =>
            props.variant === "action"
                ? css`
                      color: #fff;
                      background: var(--success);
                  `
                : !props.hasImage &&
                  css`
                      color: #fff;
                      background: var(--accent);
                  `}
    }

    ${(props) =>
        props.active &&
        css`
            border-radius: 16px;
            ${!props.hasImage &&
            css`
                color: #fff;
                background: ${props.variant === "action"
                    ? "var(--success)"
                    : "var(--accent)"};
            `}
        `}
`;

const Badge = styled.span`
    position: absolute;
    right: 12px;
    bottom: -4px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    box-sizing: content-box;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 700;
    line-height: 16px;
    color: #fff;
    border-radius: 12px;
    background: var(--error);
    border: 4px solid var(--background);
    pointer-events: none;
`;

/**
 * Two-letter acronym used when a server has no icon, like Discord.
 */
function acronym(name: string) {
    return name
        .replace(/'s /g, " ")
        .split(/\s+/)
        .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
        .join("")
        .slice(0, 5);
}

type ItemProps = {
    label: Children;
    to?: string;
    onClick?: () => void;
    active?: boolean;
    unread?: boolean;
    mentions?: number;
    variant?: "home" | "server" | "action";
    image?: string;
    fallback?: Children;
    menu?: Record<string, unknown>;
    dragProps?: JSX.HTMLAttributes<HTMLDivElement>;
    dropTarget?: boolean;
};

function RailItem({
    label,
    to,
    onClick,
    active,
    unread,
    mentions,
    variant,
    image,
    fallback,
    menu,
    dragProps,
    dropTarget,
}: ItemProps) {
    const [hover, setHover] = useState(false);
    const triggers = useTriggerEvents("Menu", menu ?? {});

    const icon = (
        <Icon
            active={active}
            variant={variant}
            hasImage={!!image}
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            {...(menu ? triggers : {})}>
            {image ? <img src={image} loading="lazy" draggable={false} /> : fallback}
        </Icon>
    );

    return (
        <Slot dropTarget={dropTarget} {...dragProps}>
            {variant !== "action" && (
                <Pill
                    state={
                        active
                            ? "active"
                            : hover
                            ? "hover"
                            : unread
                            ? "unread"
                            : "none"
                    }
                />
            )}
            <Tooltip content={label} placement="right" offset={[0, 16]}>
                {to ? (
                    <Link to={to} draggable={false}>
                        {icon}
                    </Link>
                ) : (
                    icon
                )}
            </Tooltip>
            {!!mentions && mentions > 0 && (
                <Badge>{mentions > 99 ? "99+" : mentions}</Badge>
            )}
        </Slot>
    );
}

const ServerEntry = observer(
    ({
        server,
        active,
        index,
        dragging,
        setDragging,
        dropIndex,
        setDropIndex,
    }: {
        server: Server;
        active: boolean;
        index: number;
        dragging: number | null;
        setDragging: (index: number | null) => void;
        dropIndex: number | null;
        setDropIndex: (index: number | null) => void;
    }) => {
        const state = useApplicationState();
        const unread = !!server.isUnread(state.notifications);
        const mentions = server.getMentions(state.notifications).length;

        return (
            <RailItem
                label={server.name}
                to={`/server/${server._id}`}
                active={active}
                unread={unread}
                mentions={mentions}
                image={server.generateIconURL({ max_side: 256 }, false)}
                fallback={acronym(server.name)}
                menu={{ server: server._id, unread }}
                dropTarget={dragging !== null && dropIndex === index}
                dragProps={
                    isTouchscreenDevice
                        ? undefined
                        : {
                              draggable: true,
                              onDragStart: (e) => {
                                  e.dataTransfer?.setData("text/plain", "");
                                  setDragging(index);
                              },
                              onDragOver: (e) => {
                                  if (dragging === null) return;
                                  e.preventDefault();
                                  setDropIndex(index);
                              },
                              onDrop: (e) => {
                                  e.preventDefault();
                                  if (dragging !== null && dragging !== index) {
                                      state.ordering.reorderServer(
                                          dragging,
                                          index,
                                      );
                                  }
                                  setDragging(null);
                                  setDropIndex(null);
                              },
                              onDragEnd: () => {
                                  setDragging(null);
                                  setDropIndex(null);
                              },
                          }
                }
            />
        );
    },
);

const UnreadDM = observer(({ channel }: { channel: Channel }) => {
    const state = useApplicationState();
    const mentions = channel.getMentions(state.notifications).length;
    const name =
        channel.channel_type === "DirectMessage"
            ? channel.recipient?.display_name ?? channel.recipient?.username
            : channel.name;
    const image =
        channel.channel_type === "DirectMessage"
            ? channel.recipient?.generateAvatarURL({ max_side: 256 }, true)
            : channel.generateIconURL({ max_side: 256 }, false);

    return (
        <RailItem
            label={name}
            to={`/channel/${channel._id}`}
            unread
            mentions={mentions}
            image={image}
            fallback={acronym(name ?? "?")}
            menu={{ channel: channel._id, unread: true }}
        />
    );
});

/**
 * Discord-style guild rail.
 */
export default observer(() => {
    const client = useClient();
    const state = useApplicationState();
    const { pathname } = useLocation();
    const { server: server_id } = useParams<{ server?: string }>();

    const [dragging, setDragging] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);

    const inHome = !server_id && !pathname.startsWith("/discover");

    const incoming = [...client.users.values()].filter(
        (user) => user?.relationship === "Incoming",
    ).length;

    const unreadDMs = [...client.channels.values()].filter(
        (x) =>
            ((x.channel_type === "DirectMessage" && x.active) ||
                x.channel_type === "Group") &&
            x.isUnread(state.notifications),
    );

    return (
        <Rail
            aria-label="Servers sidebar"
            onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDropIndex(null);
            }}>
            <RailItem
                label="Direct Messages"
                to={state.layout.getLastHomePath()}
                active={inHome}
                variant="home"
                mentions={incoming}
                fallback={
                    <>
                        <img className="logo idle" src="/nullcord.svg" alt="" />
                        <img
                            className="logo lit"
                            src="/nullcord-white.svg"
                            alt=""
                        />
                    </>
                }
            />
            {unreadDMs.map((channel) => (
                <UnreadDM key={channel._id} channel={channel} />
            ))}
            <Separator />
            {state.ordering.orderedServers.map((server, index) => (
                <ServerEntry
                    key={server._id}
                    server={server}
                    index={index}
                    active={server._id === server_id}
                    dragging={dragging}
                    setDragging={setDragging}
                    dropIndex={dropIndex}
                    setDropIndex={setDropIndex}
                />
            ))}
            <RailItem
                label="Add a Server"
                variant="action"
                onClick={() => modalController.push({ type: "create_server" })}
                fallback={<Plus size={24} />}
            />
            <RailItem
                label="Explore Discoverable Servers"
                variant="action"
                to="/discover"
                active={pathname.startsWith("/discover")}
                fallback={<Compass size={24} />}
            />
        </Rail>
    );
});
