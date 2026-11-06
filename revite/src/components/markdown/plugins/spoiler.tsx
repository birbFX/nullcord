import styled, { css } from "styled-components";

import { useState } from "preact/hooks";

import { createComponent, CustomComponentProps } from "./remarkRegexComponent";

const Spoiler = styled.span<{ shown: boolean }>`
    padding: 0 2px;
    cursor: pointer;
    user-select: none;
    color: transparent;
    background: #1e1f22;
    border-radius: 4px;
    transition: background-color 0.1s ease;

    &:hover {
        background: #111214;
    }

    > * {
        opacity: 0;
        pointer-events: none;
    }

    ${(props) =>
        props.shown &&
        css`
            cursor: auto;
            user-select: all;
            color: var(--foreground);
            background: rgba(255, 255, 255, 0.1);

            &:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            > * {
                opacity: 1;
                pointer-events: unset;
            }
        `}
`;

export function RenderSpoiler({ match }: CustomComponentProps) {
    const [shown, setShown] = useState(false);

    return (
        <Spoiler shown={shown} onClick={() => setShown(true)}>
            {match}
        </Spoiler>
    );
}

export const remarkSpoiler = createComponent("spoiler", /!!([^!]+)!!/g);

// Discord-style ||spoiler|| syntax.
export const remarkSpoilerPipes = createComponent(
    "spoiler",
    /\|\|([^|\n]+)\|\|/g,
);
