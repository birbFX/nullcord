import { useHistory } from "react-router-dom";

import { Text } from "preact-i18n";

import { ModalForm } from "@revoltchat/ui";

import { setForum } from "../../../lib/forums";
import { ModalProps } from "../types";

/**
 * Channel creation modal
 */
export default function CreateChannel({
    cb,
    target,
    ...props
}: ModalProps<"create_channel">) {
    const history = useHistory();

    return (
        <ModalForm
            {...props}
            title={<Text id="app.context_menu.create_channel" />}
            schema={{
                name: "text",
                type: "radio",
            }}
            data={{
                name: {
                    field: (
                        <Text id="app.main.servers.channel_name" />
                    ) as React.ReactChild,
                },
                type: {
                    field: (
                        <Text id="app.main.servers.channel_type" />
                    ) as React.ReactChild,
                    choices: [
                        {
                            name: (
                                <Text id="app.main.servers.text_channel" />
                            ) as React.ReactChild,
                            value: "Text",
                        },
                        {
                            name: (
                                <Text id="app.main.servers.voice_channel" />
                            ) as React.ReactChild,
                            value: "Voice",
                        },
                        {
                            name: "Forum" as any,
                            value: "Forum",
                        },
                    ],
                },
            }}
            defaults={{
                type: "Text",
            }}
            callback={async ({ name: rawName, type }) => {
                const name = (rawName ?? "").trim();
                if (!name) throw "Your channel needs a name.";

                const channel = await target.createChannel({
                    type: type === "Voice" ? "Voice" : "Text",
                    name,
                });
                if (type === "Forum") {
                    await setForum(target._id, channel._id, true).catch(
                        (err) => console.warn("Could not mark forum", err),
                    );
                }

                if (cb) {
                    cb(channel as any);
                } else {
                    history.push(
                        `/server/${target._id}/channel/${channel._id}`,
                    );
                }
            }}
            submit={{
                children: <Text id="app.special.modals.actions.create" />,
            }}
        />
    );
}
