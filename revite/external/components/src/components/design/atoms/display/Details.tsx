import styled, { css } from "styled-components";

export interface Props {
    sticky?: boolean;
    large?: boolean;
}

export const Details = styled.details<Props>`
    // ! FIXME: clean up CSS
    summary {
        ${(props) =>
            props.sticky &&
            css`
                top: -1px;
                z-index: 10;
                position: sticky;
            `}

        ${(props) =>
            props.large &&
            css`
                /*padding: 5px 0;*/
                background: var(--primary-background);
                color: var(--secondary-foreground);

                .padding {
                    /*TOFIX: make this applicable only for the friends list menu, DO NOT REMOVE.*/
                    display: flex;
                    align-items: center;
                    padding: 5px 0;
                    margin: 0.8em 0px 0.4em;
                    cursor: pointer;
                }
            `}

        outline: none;
        cursor: pointer;
        list-style: none;
        user-select: none;
        align-items: center;
        transition: 0.2s opacity;

        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--dc-channel-default, var(--tertiary-foreground));

        &::marker,
        &::-webkit-details-marker {
            display: none;
        }

        .title {
            flex-grow: 1;
            margin-top: 1px;
            text-overflow: ellipsis;
            overflow: hidden;
            white-space: nowrap;
        }

        .padding {
            display: flex;
            align-items: center;
            ${(props) =>
                !props.large &&
                css`
                    padding-top: 16px;
                `}

            > svg {
                flex-shrink: 0;
                margin-inline-start: -2px;
                margin-inline-end: -6px;
                transition: 0.1s ease-out transform;
            }

            > div {
                padding-top: 0;
                padding-bottom: 4px;
                color: inherit;
            }
        }

        &:hover {
            color: var(--dc-interactive-hover, var(--foreground));
        }

        gap: 4px;
        display: flex;
        align-items: center;
    }

    &:not([open]) {
        summary svg {
            transform: rotateZ(-90deg);
        }
    }
`;
