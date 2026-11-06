import styled, { css } from "styled-components";

export interface Props {
    readonly palette?: "primary" | "secondary";
}

export const InputBox = styled.input<Props>`
    width: 100%;
    height: 40px;
    padding: 10px;

    font-size: 16px;
    font-family: inherit;
    font-weight: 400;

    border: none;
    border-radius: 3px;
    box-sizing: border-box;
    outline: none;

    color: var(--foreground);
    background: var(--dc-bg-input, var(--background));

    transition: box-shadow 0.15s ease;

    &::placeholder {
        color: var(--tertiary-foreground);
    }

    &:disabled {
        filter: brightness(0.9);
    }

    &:focus-visible {
        box-shadow: 0 0 0 2px var(--dc-text-link, var(--accent));
    }

    ${(props) =>
        props.palette === "secondary" &&
        css`
            color: var(--foreground);
        `}
`;
