import { Check, ChevronDown } from "@styled-icons/boxicons-regular";
import { observer } from "mobx-react-lite";
import { Server } from "revolt.js";
import styled, { css } from "styled-components/macro";

import { Text } from "preact-i18n";

import { openContextMenu } from "preact-context-menu";

import { modalController } from "../../controllers/modals/ModalController";
import { CLL_SERVER_ID } from "../../lib/constants";
import {
    boostLevel,
    serverHasInfiniteBoosts,
    useServerExtras,
} from "../../lib/serverExtras";
import Tooltip from "./Tooltip";

interface Props {
    server: Server;
    background?: boolean;
}

const ServerBanner = styled.div<Omit<Props, "server">>`
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    position: relative;
    z-index: 2;

    background-size: cover;
    background-repeat: no-repeat;
    background-position: center center;
    /* Opaque on every theme; see Header in @revoltchat/ui. */
    background-color: var(--dc-solid-base);
    box-shadow: var(--dc-elevation-low);
    isolation: isolate;

    &::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        background: var(--secondary-background);
    }
    transition: background-color 0.1s linear;

    ${(props) =>
        props.background &&
        css`
            height: 135px;
            box-shadow: none;

            /* The banner image is the background here. */
            &::before {
                display: none;
            }

            .container {
                background: linear-gradient(
                    180deg,
                    rgba(0, 0, 0, 0.4) 0%,
                    transparent 100%
                );
                color: #fff;
            }
        `}

    .container {
        height: var(--header-height);
        flex-shrink: 0;

        display: flex;
        align-items: center;
        padding: 0 16px;
        font-size: 16px;
        font-weight: 600;
        line-height: 20px;
        white-space: nowrap;
        overflow: hidden;
        gap: 6px;
        cursor: pointer;
        user-select: none;
        color: var(--dc-header-primary);

        &:hover {
            background-color: var(--dc-modifier-hover);
        }

        .title {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex-grow: 1;
            color: inherit;
        }

        .chevron {
            flex-shrink: 0;
            opacity: 0.85;
        }

        .server-tag,
        .boost-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            flex-shrink: 0;
            padding: 0 4px;
            height: 16px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 700;
            background: var(--dc-modifier-selected);
            color: var(--dc-header-primary);
        }

        .server-tag .diamond {
            color: #8b95ff;
        }

        .boost-badge {
            color: #ff73fa;
        }
    }
`;

export default observer(({ server }: Props) => {
    const extras = useServerExtras(server._id);
    const bannerURL = server.generateBannerURL({ width: 480 });
    const boosts = Object.values(extras.boosts ?? {}).reduce((a, b) => a + b, 0);
    const infinite = serverHasInfiniteBoosts(server._id);
    const level = infinite ? 3 : boostLevel(boosts);
    const serverTag =
        extras.tag || (server._id === CLL_SERVER_ID ? "CLL" : "");

    return (
        <ServerBanner
            background={typeof bannerURL !== "undefined"}
            style={{
                backgroundImage: bannerURL ? `url('${bannerURL}')` : undefined,
            }}>
            <div
                className="container"
                onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    openContextMenu(
                        "Menu",
                        { server: server._id },
                        { x: rect.left + 8, y: rect.bottom + 4 },
                    );
                }}>
                {server.flags && server.flags & 1 ? (
                    <Tooltip
                        content={
                            <Text id="app.special.server-badges.official" />
                        }
                        placement={"bottom-start"}>
                        <svg width="20" height="20">
                            <image
                                xlinkHref="/assets/badges/verified.svg"
                                height="20"
                                width="20"
                            />
                            <image
                                xlinkHref="/assets/badges/revolt_r.svg"
                                height="15"
                                width="15"
                                x="2"
                                y="3"
                                style={
                                    "justify-content: center; align-items: center; filter: brightness(0);"
                                }
                            />
                        </svg>
                    </Tooltip>
                ) : undefined}
                {server.flags && server.flags & 2 ? (
                    <Tooltip
                        content={
                            <Text id="app.special.server-badges.verified" />
                        }
                        placement={"bottom-start"}>
                        <svg width="20" height="20">
                            <image
                                xlinkHref="/assets/badges/verified.svg"
                                height="20"
                                width="20"
                            />
                            <foreignObject x="2" y="2" width="15" height="15">
                                <Check
                                    size={15}
                                    color="black"
                                    strokeWidth={8}
                                />
                            </foreignObject>
                        </svg>
                    </Tooltip>
                ) : undefined}
                <span
                    className="title"
                    onDblClick={() =>
                        modalController.push({ type: "server_info", server })
                    }>
                    {server.name}
                </span>
                {serverTag ? (
                    <span className="server-tag" title="Server tag">
                        <span className="diamond">◆</span>
                        {serverTag}
                    </span>
                ) : undefined}
                {infinite || boosts > 0 ? (
                    <span
                        className="boost-badge"
                        title={`Boost level ${level}`}>
                        ◆ {infinite ? "∞" : boosts} · Lv {level}
                    </span>
                ) : undefined}
                <ChevronDown className="chevron" size={18} />
            </div>
        </ServerBanner>
    );
});
