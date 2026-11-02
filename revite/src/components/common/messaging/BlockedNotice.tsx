import { Show } from "@styled-icons/boxicons-regular";
import { observer } from "mobx-react-lite";
import styled from "styled-components/macro";

import { dayjs } from "../../../context/Locale";
import { localNotices } from "../../../mobx/stores/LocalNotices";
import MessageBase, {
    MessageContent,
    MessageInfo,
} from "./MessageBase";

const Row = styled.div`
    margin: 2px 0;
    border-left: 3px solid #5865f2;
    border-radius: 0 5px 5px 0;
    background:
        linear-gradient(90deg, rgba(237, 66, 69, 0.2), rgba(237, 66, 69, 0.06)),
        var(--background);
`;

const NoticeBase = styled(MessageBase)`
    background: transparent !important;

    &:hover {
        background: transparent !important;
    }
`;

const SystemAvatar = styled.div`
    width: 36px;
    height: 36px;
    overflow: hidden;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 20%, #54d9ff, #5865f2 68%);
    box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.28);

    svg {
        display: block;
        width: 100%;
        height: 100%;
    }
`;

const Detail = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--tertiary-foreground);

    time {
        font-size: 10px;
    }
`;

const Author = styled.span`
    cursor: default;
    color: var(--foreground);
    font-size: 15px;
    font-weight: 700;
`;

const AppBadge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 4px;
    border-radius: 3px;
    color: #fff;
    background: #5865f2;
    font-size: 9px;
    font-weight: 800;
    line-height: 12px;
    letter-spacing: 0.03em;
    text-transform: uppercase;

    .check {
        font-size: 8px;
        line-height: 1;
    }
`;

const Copy = styled.div`
    color: var(--foreground);
    font-size: 15px;
    line-height: 1.4;

    & + & {
        margin-top: 18px;
    }

    &.status {
        font-weight: 600;
    }

    a {
        color: #00a8fc;
        text-decoration: none;
        overflow-wrap: anywhere;

        &:hover {
            text-decoration: underline;
        }
    }
`;

const OnlyYou = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 9px;
    color: var(--tertiary-foreground);
    font-size: 11px;

    svg {
        flex-shrink: 0;
        margin-right: 2px;
    }

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
        <Row>
            <NoticeBase role="status">
                <MessageInfo click={false}>
                    <SystemAvatar aria-hidden="true">
                        <svg viewBox="0 0 36 36">
                            <path
                                d="M18 4.5 29 9v8.5c0 7.1-4.6 11.6-11 14.5-6.4-2.9-11-7.4-11-14.5V9L18 4.5Z"
                                fill="#11152a"
                            />
                            <path
                                d="M18 9.5 25.5 12.6v5c0 4.7-3 8.1-7.5 10.4-4.5-2.3-7.5-5.7-7.5-10.4v-5L18 9.5Z"
                                fill="none"
                                stroke="#9cf8ff"
                                strokeWidth="1.5"
                            />
                            <path
                                d="M18 13v6"
                                stroke="#9cf8ff"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                            />
                            <circle cx="18" cy="23.5" r="1.5" fill="#9cf8ff" />
                        </svg>
                    </SystemAvatar>
                </MessageInfo>
                <MessageContent>
                    <Detail>
                        <Author>NullCord System</Author>
                        <AppBadge>
                            <span className="check">✓</span> APP
                        </AppBadge>
                        <time>{dayjs(createdAt).format("h:mm A")}</time>
                    </Detail>
                    <Copy className="status">Unavailable</Copy>
                    <Copy>
                        You can see the full list of reasons here:{" "}
                        <a
                            href="https://support.canyonlakelabs.com/topics/nullcord"
                            target="_blank"
                            rel="noreferrer">
                            https://support.canyonlakelabs.com/topics/nullcord
                        </a>
                    </Copy>
                    <OnlyYou>
                        <Show size={13} />
                        Only you can see this
                        <span>•</span>
                        <button
                            type="button"
                            onClick={() => localNotices.dismiss(channelId, id)}>
                            Dismiss message
                        </button>
                    </OnlyYou>
                </MessageContent>
            </NoticeBase>
        </Row>
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
