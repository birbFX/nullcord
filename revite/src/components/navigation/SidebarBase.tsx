import styled, { css } from "styled-components/macro";

import { isTouchscreenDevice } from "../../lib/isTouchscreenDevice";

export default styled.div`
    height: 100%;
    display: flex;
    user-select: none;
    flex-direction: row;
    align-items: stretch;
    background: var(--background);
`;

/**
 * Channel sidebar column: list on top, user panel pinned to the bottom.
 */
export const SidebarColumn = styled.div`
    height: 100%;
    min-width: 0;
    width: var(--dc-sidebar-width);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--secondary-background);

    > :first-child {
        flex: 1;
        min-height: 0;
    }

    ${isTouchscreenDevice &&
    css`
        padding-bottom: 50px;
    `}
`;

export const GenericSidebarBase = styled.div<{
    mobilePadding?: boolean;
}>`
    height: 100%;
    width: 100%;
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    background: var(--secondary-background);
`;

export const GenericSidebarList = styled.div.attrs({
    className: "dc-thin-scroller",
})`
    padding: 8px;
    flex-grow: 1;
    overflow-y: auto;

    > img {
        width: 100%;
    }
`;
