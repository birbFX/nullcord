import styled from "styled-components";

import { Text } from "preact-i18n";
import { useEffect, useState } from "preact/hooks";

import { ModalForm } from "@revoltchat/ui";

import { noopAsync } from "../../../lib/js";
import { recordInviteCreated } from "../../../lib/quests";
import { useClient } from "../../client/ClientController";

import { takeError } from "../../client/jsx/error";
import { modalController } from "../ModalController";
import { ModalProps } from "../types";

/**
 * Code block which displays invite
 */
const Invite = styled.div`
    display: flex;
    flex-direction: column;

    code {
        padding: 1em;
        user-select: all;
        font-size: 1.4em;
        text-align: center;
        font-family: var(--monospace-font);
    }

    .error {
        color: var(--error);
        padding: 1em;
        text-align: center;
        user-select: text;
    }
`;

/**
 * Create invite modal
 */
export default function CreateInvite({
    target,
    ...props
}: ModalProps<"create_invite">) {
    const client = useClient();
    const [processing, setProcessing] = useState(true);
    const [code, setCode] = useState<string>();
    const [error, setError] = useState<string>();

    const generate = () => {
        setProcessing(true);
        setError(undefined);
        setCode(undefined);

        target
            .createInvite()
            .then(({ _id }) => {
                setCode(_id);
                recordInviteCreated(
                    client.user?._id,
                    target.server_id,
                    _id,
                );
            })
            .catch((err) => setError(String(takeError(err))))
            .finally(() => setProcessing(false));
    };

    // Generate an invite code
    useEffect(generate, [target]);

    const copyLink = () => {
        if (!code) return;
        modalController.writeText(`${window.location.origin}/invite/${code}`);
    };

    return (
        <ModalForm
            {...props}
            title={<Text id={`app.context_menu.create_invite`} />}
            schema={{
                message: "custom",
            }}
            data={{
                message: {
                    element: processing ? (
                        <Text id="app.special.modals.prompt.create_invite_generate" />
                    ) : error ? (
                        <Invite>
                            <div className="error">
                                Could not create invite: {error}
                            </div>
                        </Invite>
                    ) : (
                        <Invite>
                            <Text id="app.special.modals.prompt.create_invite_created" />
                            <code>{code}</code>
                        </Invite>
                    ),
                },
            }}
            callback={noopAsync}
            submit={{
                children: <Text id="app.special.modals.actions.ok" />,
            }}
            actions={[
                ...(error
                    ? [
                          {
                              children: "Retry",
                              onClick: generate,
                          },
                      ]
                    : []),
                ...(code
                    ? [
                          {
                              children: (
                                  <Text id="app.context_menu.copy_link" />
                              ),
                              onClick: copyLink,
                          },
                      ]
                    : []),
            ]}
        />
    );
}
