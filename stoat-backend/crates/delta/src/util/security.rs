//! Security utilities shared by authentication and administrative routes.
//!
//! This module provides:
//! - Redis-backed fixed-window rate limits for authentication actions,
//! - the HTTPS enforcement / security-header fairing,
//! - constant-time comparison for shared secrets,
//! - request identifiers used to correlate security events.

use std::sync::Mutex;

use async_trait::async_trait;
use log::warn;
use revolt_config::config;
use revolt_database::util::ip;
use revolt_result::{Error, Result, create_error};
use rocket::fairing::{Fairing, Info, Kind};
use rocket::http::Method;
use rocket::request::FromRequest;
use rocket::response::content::RawJson;
use rocket::response::status::Forbidden;
use rocket::{Data, Request, Response};
use sha2::{Digest, Sha256};

/// Default Redis key prefix. Kept separate from the generic API ratelimiter.
const PREFIX: &str = "seclimit";

/// Hash any identifier before it becomes a Redis key or log field.
pub fn hash_identifier(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.trim().to_lowercase().as_bytes());
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Constant-time comparison for short ASCII secrets (admin/internal keys).
pub fn secure_eq(expected: &str, provided: &str) -> bool {
    let expected = expected.as_bytes();
    let provided = provided.as_bytes();
    let mut difference = expected.len() ^ provided.len();

    for index in 0..expected.len().max(provided.len()) {
        let left = expected.get(index).copied().unwrap_or(0);
        let right = provided.get(index).copied().unwrap_or(0);
        difference |= usize::from(left ^ right);
    }

    difference == 0 && !expected.is_empty()
}

/// Increment a fixed-window counter.
///
/// Returns `Ok(remaining)` when the request is allowed and
/// `Err(retry_after_seconds)` when the limit is exhausted. Rate limiting is
/// best-effort: if Redis is unavailable the request is allowed (the same
/// fail-open behaviour as the existing API ratelimiter) and an error is
/// logged so operators notice.
pub async fn rate_limit(
    bucket: &str,
    identifier: &str,
    limit: u32,
    window_seconds: u64,
) -> Result<u32, u64> {
    if limit == 0 || std::env::var("TEST_DB").is_ok() {
        return Ok(limit);
    }

    let key = format!("{PREFIX}:{}:{}", bucket, hash_identifier(identifier));

    let Ok(mut connection) = redis_kiss::get_connection().await else {
        warn!("Redis unavailable; authentication rate limit skipped for {bucket}");
        return Ok(limit);
    };

    use redis_kiss::redis::AsyncCommands;

    let used: Result<u32, _> = connection.incr(&key, 1u32).await;
    let Ok(used) = used else {
        warn!("Redis error; authentication rate limit skipped for {bucket}");
        return Ok(limit);
    };

    if used == 1 {
        let _: Result<(), _> = connection.expire(&key, window_seconds as usize).await;
    }

    if used > limit {
        let ttl: i64 = connection.ttl(&key).await.unwrap_or(window_seconds as i64);
        return Err(ttl.max(1) as u64);
    }

    Ok(limit.saturating_sub(used))
}

/// Record a hit and return a `RateLimited` error when exhausted.
pub async fn enforce_rate_limit(
    bucket: &str,
    identifier: &str,
    limit: u32,
    window_seconds: u64,
) -> Result<()> {
    match rate_limit(bucket, identifier, limit, window_seconds).await {
        Ok(_) => Ok(()),
        Err(retry_after) => Err(create_error!(RateLimited { retry_after })),
    }
}

/// Client address resolved through the trusted-proxy rules.
///
/// Never use Rocket's raw `client_ip` for security decisions: behind the
/// tunnel every request arrives from loopback.
pub struct TrustedIp(pub String);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for TrustedIp {
    type Error = std::convert::Infallible;

    async fn from_request(request: &'r Request<'_>) -> rocket::request::Outcome<Self, Self::Error> {
        rocket::request::Outcome::Success(TrustedIp(ip::rocket::to_real_ip(request).await))
    }
}

impl<'r> revolt_rocket_okapi::request::OpenApiFromRequest<'r> for TrustedIp {
    fn from_request_input(
        _gen: &mut revolt_rocket_okapi::r#gen::OpenApiGenerator,
        _name: String,
        _required: bool,
    ) -> revolt_rocket_okapi::Result<revolt_rocket_okapi::request::RequestHeaderInput> {
        Ok(revolt_rocket_okapi::request::RequestHeaderInput::None)
    }
}

/// A request identifier supplied by the client or generated locally.
pub struct RequestId(pub String);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for RequestId {
    type Error = std::convert::Infallible;

    async fn from_request(request: &'r Request<'_>) -> rocket::request::Outcome<Self, Self::Error> {
        rocket::request::Outcome::Success(RequestId(header_request_id(request)))
    }
}

impl<'r> revolt_rocket_okapi::request::OpenApiFromRequest<'r> for RequestId {
    fn from_request_input(
        _gen: &mut revolt_rocket_okapi::r#gen::OpenApiGenerator,
        _name: String,
        _required: bool,
    ) -> revolt_rocket_okapi::Result<revolt_rocket_okapi::request::RequestHeaderInput> {
        Ok(revolt_rocket_okapi::request::RequestHeaderInput::None)
    }
}

#[derive(Clone)]
struct OriginalRequest {
    method: Method,
    uri: String,
    host: String,
}

/// Rejects or redirects plaintext requests and adds hardening headers.
pub struct SecurityFairing;

#[async_trait]
impl Fairing for SecurityFairing {
    fn info(&self) -> Info {
        Info {
            name: "NullCord Security",
            kind: Kind::Request | Kind::Response,
        }
    }

    async fn on_request(&self, request: &mut Request<'_>, _: &mut Data<'_>) {
        let config = config().await;
        if !config.api.security.require_https {
            return;
        }

        if ip::rocket::request_is_secure(request).await {
            return;
        }

        // Direct loopback requests without forwarding headers come from
        // trusted operator tooling on the host (health checks, admin panel,
        // seeded tests). They cannot originate from a remote client.
        if ip::rocket::is_local_direct(request) {
            return;
        }

        // Never try to forward or re-submit a request body: redirect safe
        // methods and reject everything else with a clean JSON error.
        let original = OriginalRequest {
            method: request.method().clone(),
            uri: request.uri().to_string(),
            host: request
                .headers()
                .get_one("host")
                .unwrap_or("localhost")
                .to_string(),
        };
        request.local_cache(|| Mutex::new(Some(original)));
        request.set_method(Method::Get);
        request.set_uri(rocket::http::uri::Origin::parse("/__insecure").unwrap());
    }

    async fn on_response<'r>(&self, request: &'r Request<'_>, response: &mut Response<'r>) {
        let config = config().await;
        let secure = ip::rocket::request_is_secure(request).await;

        if secure && config.api.security.hsts_max_age > 0 {
            let value = format!(
                "max-age={}; includeSubDomains",
                config.api.security.hsts_max_age
            );
            response.set_raw_header("Strict-Transport-Security", value);
        }

        response.set_raw_header("X-Content-Type-Options", "nosniff");
        response.set_raw_header("X-Frame-Options", "DENY");
        response.set_raw_header("Referrer-Policy", "no-referrer");
        response.set_raw_header("Permissions-Policy", "interest-cohort=()");

        if request.uri().path().starts_with("/auth") {
            response.set_raw_header("Cache-Control", "no-store");
        }

        if let Some(id) = request.headers().get_one("x-request-id")
            && !id.is_empty()
            && id.len() <= 128
        {
            response.set_raw_header("X-Request-Id", id);
        }
    }
}

struct StashedOriginal(Option<OriginalRequest>);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for StashedOriginal {
    type Error = std::convert::Infallible;

    async fn from_request(request: &'r Request<'_>) -> rocket::request::Outcome<Self, Self::Error> {
        let original = request
            .local_cache(|| Mutex::new(None::<OriginalRequest>))
            .lock()
            .ok()
            .and_then(|slot| slot.clone());

        rocket::request::Outcome::Success(StashedOriginal(original))
    }
}

/// Plaintext requests reach this route after being rewritten by the fairing.
#[rocket::get("/__insecure")]
fn insecure(original: StashedOriginal) -> Result<Forbidden<RawJson<String>>, rocket::response::Redirect> {
    let fallback = || {
        Forbidden(RawJson(
            r#"{"type":"InsecureRequest","message":"HTTPS is required."}"#.to_string(),
        ))
    };

    let Some(original) = original.0 else {
        return Ok(fallback());
    };

    if matches!(original.method, Method::Get | Method::Head) {
        return Err(rocket::response::Redirect::permanent(format!(
            "https://{}{}",
            original.host, original.uri
        )));
    }

    let error = Error {
        error_type: revolt_result::ErrorType::InsecureRequest,
        location: None,
    };

    Ok(Forbidden(RawJson(
        serde_json::to_string(&error).unwrap_or_else(|_| {
            r#"{"type":"InsecureRequest","message":"HTTPS is required."}"#.to_string()
        }),
    )))
}

pub fn routes() -> Vec<rocket::Route> {
    rocket::routes![insecure]
}

/// Extract the best-effort request id from headers for log records.
pub fn header_request_id(request: &Request<'_>) -> String {
    request
        .headers()
        .get_one("x-request-id")
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 128
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"-_.:".contains(&byte))
        })
        .map(str::to_string)
        .unwrap_or_else(|| ulid::Ulid::new().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constant_time_comparison_is_correct() {
        assert!(secure_eq("secret", "secret"));
        assert!(!secure_eq("secret", "secreT"));
        assert!(!secure_eq("secret", "secret "));
        assert!(!secure_eq("", ""));
    }

    #[test]
    fn identifiers_are_hashed_and_normalised() {
        assert_eq!(hash_identifier("User@Example.com"), hash_identifier(" user@example.com "));
        assert_ne!(hash_identifier("a"), hash_identifier("b"));
    }
}
