import { RE_MENTIONS } from "revolt.js";
import styled from "styled-components";

import { clientController } from "../../../controllers/client/ClientController";
import UserShort from "../../common/user/UserShort";
import { createComponent, CustomComponentProps } from "./remarkRegexComponent";

const Mention = styled.a`
    flex-shrink: 0;
    padding: 0 2px;
    align-items: center;
    display: inline-flex;
    vertical-align: baseline;

    cursor: pointer;

    font-weight: 500;
    line-height: inherit;
    text-decoration: none !important;
    color: var(--dc-mention-foreground, #c9cdfb);
    background: rgba(var(--accent-rgb), 0.3);
    border-radius: 3px;

    transition: 50ms ease-out background-color, 50ms ease-out color;

    &::before {
        content: "@";
    }

    &:hover {
        color: #fff;
        background: var(--accent);
    }

    /* Discord renders mentions as plain text: no avatar. */
    img,
    svg,
    [class*="Avatar"] {
        display: none !important;
    }

    * {
        color: inherit !important;
        font-weight: inherit !important;
    }
`;

export function RenderMention({ match }: CustomComponentProps) {
    return (
        <Mention>
            <UserShort
                showServerIdentity
                user={clientController.getAvailableClient().users.get(match)}
            />
        </Mention>
    );
}

const MassMention = styled.span`
    display: inline;
    padding: 0 2px;
    border-radius: 3px;
    background: rgba(var(--accent-rgb), 0.3);
    color: var(--dc-mention-foreground, #c9cdfb);
    font-weight: 500;
    cursor: pointer;
    transition: 50ms ease-out background-color, 50ms ease-out color;

    &:hover {
        color: #fff;
        background: var(--accent);
    }
`;

export function RenderMassMention({ match }: CustomComponentProps) {
    return <MassMention>@{match}</MassMention>;
}

export const remarkMention = createComponent("mention", RE_MENTIONS, (match) =>
    clientController.getAvailableClient().users.has(match),
);

export const remarkMassMention = createComponent(
    "massmention",
    /@(everyone|here)\b/g,
);
