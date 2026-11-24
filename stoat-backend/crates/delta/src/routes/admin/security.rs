//! Administrative security controls: event inspection, IP restriction
//! management, session revocation and manual verification review.

use iso8601_timestamp::{Duration, Timestamp};
use revolt_config::config;
use revolt_database::{Database, EmailVerification, IpBan};
use revolt_result::{Result, create_error};
use rocket::serde::json::Json;
use rocket::State;
use rocket_empty::EmptyResponse;
use schemars::JsonSchema;
use serde::Deserialize;

use super::{AdminActor, audit};
use crate::util::security::RequestId;

fn default_limit() -> i64 {
    50
}

#[derive(Deserialize, JsonSchema)]
pub struct CreateIpBan {
    pub ip: String,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    /// Expiry as Unix milliseconds. Omit for a permanent ban.
    #[serde(default)]
    pub expires_at: Option<i64>,
}

#[derive(Deserialize, JsonSchema)]
pub struct RevokeSessions {
    pub user_id: String,
    #[serde(default)]
    pub session_id: Option<String>,
}

/// # List Security Events
///
/// Return the most recent security events. Requires platform administrator
/// authorization.
#[openapi(tag = "Platform Administration")]
#[get("/security/events?<limit>")]
pub async fn list_events(
    db: &State<Database>,
    _actor: AdminActor,
    limit: Option<i64>,
) -> Result<Json<serde_json::Value>> {
    let events = db
        .fetch_security_events(limit.unwrap_or_else(default_limit))
        .await?;
    Ok(Json(serde_json::json!({ "events": events })))
}

/// # List IP Restrictions
#[openapi(tag = "Platform Administration")]
#[get("/security/ip-bans")]
pub async fn list_ip_bans(
    db: &State<Database>,
    _actor: AdminActor,
) -> Result<Json<serde_json::Value>> {
    let bans = db.list_ip_bans().await?;
    Ok(Json(serde_json::json!({ "bans": bans })))
}

/// # Create IP Restriction
#[openapi(tag = "Platform Administration")]
#[post("/security/ip-bans", data = "<data>")]
pub async fn create_ip_ban(
    db: &State<Database>,
    actor: AdminActor,
    request_id: RequestId,
    data: Json<CreateIpBan>,
) -> Result<EmptyResponse> {
    let data = data.into_inner();

    if data.ip.parse::<std::net::IpAddr>().is_err() {
        return Err(create_error!(IncorrectData {
            with: "ip".to_string()
        }));
    }

    let expires_at = data
        .expires_at
        .and_then(|millis| Timestamp::UNIX_EPOCH.checked_add(Duration::milliseconds(millis)));

    let ban = IpBan {
        ip: data.ip.clone(),
        reason: data.reason.clone(),
        message: data.message.clone(),
        expires_at,
        created_by: Some(actor.id.clone()),
        created_at: Some(Timestamp::now_utc()),
    };

    db.save_ip_ban(&ban).await?;

    audit(
        db.inner(),
        &actor,
        &request_id,
        "ip_ban.create",
        Some(data.ip),
        serde_json::json!({ "reason": data.reason, "expires_at": data.expires_at }),
    )
    .await;

    Ok(EmptyResponse)
}

/// # Remove IP Restriction
#[openapi(tag = "Platform Administration")]
#[delete("/security/ip-bans/<ip>")]
pub async fn remove_ip_ban(
    db: &State<Database>,
    actor: AdminActor,
    request_id: RequestId,
    ip: String,
) -> Result<EmptyResponse> {
    db.delete_ip_ban(&ip).await?;

    audit(
        db.inner(),
        &actor,
        &request_id,
        "ip_ban.delete",
        Some(ip),
        serde_json::json!({}),
    )
    .await;

    Ok(EmptyResponse)
}

/// # Revoke Sessions
///
/// Revoke one session or every session for a user.
#[openapi(tag = "Platform Administration")]
#[post("/security/sessions/revoke", data = "<data>")]
pub async fn revoke_sessions(
    db: &State<Database>,
    actor: AdminActor,
    request_id: RequestId,
    data: Json<RevokeSessions>,
) -> Result<EmptyResponse> {
    let data = data.into_inner();

    if let Some(session_id) = &data.session_id {
        db.delete_session(session_id).await?;
    } else {
        db.delete_all_sessions(&data.user_id, None).await?;
    }

    audit(
        db.inner(),
        &actor,
        &request_id,
        "sessions.revoke",
        Some(data.user_id.clone()),
        serde_json::json!({ "session_id": data.session_id }),
    )
    .await;

    Ok(EmptyResponse)
}

/// # Manually Verify Account
///
/// Mark an account as verified after administrative review. This is intended
/// for users who cannot receive mail, not for bypassing abuse controls.
#[openapi(tag = "Platform Administration")]
#[post("/security/users/<user_id>/verify")]
pub async fn force_verify(
    db: &State<Database>,
    actor: AdminActor,
    request_id: RequestId,
    user_id: String,
) -> Result<EmptyResponse> {
    let mut account = db.fetch_account(&user_id).await?;
    account.verification = EmailVerification::Verified;
    account.save(db).await?;

    audit(
        db.inner(),
        &actor,
        &request_id,
        "user.verify",
        Some(user_id),
        serde_json::json!({}),
    )
    .await;

    Ok(EmptyResponse)
}

/// # Security Configuration Summary
///
/// Return the effective (non-secret) security configuration.
#[openapi(tag = "Platform Administration")]
#[get("/security/config")]
pub async fn security_config(
    _actor: AdminActor,
) -> Json<serde_json::Value> {
    let config = config().await;
    let security = &config.api.security;

    Json(serde_json::json!({
        "https": {
            "required": security.require_https,
            "hsts_max_age": security.hsts_max_age,
            "trusted_proxies": security.trusted_proxies,
        },
        "cors": {
            "allowed_origins": security.cors_allowed_origins,
        },
        "sessions": {
            "idle_timeout_seconds": security.session_idle_timeout,
            "absolute_timeout_seconds": security.session_absolute_timeout,
        },
        "login": {
            "max_attempts": security.login_max_attempts,
            "lockout_seconds": security.login_lockout_seconds,
            "ip_max_attempts": security.login_ip_max_attempts,
            "window_seconds": security.login_window_seconds,
        },
        "registration": {
            "invite_only": config.api.registration.invite_only,
            "require_email_verification": config.api.registration.require_email_verification,
            "rate_limit_count": config.api.registration.rate_limit_count,
            "rate_limit_window_hours": config.api.registration.rate_limit_window_hours,
            "smtp_configured": !config.api.smtp.host.is_empty(),
            "internal_key_configured": !config.api.registration.internal_registration_key.is_empty(),
        },
        "ip_risk": {
            "enabled": security.ip_risk.enabled,
            "provider_configured": !security.ip_risk.provider_url.is_empty(),
            "registration_policy": security.ip_risk.registration_policy,
            "login_policy": security.ip_risk.login_policy,
            "medium_threshold": security.ip_risk.medium_threshold,
            "high_threshold": security.ip_risk.high_threshold,
        },
        "tokens": {
            "pepper_configured": !security.token_pepper.is_empty(),
        }
    }))
}
