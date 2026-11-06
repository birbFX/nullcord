import { ChevronRight, LinkAlt } from "@styled-icons/boxicons-regular";
import { Server } from "@styled-icons/boxicons-solid";
import { useHistory } from "react-router-dom";
import styled from "styled-components/macro";

import { Text } from "preact-i18n";
import { useState } from "preact/hooks";

import { Modal, ModalForm } from "@revoltchat/ui";

import { useClient } from "../../client/ClientController";
import { mapError } from "../../client/jsx/error";
import { recordQuestEvent } from "../../../lib/quests";
import { ModalProps } from "../types";

const Options = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
`;

const Option = styled.button`
    all: unset;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 700;
    color: var(--dc-header-primary);
    border: 1px solid var(--dc-modifier-selected);
    background: var(--secondary-background);
    transition: background-color 0.1s ease;

    &:hover {
        background: var(--dc-modifier-hover);
    }

    .icon {
        width: 48px;
        height: 48px;
        flex-shrink: 0;
        display: grid;
        place-items: center;
        color: #fff;
        border-radius: 50%;
        background: var(--accent);
    }

    .icon.join {
        background: var(--success);
    }

    .text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .sub {
        font-size: 12px;
        font-weight: 500;
        color: var(--dc-header-secondary);
    }
`;

/**
 * Pull an invite code out of a full invite URL or a bare code.
 */
function parseInvite(input: string) {
    const value = input.trim();
    const match = value.match(/\/invite\/([A-Za-z0-9_-]+)/);
    if (match) return match[1];
    return value.replace(/^.*\//, "");
}

/**
 * "Add a Server" modal: create a new server or join one with an invite,
 * like Discord.
 */
export default function CreateServer({
    ...props
}: ModalProps<"create_server">) {
    const history = useHistory();
    const client = useClient();
    const [step, setStep] = useState<"choose" | "create" | "join">("choose");

    if (step === "choose") {
        return (
            <Modal
                {...props}
                title="Add a Server"
                description="Your server is where you and your friends hang out. Make yours and start talking, or join one with an invite.">
                <Options>
                    <Option onClick={() => setStep("create")}>
                        <span className="icon">
                            <Server size={24} />
                        </span>
                        <span className="text">
                            Create My Own
                            <span className="sub">
                                Start a new server for you and your friends
                            </span>
                        </span>
                        <ChevronRight size={24} />
                    </Option>
                    <Option onClick={() => setStep("join")}>
                        <span className="icon join">
                            <LinkAlt size={24} />
                        </span>
                        <span className="text">
                            Join a Server
                            <span className="sub">
                                Have an invite? Paste it here
                            </span>
                        </span>
                        <ChevronRight size={24} />
                    </Option>
                </Options>
            </Modal>
        );
    }

    if (step === "join") {
        return (
            <ModalForm
                {...props}
                title="Join a Server"
                description="Enter an invite below to join an existing server."
                schema={{
                    invite: "text",
                }}
                data={{
                    invite: {
                        field: "Invite link",
                        placeholder: `${window.location.origin}/invite/abc123`,
                    },
                }}
                callback={async ({ invite }) => {
                    const code = parseInvite(invite);
                    if (!code) throw "InvalidInvite";

                    // Validate before leaving the modal so errors show here.
                    await client.fetchInvite(code).catch(mapError);
                    history.push(`/invite/${code}`);
                }}
                submit={{
                    children: "Join Server",
                }}
                actions={[
                    {
                        palette: "plain",
                        children: "Back",
                        onClick: () => {
                            setStep("choose");
                            return false;
                        },
                    },
                ]}
            />
        );
    }

    return (
        <ModalForm
            {...props}
            title={<Text id="app.main.servers.create" />}
            description={
                <div>
                    By creating this server, you agree to the{" "}
                    <a href="/terms">Terms of Service</a>.
                </div>
            }
            schema={{
                name: "text",
            }}
            data={{
                name: {
                    field: (
                        <Text id="app.main.servers.name" />
                    ) as React.ReactChild,
                },
            }}
            callback={async ({ name }) => {
                const server = await client.servers
                    .createServer({
                        name,
                    })
                    .catch(mapError);

                recordQuestEvent(client.user?._id, "server_created");
                history.push(`/server/${server._id}`);
            }}
            submit={{
                children: <Text id="app.special.modals.actions.create" />,
            }}
            actions={[
                {
                    palette: "plain",
                    children: "Back",
                    onClick: () => {
                        setStep("choose");
                        return false;
                    },
                },
            ]}
        />
    );
}
