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
                  width: 100%;
                  z-index: 20;
                  position: absolute;

                  &::before {
                      background: var(--primary-background);
                  }
              `
            : css`
                  position: relative;
                  z-index: 2;

                  &::before {
                      background: var(--${props.palette}-header);
                  }
              `}

    /*
     * Always opaque, even on custom themes: an opaque base colour, then the
     * theme surface on top. "background" (not background-color) so gradient
     * theme values render instead of being dropped as invalid.
     */
    isolation: isolate;
    background-color: var(--dc-solid-base, #1e1f22);
    backdrop-filter: none;

    &::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -1;
        pointer-events: none;
    }

    ${(props) =>
        props.withBackground &&
        css`
            align-items: flex-end;
            height: 120px !important;

            text-shadow: 0px 0px 1px black;
        `}
`;
