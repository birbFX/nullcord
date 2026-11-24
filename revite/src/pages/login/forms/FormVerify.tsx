import { useHistory, useParams, Link } from "react-router-dom";

import { useEffect, useState } from "preact/hooks";
import { Text } from "preact-i18n";

import { Category, Preloader } from "@revoltchat/ui";

import { useApi } from "../../../controllers/client/ClientController";
import { takeError } from "../../../controllers/client/jsx/error";
import { Form } from "./Form";

export function FormResend() {
    const api = useApi();

    return (
        <Form
            page="resend"
            callback={async (data) => {
                await api.post("/auth/account/reverify", data);
            }}
        />
    );
}

export function FormVerify() {
    const [error, setError] = useState<undefined | string>(undefined);
    const [verifying, setVerifying] = useState(true);
    const { token } = useParams<{ token: string }>();
    const history = useHistory();
    const api = useApi();

    useEffect(() => {
        api.post(`/auth/account/verify/${token as ""}`)
            .then(() => {
                setVerifying(false);
                history.push("/login");
            })
            .catch((err) => {
                setError(takeError(err));
                setVerifying(false);
            });
        // eslint-disable-next-line
    }, []);

    if (verifying) return <Preloader type="ring" />;

    if (!error) {
        return (
            <Category>
                <Text id="login.verified_account" />
            </Category>
        );
    }

    return (
        <Category>
            <p style={{ fontSize: "0.9em", marginBottom: "1em" }}>
                <Text id={`error.${error}`} children={error} />
            </p>
            <p style={{ fontSize: "0.85em" }}>
                <Link to="/login/resend">
                    <Text id="login.resend" />
                </Link>
            </p>
            <p style={{ fontSize: "0.85em" }}>
                <Link to="/login">
                    <Text id="login.remembered" />
                </Link>
            </p>
        </Category>
    );
}
