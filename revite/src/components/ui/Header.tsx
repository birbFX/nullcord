import { Menu } from "@styled-icons/boxicons-regular";
import { observer } from "mobx-react-lite";
import styled, { css } from "styled-components/macro";

import { Header } from "@revoltchat/ui";

import { isTouchscreenDevice } from "../../lib/isTouchscreenDevice";

import { useApplicationState } from "../../mobx/State";
import { SIDEBAR_CHANNELS } from "../../mobx/stores/Layout";

interface Props {
    topBorder?: boolean;
    bottomBorder?: boolean;

    withBackground?: boolean;
    withTransparency?: boolean;
    placement: "primary" | "secondary";
}

const IconContainer = styled.div`
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--dc-channel-icon, #80848e);
    margin-right: 0;

    > svg:not(:only-child) {
        margin-right: 0;
    }

    ${!isTouchscreenDevice &&
    css`
        &:hover {
            color: var(--dc-interactive-hover);
        }
    `}
`;

type PageHeaderProps = Omit<Props, "placement" | "borders"> & {
    noBurger?: boolean;
    children: Children;
    icon: Children;
};

export const PageHeader = observer(
    ({ children, icon, noBurger, ...props }: PageHeaderProps) => {
        const layout = useApplicationState().layout;

        return (
            <Header
                {...props}
                palette="primary"
                topBorder={false}
                bottomBorder={false}>
                {!noBurger && <HamburgerAction />}
                <IconContainer
                    onClick={() =>
                        layout.toggleSectionState(SIDEBAR_CHANNELS, true)
                    }>
                    {icon}
                </IconContainer>
                {children}
            </Header>
        );
    },
);

export function HamburgerAction() {
    if (!isTouchscreenDevice) return null;

    function openSidebar() {
        document
            .querySelector("#app > div > div > div")
            ?.scrollTo({ behavior: "smooth", left: 0 });
    }

    return (
        <div className="menu" onClick={openSidebar}>
            <Menu size={27} />
        </div>
    );
}
