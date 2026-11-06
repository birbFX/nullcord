import styled from "styled-components";

export interface Props {
    compact?: boolean;
}

export const Category = styled.div<Props>`
    font-size: 12px;
    font-weight: 600;
    line-height: 16px;
    letter-spacing: 0.02em;
    color: var(--dc-channel-default, var(--tertiary-foreground));
    text-transform: uppercase;

    margin: 0;
    white-space: nowrap;
    padding: ${(props) => (props.compact ? "0 4px" : "18px 8px 4px 8px")};

    display: flex;
    align-items: center;
    flex-direction: row;
    justify-content: space-between;

    &:first-child {
        padding-top: ${(props) => (props.compact ? "0" : "4px")};
    }

    svg {
        cursor: pointer;
    }

    &:hover {
        color: var(--dc-interactive-hover, var(--foreground));
    }
`;
