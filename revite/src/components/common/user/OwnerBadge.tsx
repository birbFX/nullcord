import styled, { keyframes } from "styled-components/macro";

import Tooltip from "../Tooltip";

const spin = keyframes`
    to {
        transform: rotate(360deg);
    }
`;

const Wrap = styled.div<{ $size: number }>`
    position: relative;
    width: ${(p) => p.$size}px;
    height: ${(p) => p.$size}px;
    display: inline-grid;
    place-items: center;
    flex-shrink: 0;
    filter: drop-shadow(0 0 5px rgba(59, 130, 246, 0.55));
`;

const Ring = styled.span`
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px dashed #60a5fa;
    animation: ${spin} 6s linear infinite;
`;

const Core = styled.span<{ $size: number }>`
    width: 68%;
    height: 68%;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    font-weight: 800;
    font-size: ${(p) => Math.max(8, Math.round(p.$size * 0.38))}px;
    line-height: 1;
    background: radial-gradient(circle at 35% 25%, #93c5fd, #3b82f6 55%, #1d4ed8);
    border: 1px solid rgba(255, 255, 255, 0.5);
`;

/**
 * Rotating blue "NullCord Owner" badge.
 */
export default function OwnerBadge({
    size = 24,
    title = "NullCord Owner",
}: {
    size?: number;
    title?: string;
}) {
    return (
        <Tooltip content={title}>
            <Wrap $size={size} role="img" aria-label={title}>
                <Ring />
                <Core $size={size}>N</Core>
            </Wrap>
        </Tooltip>
    );
}
