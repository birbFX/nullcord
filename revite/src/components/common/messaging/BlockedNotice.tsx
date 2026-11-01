import { observer } from "mobx-react-lite";
import styled from "styled-components/macro";

import { dayjs } from "../../../context/Locale";
import { localNotices } from "../../../mobx/stores/LocalNotices";
import MessageBase, {
    MessageContent,
    MessageInfo,
} from "./MessageBase";

const Avatar = styled.img`
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    background: var(--secondary-background);
`;

const Detail = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--tertiary-foreground);
`;

const Author = styled.span`
    cursor: default;
    font-size: var(--text-size);
    font-weight: 600;
    color: var(--foreground);
`;

const AppBadge = styled.span`
    padding: 1px 3px;
    border-radius: 3px;
    color: #fff;
    background: var(--accent);
    font-size: 9px;
    font-weight: 700;
    line-height: 12px;
    text-transform: uppercase;
`;

const Copy = styled.div`
    color: var(--foreground);
    font-size: var(--text-size);
    line-height: 1.35;

    & + & {
        margin-top: 8px;
    }

    a {
        color: var(--accent);
        text-decoration: none;

        &:hover {
            text-decoration: underline;
        }
    }
`;

const OnlyYou = styled.div`
    margin-top: 8px;
    color: var(--tertiary-foreground);
    font-size: 11px;

    button {
        all: unset;
        color: var(--secondary-foreground);
        cursor: pointer;
        text-decoration: underline;

        &:hover {
            color: var(--foreground);
        }
    }

    span {
        margin: 0 3px;
    }
`;

const Notice = observer(
    ({
        id,
        channelId,
        createdAt,
    }: {
        id: string;
        channelId: string;
        createdAt: number;
    }) => (
        <MessageBase role="status">
            <MessageInfo click={false}>
                <Avatar src="/assets/logo.png" alt="" />
            </MessageInfo>
            <MessageContent>
                <Detail>
                    <Author>Clyde</Author>
                    <AppBadge>APP</AppBadge>
                    <time>{dayjs(createdAt).format("h:mm A")}</time>
                </Detail>
                <Copy>Your message could not be delivered.</Copy>
                <Copy>
                    You can see the full list of reasons here:{" "}
                    <a
                        href="https://support.canyonlakelabs.com/"
                        target="_blank"
                        rel="noreferrer">
                        https://support.canyonlakelabs.com/
                    </a>
                </Copy>
                <OnlyYou>
                    Only you can see this
                    <span>•</span>
                    <button
                        type="button"
                        onClick={() => localNotices.dismiss(channelId, id)}>
                        Dismiss message
                    </button>
                </OnlyYou>
            </MessageContent>
        </MessageBase>
    ),
);

export const BlockedNotices = observer(
    ({ channelId }: { channelId: string }) => {
        const notices = localNotices.get(channelId);
        return (
            <>
                {notices.map((notice) => (
                    <Notice key={notice.id} {...notice} />
                ))}
            </>
        );
    },
);
