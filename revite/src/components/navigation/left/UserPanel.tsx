import { Headphone, PhoneOff, Wifi } from "@styled-icons/boxicons-regular";
import { Cog, VolumeMute } from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import { Link, useHistory } from "react-router-dom";
import styled from "styled-components/macro";

import { openContextMenu, useTriggerEvents } from "preact-context-menu";

import { voiceState, VoiceStatus } from "../../../lib/vortex/VoiceState";

import { useApplicationState } from "../../../mobx/State";
import { ALL_SOUNDS } from "../../../mobx/stores/helpers/SAudio";

import { useClient } from "../../../controllers/client/ClientController";
import Tooltip from "../../common/Tooltip";
import UserIcon from "../../common/user/UserIcon";
import UserStatus from "../../common/user/UserStatus";

const DEAFEN_KEY = "nullcord:deafen-snapshot";

const Panel = styled.section`
    flex-shrink: 0;
    margin: 0 !important;
    background: var(--dc-bg-user-panel);
`;

const Account = styled.div`
    height: var(--dc-user-panel-height);
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
    font-size: 14px;
`;

const Identity = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 2px;
    margin-left: -2px;
    margin-right: 8px;
    border-radius: 4px;
    cursor: pointer;
    user-select: none;

    &:hover {
        background: var(--dc-modifier-selected);
    }

    .text {
        min-width: 0;
        display: flex;
        flex-direction: column;
        line-height: 1.2;
    }

    .name {
        font-weight: 600;
        color: var(--dc-header-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .sub {
        font-size: 12px;
        color: var(--dc-header-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
`;

const Action = styled.button<{ danger?: boolean }>`
    all: unset;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    cursor: pointer;
    border-radius: 4px;
    color: ${(props) =>
        props.danger ? "var(--error)" : "var(--dc-interactive-normal)"};

    &:hover {
        color: ${(props) =>
            props.danger ? "var(--error)" : "var(--dc-interactive-hover)"};
        background: var(--dc-modifier-selected);
    }
`;

const VoiceBar = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-bottom: 1px solid var(--dc-modifier-selected);

    .info {
        flex: 1;
        min-width: 0;
        line-height: 1.2;
    }

    .state {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 14px;
        font-weight: 600;
        color: var(--success);
    }

    .room {
        font-size: 12px;
        color: var(--dc-header-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        a {
            color: inherit;
        }

        a:hover {
            text-decoration: underline;
        }
    }
`;

const VoiceConnected = observer(() => {
    const client = useClient();
    const history = useHistory();

    const connecting = [
        VoiceStatus.CONNECTING,
        VoiceStatus.AUTHENTICATING,
        VoiceStatus.RTC_CONNECTING,
    ].includes(voiceState.status);

    if (voiceState.status !== VoiceStatus.CONNECTED && !connecting) {
        return null;
    }

    const channel = voiceState.roomId
        ? client.channels.get(voiceState.roomId)
        : undefined;
    if (!channel) return null;

    const path = channel.server_id
        ? `/server/${channel.server_id}/channel/${channel._id}`
        : `/channel/${channel._id}`;

    const name =
        channel.channel_type === "DirectMessage"
            ? channel.recipient?.username
            : channel.name;

    return (
        <VoiceBar>
            <Wifi size={20} color="var(--success)" />
            <div className="info">
                <div className="state">
                    {connecting
                        ? "Connecting…"
                        : "Voice Connected"}
                </div>
                <div className="room">
                    <a onClick={() => history.push(path)}>
                        {name}
                        {channel.server ? ` / ${channel.server.name}` : ""}
                    </a>
                </div>
            </div>
            <Tooltip content="Disconnect" placement="top">
                <Action onClick={() => voiceState.disconnect()}>
                    <PhoneOff size={20} />
                </Action>
            </Tooltip>
        </VoiceBar>
    );
});

/**
 * Discord-style account panel pinned to the bottom of the channel sidebar.
 */
export default observer(() => {
    const client = useClient();
    const state = useApplicationState();
    const user = client.user;
    const sounds = state.settings.sounds;

    const deafened = sounds.getState().every((sound) => !sound.enabled);

    const toggleDeafen = () => {
        if (deafened) {
            let snapshot: string[] | null = null;
            try {
                snapshot = JSON.parse(localStorage.getItem(DEAFEN_KEY) ?? "null");
            } catch {
                // ignore
            }
            for (const id of ALL_SOUNDS) {
                sounds.setEnabled(id, snapshot ? snapshot.includes(id) : true);
            }
        } else {
            try {
                localStorage.setItem(
                    DEAFEN_KEY,
                    JSON.stringify(
                        sounds
                            .getState()
                            .filter((sound) => sound.enabled)
                            .map((sound) => sound.id),
                    ),
                );
            } catch {
                // ignore
            }
            for (const id of ALL_SOUNDS) sounds.setEnabled(id, false);
        }
    };

    const statusMenu = useTriggerEvents("Status", {});

    if (!user) return null;

    return (
        <Panel aria-label="User area">
            <VoiceConnected />
            <Account>
                <Identity
                    {...statusMenu}
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        openContextMenu(
                            "Status",
                            {},
                            { x: rect.left, y: rect.top - 8 },
                        );
                    }}>
                    <UserIcon target={user} size={32} status />
                    <div className="text">
                        <span className="name">
                            {user.display_name ?? user.username}
                        </span>
                        <span className="sub">
                            <UserStatus user={user} />
                        </span>
                    </div>
                </Identity>
                <Tooltip
                    content={deafened ? "Undeafen" : "Deafen"}
                    placement="top">
                    <Action
                        danger={deafened}
                        aria-label={deafened ? "Undeafen" : "Deafen"}
                        onClick={toggleDeafen}>
                        {deafened ? (
                            <VolumeMute size={20} />
                        ) : (
                            <Headphone size={20} />
                        )}
                    </Action>
                </Tooltip>
                <Tooltip content="User Settings" placement="top">
                    <Link to="/settings">
                        <Action aria-label="User Settings">
                            <Cog size={20} />
                        </Action>
                    </Link>
                </Tooltip>
            </Account>
        </Panel>
    );
});
