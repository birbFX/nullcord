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
import {
    fetchTemplate,
    importTemplate,
    parseTemplateCode,
} from "../../../lib/discordTemplate";
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
    const [step, setStep] = useState<"choose" | "create" | "join" | "template">("choose");
    const [progress, setProgress] = useState("");

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
                    <Option onClick={() => setStep("template")}>
                        <span className="icon join">
                            <LinkAlt size={24} />
                        </span>
                        <span className="text">
                            Import Discord Template
                            <span className="sub">
                                Paste a discord.new template link
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

    if (step === "template") {
        return (
            <ModalForm
                {...props}
                title="Import Discord Template"
                description={
                    progress ||
                    "Paste a Discord template link (discord.new/… or discord.com/template/…). Channels, categories and roles are copied into a new server. Big templates can take a minute."
                }
                schema={{
                    template: "text",
                }}
                data={{
                    template: {
                        field: "Template link",
                        placeholder: "https://discord.new/abc123",
                    },
                }}
                callback={async ({ template }) => {
                    const code = parseTemplateCode(template);
                    if (!code) throw "InvalidTemplate";
                    const data = await fetchTemplate(client, code).catch(() => {
                        throw "That template could not be found.";
                    });
                    let id: string;
                    try {
                        id = await importTemplate(client, data, setProgress);
                    } catch (err) {
                        setProgress("");
                        console.error("Template import failed", err);
                        throw typeof err === "string"
                            ? err
                            : "Import failed, please try again.";
                    }
                    setProgress("");
                    recordQuestEvent(client.user?._id, "server_created");
                    history.push(`/server/${id}`);
                }}
                submit={{
                    children: "Import Server",
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
            callback={async ({ name: rawName }) => {
                const name = (rawName ?? "").trim();
                if (!name) throw "Your server needs a name.";
                // The server exists as soon as the POST succeeds; local
                // bookkeeping failing (or racing the websocket event) must
                // not be reported as a failed create.
                const created: any = await client.api
                    .post("/servers/create", { name })
                    .catch(mapError);
                const serverId: string = created.server._id;

                try {
                    await client.servers.fetch(
                        serverId,
                        created.server,
                        created.channels,
                    );
                } catch (err) {
                    console.warn("Server created but local sync failed", err);
                }

                recordQuestEvent(client.user?._id, "server_created");
                history.push(`/server/${serverId}`);
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
