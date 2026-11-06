import styled from "styled-components";

import { useCallback, useRef } from "preact/hooks";

import { Tooltip } from "@revoltchat/ui";

import { modalController } from "../../../controllers/modals/ModalController";

/**
 * Base codeblock styles
 */
const Base = styled.pre`
    margin: 6px 0 0;
    padding: 0.5em;
    max-width: 90%;
    overflow-x: auto;
    font-size: 0.875rem;
    line-height: 1.125rem;
    background: var(--block);
    border: 1px solid var(--background);
    border-radius: 4px;
    position: relative;

    &:hover > div a {
        opacity: 1;
    }

    code {
        border: none;
        background: none;
        font-size: inherit;
        white-space: pre-wrap;
    }
`;

/**
 * Copy codeblock contents button styles
 */
const Lang = styled.div`
    position: absolute;
    top: 4px;
    right: 4px;
    font-family: var(--font), sans-serif;

    a {
        opacity: 0;
        cursor: pointer;
        padding: 2px 8px;
        font-weight: 500;
        user-select: none;
        display: inline-block;
        color: var(--secondary-foreground);
        background: var(--secondary-background);
        border: 1px solid var(--background);

        font-size: 12px;
        border-radius: 4px;
        transition: opacity 0.1s ease;

        &:hover {
            color: var(--foreground);
        }

        &:active {
            transform: translateY(1px);
        }
    }
`;

/**
 * Render a codeblock with copy text button
 */
export const RenderCodeblock: React.FC<{ class: string }> = ({
    children,
    ...props
}) => {
    const ref = useRef<HTMLPreElement>(null);

    let text = "text";
    if (props.class) {
        text = props.class.split("-")[1];
    }

    const onCopy = useCallback(() => {
        const text = ref.current?.querySelector("code")?.innerText;
        text && modalController.writeText(text);
    }, [ref]);

    return (
        <Base ref={ref}>
            <Lang>
                <Tooltip content="Copy to Clipboard" placement="top">
                    {/**
                    // @ts-expect-error Preact-React */}
                    <a onClick={onCopy}>{text}</a>
                </Tooltip>
            </Lang>
            {children}
        </Base>
    );
};
