import { useEffect } from "preact/hooks";
import { useHistory } from "react-router-dom";

const sectionStyle = { marginBottom: "24px", lineHeight: 1.6 };
const headingStyle = { margin: "0 0 8px" };

/**
 * NullCord Terms of Service
 */
export default function Terms() {
    const history = useHistory();

    useEffect(() => {
        const previous = document.title;
        document.title = "Terms of Service \u00b7 NullCord";
        return () => {
            document.title = previous;
        };
    }, []);

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "var(--background)",
                color: "var(--foreground)",
                overflowY: "auto",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
            }}>
            <div
                style={{
                    maxWidth: "760px",
                    margin: "0 auto",
                    padding: "48px 24px 200px",
                }}>
                <a
                    style={{ color: "var(--accent)", cursor: "pointer" }}
                    onClick={() =>
                        window.history.length > 1
                            ? history.goBack()
                            : history.push("/login")
                    }>
                    &larr; Back
                </a>
                <h1 style={{ margin: "24px 0 4px" }}>
                    NullCord Terms of Service
                </h1>
                <p style={{ opacity: 0.6, marginTop: 0 }}>
                    Last updated: {new Date().toLocaleDateString()}
                </p>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>1. Acceptance of Terms</h2>
                    <p>
                        By creating an account or using NullCord (the
                        "Service"), you agree to be bound by these Terms of
                        Service. If you do not agree with any part of these
                        terms, you must not use the Service.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>2. Eligibility</h2>
                    <p>
                        You must be at least 13 years old, or the minimum age
                        required in your jurisdiction, to use the Service. If
                        you are under the age of majority where you live, you
                        may only use the Service with the involvement of a
                        parent or legal guardian.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>3. Your Account</h2>
                    <p>
                        You are responsible for maintaining the security of your
                        account and password. You must not share your account
                        credentials, and you are responsible for all activity
                        that occurs under your account. Notify the
                        administrators immediately if you suspect unauthorized
                        use of your account.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>4. Acceptable Use</h2>
                    <p>
                        You agree not to disrupt or attempt to gain unauthorized
                        access to the Service, its servers, or the accounts of
                        others. You must not use the Service for any illegal or
                        unauthorized purpose, and you may not attempt to bypass
                        rate limits, security measures, or moderation actions.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>5. Prohibited Content</h2>
                    <p>
                        You may not post content that is unlawful, harassing,
                        hateful, sexually explicit, defamatory, or otherwise
                        objectionable. Server owners and moderators are
                        responsible for the content and conduct within their own
                        servers, and must enforce these terms in their
                        communities.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>6. Your Content</h2>
                    <p>
                        You retain ownership of the content you submit. By
                        submitting content, you grant the Service the limited
                        rights necessary to store, display, and deliver that
                        content to the people you share it with. You are solely
                        responsible for the content you submit and for ensuring
                        you have the rights to share it.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>7. Intellectual Property</h2>
                    <p>
                        The Service's name, branding, and software are protected
                        by applicable intellectual property laws. These terms do
                        not grant you any right to use our trademarks, logos, or
                        branding without prior written permission.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>8. Privacy and Data</h2>
                    <p>
                        We collect and store the information necessary to
                        operate the Service, such as your account details,
                        messages, and uploaded files. This data may be visible to
                        the administrators of this instance. Do not share
                        sensitive personal information that you are not
                        comfortable storing.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>9. Third-Party Services</h2>
                    <p>
                        The Service may rely on third-party infrastructure or
                        link to external websites. We are not responsible for
                        the content, policies, or practices of any third party,
                        and your use of such services is at your own risk.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>10. Disclaimers</h2>
                    <p>
                        The Service is provided "as is" and "as available",
                        without warranties of any kind, whether express or
                        implied. We do not guarantee that the Service will be
                        uninterrupted, secure, timely, or error-free, or that any
                        data will be preserved.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>11. Limitation of Liability</h2>
                    <p>
                        To the maximum extent permitted by law, we shall not be
                        liable for any indirect, incidental, special,
                        consequential, or punitive damages, or any loss of data,
                        arising out of or relating to your use of the Service.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>12. Indemnification</h2>
                    <p>
                        You agree to indemnify and hold harmless the
                        administrators of this instance from any claims,
                        damages, liabilities, and expenses arising from your use
                        of the Service or your violation of these terms.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>13. Termination</h2>
                    <p>
                        We may suspend or terminate your access to the Service
                        at any time, with or without notice, if you violate
                        these terms or if we reasonably believe your use poses a
                        risk to the Service or to other users.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>14. Changes to These Terms</h2>
                    <p>
                        We may update these terms from time to time. Continued
                        use of the Service after changes take effect constitutes
                        acceptance of the revised terms. It is your
                        responsibility to review these terms periodically.
                    </p>
                </div>

                <div style={sectionStyle}>
                    <h2 style={headingStyle}>15. Contact</h2>
                    <p>
                        Questions about these terms can be raised with the
                        administrators of this NullCord instance.
                    </p>
                </div>

                <hr
                    style={{
                        border: "none",
                        borderTop: "1px solid var(--tertiary-foreground)",
                        opacity: 0.3,
                        margin: "40px 0 0",
                    }}
                />
            </div>
        </div>
    );
}
