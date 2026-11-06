import styled, { css } from "styled-components";

export interface Props {
    readonly palette: "primary" | "secondary";

    readonly topBorder?: boolean;
    readonly bottomBorder?: boolean;

    readonly withBackground?: boolean;
    readonly withTransparency?: boolean;
}

export const Header = styled.div<Props>`
    gap: 8px;
    flex: 0 auto;
    display: flex;
    flex-shrink: 0;
    padding: 0 8px 0 16px;
    align-items: center;

    font-size: 16px;
    font-weight: 600;
    line-height: 20px;
    user-select: none;

    height: var(--header-height);

    color: var(--dc-header-primary, var(--foreground));
    background-size: cover !important;
    background-position: center !important;
    box-shadow: var(
        --dc-elevation-low,
        0 1px 0 rgba(4, 4, 5, 0.2),
        0 1.5px 0 rgba(6, 6, 7, 0.05),
        0 2px 0 rgba(4, 4, 5, 0.05)
    );

    svg {
        flex-shrink: 0;
    }

    ${(props) =>
        props.withTransparency
            ? css`
                  background-color: var(--primary-background);

                  width: 100%;
                  z-index: 20;
                  position: absolute;
              `
            : css`
                  position: relative;
                  z-index: 2;
                  background-color: var(--${props.palette}-header);
              `}

    ${(props) =>
        props.withBackground &&
        css`
            align-items: flex-end;
            height: 120px !important;

            text-shadow: 0px 0px 1px black;
        `}
`;
