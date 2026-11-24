//! Platform administrative security endpoints.
//!
//! Every route in this module is protected by [`AdminActor`], which requires
//! either a privileged account session or a configured `admin_keys` shared
//! secret from a trusted local/proxy connection.

use revolt_config::config;
use revolt_database::{Database, SecurityEvent, User};
use revolt_result::{Error, create_error};
use rocket::http::Status;
use rocket::request::{FromRequest, Outcome};
use rocket::Route;
use revolt_rocket_okapi::revolt_okapi::openapi3::OpenApi;

use crate::util::security::{RequestId, secure_eq};

pub mod security;

pub struct AdminActor {
    pub id: String,
    pub via_key: bool,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for AdminActor {
    type Error = Error;

    async fn from_request(request: &'r rocket::Request<'_>) -> Outcome<Self, Self::Error> {
        let config = config().await;

        if let Some(provided) = request.headers().get_one("x-admin-key")
            && config
                .api
                .security
                .admin_keys
                .iter()
                .any(|key| secure_eq(key, provided))
        {
            return Outcome::Success(AdminActor {
                id: "admin-key".to_string(),
                via_key: true,
            });
        }

        match request.guard::<User>().await {
            Outcome::Success(user) if user.privileged => Outcome::Success(AdminActor {
                id: user.id,
                via_key: false,
            }),
            Outcome::Success(_) => {
                Outcome::Error((Status::Forbidden, create_error!(NotPrivileged)))
            }
            Outcome::Error(error) => Outcome::Error(error),
            Outcome::Forward(forward) => Outcome::Forward(forward),
        }
    }
}

impl<'r> revolt_rocket_okapi::request::OpenApiFromRequest<'r> for AdminActor {
    fn from_request_input(
        _gen: &mut revolt_rocket_okapi::r#gen::OpenApiGenerator,
        _name: String,
        _required: bool,
    ) -> revolt_rocket_okapi::Result<revolt_rocket_okapi::request::RequestHeaderInput> {
        Ok(revolt_rocket_okapi::request::RequestHeaderInput::None)
    }
}

/// Record an administrative action in the security log.
pub async fn audit(
    db: &Database,
    actor: &AdminActor,
    request_id: &RequestId,
    action: &str,
    target: Option<String>,
    metadata: serde_json::Value,
) {
    let metadata = match target {
        Some(target) => serde_json::json!({
            "target": target,
            "via_key": actor.via_key,
            "data": metadata
        }),
        None => metadata,
    };

    db.log_security_event(
        SecurityEvent::new(format!("admin.{action}"), "success")
            .account(actor.id.clone())
            .request(request_id.0.clone())
            .metadata(metadata),
    )
    .await;
}

pub fn routes() -> (Vec<Route>, OpenApi) {
    openapi_get_routes_spec![
        security::list_events,
        security::list_ip_bans,
        security::create_ip_ban,
        security::remove_ip_ban,
        security::revoke_sessions,
        security::force_verify,
        security::security_config,
    ]
}
