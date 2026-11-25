import { useHistory, useParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";

import { useEffect, useState } from "preact/hooks";
import { Text } from "preact-i18n";

import { Button, Category, Preloader } from "@revoltchat/ui";

import { useApi } from "../../../controllers/client/ClientController";
import { takeError } from "../../../controllers/client/jsx/error";
import styles from "../Login.module.scss";
import FormField from "../FormField";
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
    const { token } = useParams<{ token?: string }>();
    const history = useHistory();
    const api = useApi();

    const [error, setError] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(!!token);
    const [verified, setVerified] = useState(false);

    const { register, handleSubmit, errors } = useForm<{ code: string }>({
        defaultValues: { code: "" },
    });

    async function submitCode(code: string) {
        setError(undefined);
        setLoading(true);

        try {
            await api.post(
                `/auth/account/verify/${encodeURIComponent(code.trim())}`,
            );
            setVerified(true);
            setTimeout(() => history.push("/login"), 1500);
        } catch (err) {
            setError(takeError(err));
            setLoading(false);
        }
    }

    useEffect(() => {
        // Legacy email links contain a long token in the URL; verify it
        // automatically. New emails contain a short code and use the form.
        if (token) {
            submitCode(token);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) return <Preloader type="ring" />;

    if (verified) {
        return (
            <Category>
                <Text id="login.verified_account" />
            </Category>
        );
    }

    return (
        <div className={styles.formModal}>
            <div className={styles.welcome}>
                <div className={styles.title}>
                    <Text id="login.verify_title" />
                </div>
                <div className={styles.subtitle}>
                    <Text id="login.verify_subtitle" />
                </div>
            </div>

            <form
                onSubmit={
                    handleSubmit(
                        (data) => submitCode(data.code),
                    ) as unknown as JSX.GenericEventHandler<HTMLFormElement>
                }>
                <FormField
                    type="code"
                    register={register}
                    showOverline
                    error={errors.code?.message}
                    autoComplete="one-time-code"
                    autoFocus
                />

                {error && (
                    <p style={{ fontSize: "0.8em", color: "var(--error)" }}>
                        <Text id={`error.${error}`} children={error} />
                    </p>
                )}

                <Button>
                    <Text id="login.verify" />
                </Button>
            </form>

            <span className={styles.create}>
                <Link to="/login/resend">
                    <Text id="login.missing_verification" />
                </Link>
            </span>
            <span className={styles.create}>
                <Link to="/login">
                    <Text id="login.remembered" />
                </Link>
            </span>
        </div>
    );
}
