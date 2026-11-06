import { observer } from "mobx-react-lite";
import { Channel } from "revolt.js";
import styled from "styled-components/macro";

import { Text } from "preact-i18n";

interface Props {
    channel: Channel;
}

const Base = styled.div`
    position: relative;

    > div {
        height: 20px;
        top: -20px;
        left: 16px;
        right: 16px;
        position: absolute;
        font-size: 14px;
        font-weight: 500;
        gap: 6px;
        display: flex;
        padding: 0 4px;
        user-select: none;
        align-items: center;
        flex-direction: row;
        color: var(--dc-header-secondary);

        b,
        strong {
            font-weight: 700;
            color: var(--dc-header-primary);
        }
    }

    .avatars {
        display: flex;

        img {
            width: 16px;
            height: 16px;
            object-fit: cover;
            border-radius: var(--border-radius-half);
            background: var(--primary-background);
            border: 2px solid var(--primary-background);

            &:not(:first-child) {
                margin-left: -6px;
            }
        }
    }

    .usernames {
        min-width: 0;
        font-size: 14px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        //font-weight: 600;
    }
`;

export default observer(({ channel }: Props) => {
    const users = channel.typing.filter(
        (x) =>
            typeof x !== "undefined" &&
            x._id !== x.client.user!._id &&
            x.relationship !== "Blocked",
    );

    if (users.length > 0) {
        users.sort((a, b) =>
            a!._id.toUpperCase().localeCompare(b!._id.toUpperCase()),
        );

        let text;
        if (users.length >= 5) {
            text = <Text id="app.main.channel.typing.several" />;
        } else if (users.length > 1) {
            const userlist = [...users].map(
                (x) => x!.display_name ?? x!.username,
            );
            const user = userlist.pop();

            text = (
                <Text
                    id="app.main.channel.typing.multiple"
                    fields={{
                        user,
                        userlist: userlist.join(", "),
                    }}
                />
            );
        } else {
            text = (
                <Text
                    id="app.main.channel.typing.single"
                    fields={{
                        user: users[0]!.display_name ?? users[0]!.username,
                    }}
                />
            );
        }

        return (
            <Base>
                <div>
                    <div className="avatars">
                        {users.map((user) => (
                            <img
                                key={user!._id}
                                loading="eager"
                                src={user!.generateAvatarURL({ max_side: 256 })}
                            />
                        ))}
                    </div>
                    <div className="usernames">{text}</div>
                </div>
            </Base>
        );
    }

    return null;
});
