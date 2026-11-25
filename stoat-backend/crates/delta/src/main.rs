#[macro_use]
extern crate rocket;
#[macro_use]
extern crate revolt_rocket_okapi;
#[macro_use]
extern crate serde_json;

pub mod routes;
pub mod util;

#[catch(403)]
fn forbidden(request: &rocket::Request<'_>) -> rocket::response::content::RawJson<String> {
    let body = request
        .local_cache(|| std::sync::Mutex::new(None::<String>))
        .lock()
        .ok()
        .and_then(|slot| slot.clone())
        .unwrap_or_else(|| r#"{"type":"Forbidden"}"#.to_string());
    rocket::response::content::RawJson(body)
}

use revolt_config::config;
use revolt_database::AMQP;
use revolt_ratelimits::rocket as ratelimiter;
use rocket::{Build, Rocket};
use rocket_cors::{AllowedOrigins, CorsOptions, Origins};
use rocket_prometheus::PrometheusMetrics;
use std::net::Ipv4Addr;
use std::str::FromStr;

use crate::util::security::SecurityFairing;

use revolt_database::voice::VoiceClient;
use rocket::data::ToByteUnit;

pub async fn web() -> Rocket<Build> {
    // Get settings
    let config = config().await;

    // Deployment safety: validate configuration without touching the
    // database or opening a listener.
    if std::env::args().any(|argument| argument == "--check-config") {
        // Print only non-secret policy values.
        println!(
            "environment={:?}\napp={}\napi={}\n\
             require_https={}\ntrust_cloudflare={}\nhsts_max_age={}\n\
             trusted_proxies={:?}\ncors_allowed_origins={:?}\n\
             require_email_verification={}\nregistration_limit={}/{}h\n\
             smtp_configured={}\n\
             session_idle_timeout={}\nsession_absolute_timeout={}\n\
             login_max_attempts={}\nlogin_lockout_seconds={}\n\
             login_ip_max_attempts={}\nlogin_window_seconds={}\n\
             ip_risk_enabled={}\ntoken_pepper_configured={}",
            config.environment,
            config.hosts.app,
            config.hosts.api,
            config.api.security.require_https,
            config.api.security.trust_cloudflare,
            config.api.security.hsts_max_age,
            config.api.security.trusted_proxies,
            config.api.security.cors_allowed_origins,
            config.api.registration.require_email_verification,
            config.api.registration.rate_limit_count,
            config.api.registration.rate_limit_window_hours,
            !config.api.smtp.host.is_empty(),
            config.api.security.session_idle_timeout,
            config.api.security.session_absolute_timeout,
            config.api.security.login_max_attempts,
            config.api.security.login_lockout_seconds,
            config.api.security.login_ip_max_attempts,
            config.api.security.login_window_seconds,
            config.api.security.ip_risk.enabled,
            !config.api.security.token_pepper.is_empty(),
        );
        std::process::exit(0);
    }

    // Ensure environment variables are present
    config.preflight_checks();

    // Setup database
    let db = revolt_database::DatabaseInfo::Auto.connect().await.unwrap();
    db.migrate_database().await.unwrap();
    db.ensure_security_event_indexes().await;

    // Keep the platform owner privileged even if another administrator or a
    // direct database edit removes the flag/badge or disables the account.
    crate::routes::owner_guard::start(db.clone());

    // Configure CORS.
    //
    // Authentication uses explicit `X-Session-Token` / `X-Bot-Token`
    // headers, never cookies, so a browser origin restriction is not the
    // primary credential boundary. It is still restricted by default to the
    // configured app origin plus local development origins; opaque (`null`)
    // origins are accepted for the desktop client. Operators can add more
    // origins with `api.security.cors_allowed_origins`.
    let configured_origins = &config.api.security.cors_allowed_origins;
    let allowed_origins = if configured_origins.iter().any(|origin| origin == "*") {
        AllowedOrigins::all()
    } else {
        let mut exact: Vec<String> = configured_origins
            .iter()
            .map(|origin| origin.trim().to_string())
            .filter(|origin| !origin.is_empty())
            .collect();

        if exact.is_empty() {
            if !config.hosts.app.is_empty() {
                exact.push(config.hosts.app.clone());
            }

            for origin in [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:3000",
                "http://127.0.0.1:3000",
            ] {
                exact.push(origin.to_string());
            }
        }

        AllowedOrigins::Some(Origins {
            allow_null: true,
            exact: Some(exact.into_iter().collect()),
            regex: None,
        })
    };

    let cors = CorsOptions {
        allowed_origins,
        allowed_methods: [
            "Get", "Put", "Post", "Delete", "Options", "Head", "Patch",
        ]
        .iter()
        .map(|s| FromStr::from_str(s).unwrap())
        .collect(),
        expose_headers: [
            "X-Ratelimit-Limit",
            "X-Ratelimit-Bucket",
            "X-Ratelimit-Remaining",
            "X-Ratelimit-Reset-After",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect(),
        ..Default::default()
    }
    .to_cors()
    .expect("Failed to create CORS.");

    // Configure Swagger
    let swagger = revolt_rocket_okapi::swagger_ui::make_swagger_ui(
        &revolt_rocket_okapi::swagger_ui::SwaggerUIConfig {
            url: "/openapi.json".to_owned(),
            ..Default::default()
        },
    )
    .into();

    // Voice handler
    let voice_client = VoiceClient::new(config.api.livekit.nodes.clone());
    // Configure Rabbit

    let amqp = AMQP::new_auto().await;

    // Launch background task workers
    revolt_database::tasks::start_workers(db.clone(), amqp.clone());

    // Configure Rocket
    let rocket = rocket::build();
    let prometheus = PrometheusMetrics::new();

    // Ratelimits
    let ratelimits = ratelimiter::RatelimitStorage::new(util::ratelimits::DeltaRatelimits);

    tokio::spawn(routes::temp_ban_sweeper(db.clone()));

    routes::mount(config, rocket)
        .attach(prometheus.clone())
        .mount("/metrics", prometheus)
        .mount("/", rocket_cors::catch_all_options_routes())
        .mount("/", ratelimiter::routes())
        .mount("/", crate::util::security::routes())
        .mount("/swagger/", swagger)
        .manage(db)
        .manage(amqp)
        .manage(cors.clone())
        .manage(voice_client)
        .manage(ratelimits)
        .register("/", catchers![forbidden])
        .attach(ratelimiter::RatelimitFairing)
        .attach(SecurityFairing)
        .attach(cors)
        .configure(rocket::Config {
            // Explicit body limits: JSON bodies are capped tightly; larger
            // string payloads remain available to the few routes that need
            // them. Every request is still size-checked by Rocket.
            limits: rocket::data::Limits::default()
                .limit("json", 1.megabytes())
                .limit("string", 5.megabytes()),
            // Bind address/port are overridable for staging instances and for
            // deployments that only expose the API through a local tunnel.
            address: std::env::var("ROCKET_ADDRESS")
                .ok()
                .and_then(|address| address.parse().ok())
                .unwrap_or(Ipv4Addr::new(0, 0, 0, 0).into()),
            port: std::env::var("ROCKET_PORT")
                .ok()
                .and_then(|port| port.parse().ok())
                .unwrap_or(14702),
            // Never let Rocket trust `X-Forwarded-For` implicitly. Client IP
            // resolution goes through `util::ip`, which validates the TCP
            // peer before honouring any forwarded header.
            ip_header: None,
            ..Default::default()
        })
}

#[launch]
async fn rocket() -> _ {
    // Configure logging and environment
    revolt_config::configure!(api);

    // Start web server
    web().await
}
