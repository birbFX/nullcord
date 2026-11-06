import styled, { css } from "styled-components";

export interface Props {
    readonly compact?: boolean | "icon";
    readonly palette?:
        | "primary"
        | "secondary"
        | "plain"
        | "plain-secondary"
        | "accent"
        | "success"
        | "warning"
        | "error";
}

export const Button = styled.button<Props>`
    z-index: 1;

    display: flex;
    align-items: center;
    justify-content: center;

    flex-shrink: 0;
    font-weight: 500;
    font-family: inherit;
    line-height: 16px;
    user-select: none;

    transition: background-color 0.17s ease, color 0.17s ease;

    border: none;
    cursor: pointer;
    border-radius: 3px;

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    ${(props) =>
        props.compact === "icon"
            ? css`
                  height: 38px;
                  width: 38px;
              `
            : props.compact
            ? css`
                  min-width: 60px;
                  font-size: 14px;
                  height: 32px !important;
                  padding: 2px 16px !important;
              `
            : css`
                  height: 38px;
                  min-width: 96px;
                  padding: 2px 16px;
                  font-size: 14px;
              `}

    ${(props) => {
        switch (props.palette) {
            case "secondary":
                return css`
                    color: #fff;
                    background: var(--dc-button-secondary, #4e5058);

                    &:hover {
                        background: var(--dc-button-secondary-hover, #6d6f78);
                    }

                    &:active {
                        background: #80848e;
                    }
                `;
            case "plain":
            case "plain-secondary":
                return css`
                    color: ${props.palette === "plain"
                        ? "var(--dc-header-primary, var(--foreground))"
                        : "var(--secondary-foreground)"};
                    background: transparent;

                    &:hover {
                        text-decoration: underline;
                    }

                    &:active {
                        color: var(--tertiary-foreground);
                    }
                `;
            case "error":
                return css`
                    color: #fff;
                    background: var(--dc-danger, #da373c);

                    &:hover {
                        background: var(--dc-danger-hover, #a12828);
                    }

                    &:active {
                        background: #8f2022;
                    }
                `;
            case "success":
                return css`
                    color: #fff;
                    background: #248046;

                    &:hover {
                        background: #1a6334;
                    }

                    &:active {
                        background: #15562b;
                    }
                `;
            case "warning":
                return css`
                    font-weight: 600;
                    color: var(--warning-contrast);
                    background: var(--warning);

                    &:hover {
                        filter: brightness(1.1);
                    }

                    &:active {
                        filter: brightness(0.9);
                    }
                `;
            default:
            case "accent":
            case "primary":
                return css`
                    color: #fff;
                    background: var(--accent);

                    &:hover {
                        background: var(--dc-accent-hover, #4752c4);
                    }

                    &:active {
                        background: var(--dc-accent-active, #3c45a5);
                    }
                `;
        }
    }}
`;
