use std::{collections::HashSet, sync::LazyLock};

use lettre::{
    transport::smtp::{authentication::Credentials, client::Tls},
    SmtpTransport,
};
use regex::Regex;
use revolt_config::{config, ApiSmtp};
use revolt_result::Result;

static SPLIT: LazyLock<Regex> = LazyLock::new(|| Regex::new("([^@]+)(@.+)").unwrap());
static SYMBOL_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new("\\+.+|\\.").unwrap());
static HANDLEBARS: LazyLock<handlebars::Handlebars<'static>> =
    LazyLock::new(handlebars::Handlebars::new);
static REVOLT_SOURCE_LIST: LazyLock<HashSet<String>> = LazyLock::new(|| {
    include_str!("../../assets/revolt_source_list.txt")
        .split('\n')
        .map(|x| x.into())
        .collect()
});

/// Strip special characters and aliases from emails
///
/// Invalid addresses (for example a login attempt with `"x"`) are returned
/// trimmed and lower-cased instead of panicking. Callers that create or
/// change an account still validate the address first.
pub fn normalise_email(original: String) -> String {
    let original = original.trim().to_string();

    let Some(split) = SPLIT.captures(&original) else {
        return original.to_lowercase();
    };

    let mut clean = SYMBOL_RE
        .replace_all(split.get(1).map(|m| m.as_str()).unwrap_or_default(), "")
        .to_string();

    clean.push_str(split.get(2).map(|m| m.as_str()).unwrap_or_default());
    clean.to_lowercase()
}

/// Derive the value stored in the database for a single-use token.
///
/// Raw verification, password-reset and deletion tokens are only ever sent
/// to the account owner by email. The database stores a SHA-256 digest,
/// optionally keyed with `EMAIL_VERIFICATION_SECRET`, so a database leak alone
/// cannot be replayed against the API.
pub fn hash_token(token: &str, pepper: &str) -> String {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    if !pepper.is_empty() {
        hasher.update(pepper.as_bytes());
        hasher.update(b":");
    }
    hasher.update(token.as_bytes());
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Whether a stored token value is already a digest (rather than a legacy
/// plaintext token written by an older build).
pub fn is_token_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Email template
#[derive(Clone)]
pub struct Template {
    /// Title of the email
    pub title: String,
    /// Plain text version of this email
    pub text: String,
    /// HTML version of this email
    pub html: Option<String>,
    /// URL to redirect people to from the email
    ///
    /// Use `{{url}}` to fill this field.
    ///
    /// Any given URL will be suffixed with a unique token if applicable.
    ///
    /// e.g. `https://example.com?t=` becomes `https://example.com?t=UNIQUE_CODE`
    pub url: String,
}

/// Email templates
#[derive(Clone)]
pub struct Templates {
    /// Template for email verification
    pub verify: Template,
    /// Template for password reset
    pub reset: Template,
    /// Template for password reset when the account already exists on creation
    pub reset_existing: Template,
    /// Template for account deletion
    pub deletion: Template,
    /// Template for suspention
    pub suspension: Template,
}

pub async fn email_templates() -> Templates {
    let config = config().await;

    if std::env::var("TEST_DB").is_ok() {
        Templates {
            verify: Template {
                title: "verify".into(),
                text: "[[{{url}}]]".into(),
                url: "".into(),
                html: None,
            },
            reset: Template {
                title: "reset".into(),
                text: "[[{{url}}]]".into(),
                url: "".into(),
                html: None,
            },
            reset_existing: Template {
                title: "reset_existing".into(),
                text: "[[{{url}}]]".into(),
                url: "".into(),
                html: None,
            },
            deletion: Template {
                title: "deletion".into(),
                text: "[[{{url}}]]".into(),
                url: "".into(),
                html: None,
            },
            suspension: Template {
                title: "suspension".into(),
                text: "[[dummy]]".into(),
                url: "".into(),
                html: None,
            },
        }
    } else if config.production {
        Templates {
            verify: Template {
                title: "Verify your Stoat account.".into(),
                text: include_str!("../../templates/verify.txt").into(),
                url: format!("{}/login/verify/", config.hosts.app),
                html: Some(include_str!("../../templates/verify.html").into()),
            },
            reset: Template {
                title: "Reset your Stoat password.".into(),
                text: include_str!("../../templates/reset.txt").into(),
                url: format!("{}/login/reset/", config.hosts.app),
                html: Some(include_str!("../../templates/reset.html").into()),
            },
            reset_existing: Template {
                title: "You already have a Stoat account, reset your password.".into(),
                text: include_str!("../../templates/reset-existing.txt").into(),
                url: format!("{}/login/reset/", config.hosts.app),
                html: Some(include_str!("../../templates/reset-existing.html").into()),
            },
            deletion: Template {
                title: "Confirm account deletion.".into(),
                text: include_str!("../../templates/deletion.txt").into(),
                url: format!("{}/delete/", config.hosts.app),
                html: Some(include_str!("../../templates/deletion.html").into()),
            },
            suspension: Template {
                title: "Account Suspension".to_string(),
                html: Some(include_str!("../../templates/suspension.html").to_owned()),
                text: include_str!("../../templates/suspension.txt").to_owned(),
                url: Default::default(),
            },
        }
    } else {
        Templates {
            verify: Template {
                title: "Verify your account.".into(),
                text: include_str!("../../templates/verify.whitelabel.txt").into(),
                url: format!("{}/login/verify/", config.hosts.app),
                html: None,
            },
            reset: Template {
                title: "Reset your password.".into(),
                text: include_str!("../../templates/reset.whitelabel.txt").into(),
                url: format!("{}/login/reset/", config.hosts.app),
                html: None,
            },
            reset_existing: Template {
                title: "Reset your password.".into(),
                text: include_str!("../../templates/reset.whitelabel.txt").into(),
                url: format!("{}/login/reset/", config.hosts.app),
                html: None,
            },
            deletion: Template {
                title: "Confirm account deletion.".into(),
                text: include_str!("../../templates/deletion.whitelabel.txt").into(),
                url: format!("{}/delete/", config.hosts.app),
                html: None,
            },
            suspension: Template {
                title: "Account Suspension".to_string(),
                text: include_str!("../../templates/suspension.whitelabel.txt").to_owned(),
                url: Default::default(),
                html: None,
            },
        }
    }
}

/// Create SMTP transport
pub fn create_transport(smtp: &ApiSmtp) -> SmtpTransport {
    let relay = if smtp.use_starttls == Some(true) {
        SmtpTransport::starttls_relay(&smtp.host).unwrap()
    } else {
        SmtpTransport::relay(&smtp.host).unwrap()
    };

    let relay = if let Some(port) = smtp.port {
        relay.port(port.try_into().unwrap())
    } else {
        relay
    };

    let relay = if smtp.use_tls == Some(false) {
        relay.tls(Tls::None)
    } else {
        relay
    };

    relay
        .credentials(Credentials::new(
            smtp.username.clone(),
            smtp.password.clone(),
        ))
        .build()
}

/// Render an email template
fn render_template(text: &str, variables: &handlebars::JsonValue) -> Result<String> {
    HANDLEBARS
        .render_template(text, variables)
        .map_err(|_| create_error!(RenderFail))
}

/// Send an email
pub fn send_email(
    smtp: &ApiSmtp,
    address: String,
    template: &Template,
    variables: handlebars::JsonValue,
) -> Result<()> {
    let m = lettre::Message::builder()
        .from(smtp.from_address.parse().expect("valid `smtp_from`"))
        .to(address.parse().expect("valid `smtp_to`"))
        .subject(template.title.clone());

    let m = if let Some(reply_to) = &smtp.reply_to {
        m.reply_to(reply_to.parse().expect("valid `smtp_reply_to`"))
    } else {
        m
    };

    let text = render_template(&template.text, &variables).expect("valid `template`");

    let m = if let Some(html) = &template.html {
        m.multipart(lettre::message::MultiPart::alternative_plain_html(
            text,
            render_template(html, &variables).expect("valid `template`"),
        ))
    } else {
        m.body(text)
    }
    .expect("valid `message`");

    use lettre::Transport;
    let sender = create_transport(smtp);

    match sender.send(&m) {
        Ok(_) => Ok(()),
        Err(error) => {
            error!(
                "Failed to send email to {}!\nlettre error: {}",
                address, error
            );

            revolt_config::capture_error(&error);

            Err(create_error!(EmailFailed))
        }
    }
}

pub fn validate_email(email: &str) -> Result<()> {
    // Make sure this is an actual email
    if !validator::validate_email(email) {
        return Err(create_error!(IncorrectData {
            with: "email".to_string()
        }));
    }

    // Check if the email is blacklisted
    if let Some(domain) = email.split('@').next_back() {
        if REVOLT_SOURCE_LIST.contains(&domain.to_string()) {
            return Err(create_error!(Blacklisted));
        }
    }

    Ok(())
}

#[cfg(test)]
mod security_tests {
    use super::*;

    #[test]
    fn normalise_email_does_not_panic_on_invalid_input() {
        assert_eq!(normalise_email("x".to_string()), "x");
        assert_eq!(normalise_email(" USER+tag@Example.COM ".to_string()), "user@example.com");
    }

    #[test]
    fn token_digests_are_deterministic_and_keyed() {
        let a = hash_token("abc", "");
        let b = hash_token("abc", "");
        let c = hash_token("abc", "pepper");

        assert_eq!(a, b);
        assert_ne!(a, c);
        assert!(is_token_digest(&a));
        assert!(!is_token_digest("abc"));
        assert_ne!(hash_token("abc", ""), hash_token("abd", ""));
    }
}
