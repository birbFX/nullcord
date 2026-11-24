//! Create a new account
//! POST /account/create
use std::time::Duration;

use tokio::time::sleep;
use revolt_config::config;
use revolt_database::{
    util::{
        captcha::check_captcha,
        email::validate_email,
        ip,
        password::assert_safe,
        shield::{validate_shield, ShieldValidationInput},
    },
    Account, Database,
};
use revolt_models::v0;
use revolt_result::{create_error, Result};
use rocket::request::{FromRequest, Outcome};
use rocket::serde::json::Json;
use rocket::State;
use rocket_empty::EmptyResponse;

use crate::util::security::{RequestId, enforce_rate_limit, secure_eq};
use revolt_database::util::ip_risk::{RiskAction, assess as assess_ip_risk};
use revolt_database::SecurityEvent;

/// Trusted internal registration (seed scripts run on the host).
///
/// Requires both a loopback connection with no forwarding headers and the
/// configured `internal_registration_key`. It never bypasses email
/// verification for a remote request.
pub struct InternalRegistration(pub bool);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for InternalRegistration {
    type Error = std::convert::Infallible;

    async fn from_request(request: &'r rocket::Request<'_>) -> Outcome<Self, Self::Error> {
        let config = config().await;
        let key = &config.api.registration.internal_registration_key;
        let provided = request
            .headers()
            .get_one("x-nullcord-internal")
            .unwrap_or_default();

        let allowed = ip::rocket::is_local_direct(request) && secure_eq(key, provided);
        Outcome::Success(InternalRegistration(allowed))
    }
}

impl<'r> revolt_rocket_okapi::request::OpenApiFromRequest<'r> for InternalRegistration {
    fn from_request_input(
        _gen: &mut revolt_rocket_okapi::r#gen::OpenApiGenerator,
        _name: String,
        _required: bool,
    ) -> revolt_rocket_okapi::Result<revolt_rocket_okapi::request::RequestHeaderInput> {
        Ok(revolt_rocket_okapi::request::RequestHeaderInput::None)
    }
}

/// # Create Account
///
/// Create a new account.
#[openapi(tag = "Account")]
#[post("/create", data = "<data>")]
pub async fn create_account(
    db: &State<Database>,
    data: Json<v0::DataCreateAccount>,
    mut shield: ShieldValidationInput,
    internal: InternalRegistration,
    request_id: RequestId,
) -> Result<EmptyResponse> {
    let data = data.into_inner();
    let config = config().await;

    // Random jitter from 0-1000ms
    sleep(Duration::from_millis((rand::random::<f32>() * 1000.) as u64)).await;

    // Check Captcha token
    check_captcha(data.captcha.as_deref()).await?;

    // Per-source registration limit: by default 10 accounts per source
    // address per 10 hours. Runs before validation so invalid or duplicate
    // addresses cannot be used to probe the endpoint for free.
    let source = shield
        .ip
        .clone()
        .filter(|ip| !ip.is_empty())
        .unwrap_or_else(|| "unknown".to_string());

    // Registration must honour platform IP bans too: this route has no
    // Session/Account guard, so the check cannot live only in those guards.
    if source != "unknown"
        && let Ok(Some(ip_ban)) = db.fetch_ip_ban(&source).await
    {
        db.log_security_event(
            SecurityEvent::new("register.ip_banned", "blocked")
                .ip(source.clone())
                .request(request_id.0.clone()),
        )
        .await;
        return Err(ip_ban.ban_error());
    }

    let window_seconds = u64::from(config.api.registration.rate_limit_window_hours.max(1)) * 60 * 60;
    if let Err(error) = enforce_rate_limit(
        "register_ip",
        &source,
        config.api.registration.rate_limit_count,
        window_seconds,
    )
    .await
    {
        db.log_security_event(
            SecurityEvent::new("register.rate_limited", "blocked")
                .ip(source.clone())
                .request(request_id.0.clone()),
        )
        .await;
        return Err(error);
    }

    // Validate the request
    shield.email = Some(data.email.to_string());
    validate_shield(shield).await?;

    // Make sure email is valid and not blocked
    validate_email(&data.email)?;

    // Ensure password is safe to use
    assert_safe(&data.password).await?;

    // Risk-based IP policy. Raw VPN/proxy usage is not banned by default;
    // the operator chooses whether medium/high risk is allowed, challenged
    // (mandatory email verification is the challenge here) or blocked.
    let risk = assess_ip_risk(&source, true).await;
    if risk.action == RiskAction::Block {
        db.log_security_event(
            SecurityEvent::new("register.risk_blocked", "blocked")
                .ip(source.clone())
                .request(request_id.0.clone())
                .risk(risk.risk.clone())
                .metadata(serde_json::json!({
                    "score": risk.score,
                    "categories": risk.categories
                })),
        )
        .await;
        return Err(create_error!(RiskBlocked { retry_after: None }));
    }

    if risk.action == RiskAction::Challenge {
        db.log_security_event(
            SecurityEvent::new("register.risk_challenge", "challenge")
                .ip(source.clone())
                .request(request_id.0.clone())
                .risk(risk.risk.clone())
                .metadata(serde_json::json!({
                    "score": risk.score,
                    "categories": risk.categories
                })),
        )
        .await;
    }

    // Mandatory email verification requires a working mail path. Fail
    // closed rather than silently creating a fully privileged account.
    if config.api.registration.require_email_verification
        && config.api.smtp.host.is_empty()
        && !internal.0
    {
        db.log_security_event(
            SecurityEvent::new("register.blocked_email_unavailable", "blocked")
                .ip(source.clone())
                .request(request_id.0.clone()),
        )
        .await;
        return Err(create_error!(EmailUnavailable));
    }

    // If required, fetch valid invite
    let invite = if config.api.registration.invite_only {
        if let Some(invite) = data.invite {
            Some(db.fetch_account_invite(&invite).await?)
        } else {
            return Err(create_error!(MissingInvite));
        }
    } else {
        None
    };

    // Create account. Verified-on-create is only possible for trusted local
    // tooling with the internal key; every public registration is created in
    // the Pending state and must complete email verification.
    let verify_email = if internal.0 {
        false
    } else {
        config.api.registration.require_email_verification
    };

    let account = Account::new(db, data.email, data.password, verify_email).await?;

    // Use up the invite
    if let Some(mut invite) = invite {
        invite.claimed_by = Some(account.id.clone());
        invite.used = true;

        db.save_account_invite(&invite).await?;
    }

    db.log_security_event(
        SecurityEvent::new(
            "register.accepted",
            if internal.0 { "internal" } else { "success" },
        )
        .account(account.id.clone())
        .ip(source)
        .request(request_id.0)
        .metadata(serde_json::json!({
            "email_verification": !matches!(
                &account.verification,
                revolt_database::EmailVerification::Verified
            )
        })),
    )
    .await;

    Ok(EmptyResponse)
}

#[cfg(test)]
mod tests {
    use crate::{rocket, util::test::TestHarness};
    use revolt_config::overwrite_config;
    use revolt_database::{events::client::EventV1, AccountInvite};
    use revolt_result::{Error, ErrorType};
    use rocket::http::{ContentType, Status};
    use crate::util::test::PubSubTestHelper;

    #[rocket::async_test]
    async fn success() {
        let harness = TestHarness::new().await;
        let mut pubsub = PubSubTestHelper::new("global").await;

        let res = harness
            .client
            .post("/auth/account/create")
            .header(ContentType::JSON)
            .body(
                json!({
                    "email": "success@validemail.com",
                    "password": "valid password"
                })
                .to_string(),
            )
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::NoContent);
        drop(res);

        pubsub
            .wait_for_event(|event| match event {
                EventV1::CreateAccount { .. } => true,
                _ => false,
            }).await;
    }

    #[rocket::async_test]
    async fn fail_invalid_email() {
        let harness = TestHarness::new().await;

        let res = harness
            .client
            .post("/auth/account/create")
            .header(ContentType::JSON)
            .body(
                json!({
                    "email": "invalid",
                    "password": "valid password"
                })
                .to_string(),
            )
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::BadRequest);
        assert!(matches!(
            res.into_json::<Error>().await.unwrap().error_type,
            ErrorType::IncorrectData { .. },
        ));
    }

    #[rocket::async_test]
    async fn fail_invalid_password() {
        let harness = TestHarness::new().await;

        let res = harness
            .client
            .post("/auth/account/create")
            .header(ContentType::JSON)
            .body(
                json!({
                    "email": "fail_invalid_password@validemail.com",
                    "password": "password"
                })
                .to_string(),
            )
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::BadRequest);
        assert!(matches!(
            res.into_json::<Error>().await.unwrap().error_type,
            ErrorType::CompromisedPassword,
        ));
    }

    #[rocket::async_test]
    async fn fail_invalid_invite() {
        overwrite_config(|config| config.api.registration.invite_only = true).await;

        let harness = TestHarness::new().await;

        let res = harness
            .client
            .post("/auth/account/create")
            .header(ContentType::JSON)
            .body(
                json!({
                    "email": "fail_invalid_invite@validemail.com",
                    "password": "valid password",
                    "invite": "invalid"
                })
                .to_string(),
            )
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::BadRequest);
        assert!(matches!(
            res.into_json::<Error>().await.unwrap().error_type,
            ErrorType::InvalidInvite,
        ));
    }

    #[rocket::async_test]
    async fn success_valid_invite() {
        overwrite_config(|config| config.api.registration.invite_only = true).await;

        let harness = TestHarness::new().await;

        let invite = AccountInvite {
            id: "invite".to_string(),
            used: false,
            claimed_by: None,
        };

        invite.save(&harness.db).await.unwrap();

        let res = harness
            .client
            .post("/auth/account/create")
            .header(ContentType::JSON)
            .body(
                json!({
                    "email": "success_valid_invite@validemail.com",
                    "password": "valid password",
                    "invite": "invite"
                })
                .to_string(),
            )
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::NoContent);

        let invite = harness
            .db
            .fetch_account_invite("invite")
            .await
            .expect("`Invite`");

        assert!(invite.used);
    }

    #[rocket::async_test]
    async fn fail_missing_captcha() {
        overwrite_config(|config| {
            config.api.security.captcha.hcaptcha_key =
                "0x0000000000000000000000000000000000000000".to_string()
        })
        .await;

        let harness = TestHarness::new().await;

        let res = harness
            .client
            .post("/auth/account/create")
            .header(ContentType::JSON)
            .body(
                json!({
                    "email": "fail_missing_captcha@validemail.com",
                    "password": "valid password",
                })
                .to_string(),
            )
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::BadRequest);
        assert!(matches!(
            res.into_json::<Error>().await.unwrap().error_type,
            ErrorType::CaptchaFailed,
        ));
    }

    #[rocket::async_test]
    async fn fail_captcha_invalid() {
        overwrite_config(|config| {
            config.api.security.captcha.hcaptcha_key =
                "0x0000000000000000000000000000000000000000".to_string()
        })
        .await;

        let harness = TestHarness::new().await;

        let res = harness
            .client
            .post("/auth/account/create")
            .header(ContentType::JSON)
            .body(
                json!({
                    "email": "fail_captcha_invalid@validemail.com",
                    "password": "valid password",
                    "captcha": "00000000-aaaa-bbbb-cccc-000000000000"
                })
                .to_string(),
            )
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::BadRequest);
        assert!(matches!(
            res.into_json::<Error>().await.unwrap().error_type,
            ErrorType::CaptchaFailed,
        ));
    }

    #[rocket::async_test]
    async fn success_captcha_valid() {
        overwrite_config(|config| {
            config.api.security.captcha.hcaptcha_key =
                "0x0000000000000000000000000000000000000000".to_string()
        })
        .await;

        let harness = TestHarness::new().await;

        let res = harness
            .client
            .post("/auth/account/create")
            .header(ContentType::JSON)
            .body(
                json!({
                    "email": "success_captcha_valid@validemail.com",
                    "password": "valid password",
                    "captcha": "20000000-aaaa-bbbb-cccc-000000000002"
                })
                .to_string(),
            )
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::NoContent);
    }

    #[rocket::async_test]
    async fn success_smtp_sent() {
        let harness = TestHarness::new().await;

        let res = harness
            .client
            .post("/auth/account/create")
            .header(ContentType::JSON)
            .body(
                json!({
                    "email": "success_smtp_sent@smtp.test",
                    "password": "valid password",
                })
                .to_string(),
            )
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::NoContent);

        let (_, code) = harness.assert_email("success_smtp_sent@smtp.test").await;
        let res = harness
            .client
            .post(format!("/auth/account/verify/{code}"))
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::Ok);
    }
}
