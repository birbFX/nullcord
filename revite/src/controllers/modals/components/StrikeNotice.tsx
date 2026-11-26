import { Modal } from "@revoltchat/ui";

import { noopTrue } from "../../../lib/js";

import { ModalProps } from "../types";

export default function StrikeNotice({
    strikes,
    ...props
}: ModalProps<"strike_notice">) {
    return (
        <Modal
            {...props}
            title="You have been struck"
            actions={[
                {
                    onClick: noopTrue,
                    confirmation: true,
                    children: "I understand",
                },
            ]}>
            <p style={{ marginTop: 0 }}>
                Hey, you have been struck. Please read the rules.
            </p>

            {strikes.length > 1 && (
                <ul>
                    {strikes.map((strike, index) => (
                        <li key={index}>{strike.reason}</li>
                    ))}
                </ul>
            )}

            {strikes.length === 1 && (
                <p>
                    <strong>Reason:</strong> {strikes[0].reason}
                </p>
            )}

            <p>
                <a href="/terms" target="_blank" rel="noreferrer">
                    Read the rules
                </a>
                {" · "}
                <a href="/support" target="_blank" rel="noreferrer">
                    Open support
                </a>
            </p>
        </Modal>
    );
}
