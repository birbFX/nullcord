import styled from "styled-components/macro";

const Svg = styled.svg<{ $size: number }>`
    width: ${(p) => p.$size}px;
    height: ${(p) => p.$size}px;
    flex-shrink: 0;
    color: #f7c948;
    vertical-align: -0.15em;
    margin-inline-start: 4px;
    filter: drop-shadow(0 0 4px rgba(247, 201, 72, 0.45));
`;

/**
 * Small gold crown shown next to the owner's name everywhere the shared
 * Username component is used (messages, member list, hovers, profiles).
 *
 * Deliberately not wrapped in Tooltip: that renders a block-level div, which
 * would break inline username rendering. The <title> gives a native tooltip.
 */
export default function OwnerCrown({
    size = 14,
    title = "Owner",
}: {
    size?: number;
    title?: string;
}) {
    return (
        <Svg
            $size={size}
            viewBox="0 0 24 24"
            fill="currentColor"
            role="img"
            aria-label={title}>
            <title>{title}</title>
            <path d="M3 7.2 8.2 11 12 5l3.8 6L21 7.2l-2.3 11.3H5.3L3 7.2Z" />
            <rect x="5.3" y="19.3" width="13.4" height="1.8" rx="0.9" />
        </Svg>
    );
}
