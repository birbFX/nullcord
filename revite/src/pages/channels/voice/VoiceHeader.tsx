import { observer } from "mobx-react-lite";
import styled from "styled-components/macro";

import { useClient } from "../../../controllers/client/ClientController";
import { voiceState } from "../../../lib/vortex/VoiceState";

import { JitsiCall } from "./JitsiCall";

interface Props {
    id: string;
    embedded?: boolean;
}

const CallBase = styled.div<{ embedded?: boolean }>`
    flex-grow: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
    box-sizing: border-box;
    padding-top: ${(props) =>
        props.embedded ? "var(--header-height)" : "0"};
    background: #000;
`;

export default observer(({ id, embedded }: Props) => {
    const client = useClient();

    if (voiceState.roomId !== id) return null;

    const self = client.user;
    const displayName =
        self?.display_name || self?.username || "NullCord user";

    return (
        <CallBase embedded={embedded}>
            <JitsiCall id={id} displayName={displayName} />
        </CallBase>
    );
});
