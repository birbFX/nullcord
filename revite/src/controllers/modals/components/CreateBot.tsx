import { Text } from "preact-i18n";

import { ModalForm } from "@revoltchat/ui";

import { useClient } from "../../client/ClientController";
import { takeError } from "../../client/jsx/error";
import { ModalProps } from "../types";

const BOT_NAME = /^[\p{L}\d_.-]+(?: [\p{L}\d_.-]+)*$/u;

function validateBotName(value: string) {
    const name = value.trim();
    if (name.length < 2 || name.length > 35)
        return "Bot username must be between 2 and 35 characters.";
    if (!BOT_NAME.test(name))
        return "Use only letters, numbers, spaces, dots, dashes and underscores. Spaces cannot be repeated or at the start/end.";
    return null;
}

/**
 * Bot creation modal
 */
export default function CreateBot({
    onCreate,
    ...props
}: ModalProps<"create_bot">) {
    const client = useClient();

    return (
        <ModalForm
            {...props}
            title={<Text id="app.special.popovers.create_bot.title" />}
            schema={{
                name: "text",
            }}
            data={{
                name: {
                    field: (<Text id="login.username" />) as React.ReactChild,
                },
            }}
            callback={async ({ name }) => {
                const trimmed = String(name ?? "").trim();
                const invalid = validateBotName(trimmed);
                if (invalid) throw invalid;

                const { bot } = await client.bots
                    .create({ name: trimmed })
                    .catch((error) => {
                        const data = error?.response?.data;
                        if (data?.type === "FailedValidation")
                            throw "Bot username must be 2-35 characters and use only letters, numbers, spaces, dots, dashes and underscores. Spaces cannot be repeated or at the start/end.";
                        throw takeError(error);
                    });

                onCreate(bot);
            }}
            submit={{
                children: <Text id="app.special.modals.actions.create" />,
            }}
        />
    );
}
