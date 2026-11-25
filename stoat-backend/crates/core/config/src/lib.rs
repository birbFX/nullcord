#[cfg(feature = "test")]
use std::sync::OnceLock;
use std::{collections::HashMap, path::Path, sync::LazyLock};

use cached::proc_macro::cached;
use config::{Config, Environment, File, FileFormat};
use futures_locks::RwLock;
use serde::Deserialize;

#[cfg(feature = "sentry")]
pub use sentry::{Level, capture_error, capture_message};
#[cfg(feature = "anyhow")]
pub use sentry_anyhow::capture_anyhow;

#[cfg(all(feature = "report-macros", feature = "sentry"))]
#[macro_export]
macro_rules! report_error {
    ( $expr: expr, $error: ident $( $tt:tt )? ) => {
        $expr
            .inspect_err(|err| {
                $crate::capture_message(
                    &format!("{err:?} ({}:{}:{})", file!(), line!(), column!()),
                    $crate::Level::Error,
                );
            })
            .map_err(|_| ::revolt_result::create_error!($error))
    };
}

#[cfg(all(feature = "report-macros", feature = "sentry"))]
#[macro_export]
macro_rules! capture_internal_error {
    ( $expr: expr ) => {
        $crate::capture_message(
            &format!("{:?} ({}:{}:{})", $expr, file!(), line!(), column!()),
            $crate::Level::Error,
        );
    };
}

#[cfg(all(feature = "report-macros", feature = "sentry"))]
#[macro_export]
macro_rules! report_internal_error {
    ( $expr: expr ) => {
        $expr
            .inspect_err(|err| {
                $crate::capture_message(
                    &format!("{err:?} ({}:{}:{})", file!(), line!(), column!()),
                    $crate::Level::Error,
                );
            })
            .map_err(|_| ::revolt_result::create_error!(InternalError))
    };
}

/// Paths to search for configuration
static CONFIG_SEARCH_PATHS: [&str; 4] = [
    // current working directory
    "Revolt.toml",
    // current working directory - deployment overrides file
    "Revolt.overrides.toml",
    // current working directory - security policy (kept separate so the
    // launcher can rewrite deployment URLs without resetting hardening)
    "Revolt.security.toml",
    // root directory, for Docker containers
    "/Revolt.toml",
];

/// Path to search for test overrides
static TEST_OVERRIDE_PATH: &str = "Revolt.test-overrides.toml";

/// Documented, deployment-friendly environment variable names.
///
/// The configuration crate natively understands `REVOLT__SECTION__KEY`
/// variables. These aliases let operators use the conventional `SMTP_*`
/// names (and keep secrets out of TOML files) without changing every deploy
/// script. Existing `REVOLT__*` values always win.
const ENV_ALIASES: &[(&str, &str)] = &[
    ("SMTP_HOST", "REVOLT__API__SMTP__HOST"),
    ("SMTP_PORT", "REVOLT__API__SMTP__PORT"),
    ("SMTP_USERNAME", "REVOLT__API__SMTP__USERNAME"),
    ("SMTP_PASSWORD", "REVOLT__API__SMTP__PASSWORD"),
    ("SMTP_FROM_ADDRESS", "REVOLT__API__SMTP__FROM_ADDRESS"),
    ("SMTP_REPLY_TO", "REVOLT__API__SMTP__REPLY_TO"),
    ("SMTP_USE_TLS", "REVOLT__API__SMTP__USE_TLS"),
    ("SMTP_USE_STARTTLS", "REVOLT__API__SMTP__USE_STARTTLS"),
    ("PUBLIC_APPLICATION_URL", "REVOLT__HOSTS__APP"),
    ("PUBLIC_API_URL", "REVOLT__HOSTS__API"),
    ("PUBLIC_EVENTS_URL", "REVOLT__HOSTS__EVENTS"),
    ("EMAIL_VERIFICATION_SECRET", "REVOLT__API__SECURITY__TOKEN_PEPPER"),
    ("TENOR_API_KEY", "REVOLT__API__SECURITY__TENOR_KEY"),
    ("GIFBOX_API_KEY", "REVOLT__API__SECURITY__TENOR_KEY"),
    ("NULLCORD_REQUIRE_HTTPS", "REVOLT__API__SECURITY__REQUIRE_HTTPS"),
    (
        "NULLCORD_INTERNAL_REGISTRATION_KEY",
        "REVOLT__API__REGISTRATION__INTERNAL_REGISTRATION_KEY",
    ),
];

fn apply_env_aliases() {
    for (from, to) in ENV_ALIASES {
        if std::env::var_os(to).is_none()
            && let Some(value) = std::env::var_os(from)
        {
            // Safe: configuration is built once during process start-up,
            // before any worker threads read the environment.
            unsafe { std::env::set_var(to, value) };
        }
    }
}

/// Configuration builder
static CONFIG_BUILDER: LazyLock<RwLock<Config>> = LazyLock::new(|| {
    RwLock::new({
        apply_env_aliases();

        let mut builder = Config::builder().add_source(File::from_str(
            include_str!("../Revolt.toml"),
            FileFormat::Toml,
        ));

        let cwd = std::env::current_dir().unwrap();
        let mut cwd: Option<&Path> = Some(&cwd);

        while let Some(path) = cwd {
            for config_path in CONFIG_SEARCH_PATHS {
                let config_path = path.join(config_path);
                if config_path.exists() {
                    builder = builder
                        .add_source(File::new(config_path.to_str().unwrap(), FileFormat::Toml));
                }
            }

            cwd = path.parent();
        }

        if std::env::var("TEST_DB").is_ok() {
            builder = builder.add_source(File::from_str(
                include_str!("../Revolt.test.toml"),
                FileFormat::Toml,
            ));

            // recursively search upwards for an overrides file (if there is one)
            if let Ok(cwd) = std::env::current_dir() {
                let mut path = Some(cwd.as_path());
                while let Some(current_path) = path {
                    let target_path = current_path.join(TEST_OVERRIDE_PATH);
                    if target_path.exists() {
                        builder = builder
                            .add_source(File::new(target_path.to_str().unwrap(), FileFormat::Toml));
                    }

                    path = current_path.parent();
                }
            }
        }

        builder = builder.add_source(Environment::with_prefix("REVOLT").separator("__"));

        builder.build().unwrap()
    })
});

#[derive(Deserialize, Debug, Clone)]
pub struct Database {
    pub mongodb: String,
    pub redis: String,
    pub redis_pubsub: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct RabbitQueues {
    pub acks: String,
    pub events: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Rabbit {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub default_exchange: String,
    pub queues: RabbitQueues,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Hosts {
    pub app: String,
    pub api: String,
    pub events: String,
    pub autumn: String,
    pub january: String,
    pub livekit: HashMap<String, String>,
    pub assets: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct ApiRegistration {
    pub invite_only: bool,
    /// Require a verified email address before an account can log in.
    ///
    /// Defaults to `true`. When SMTP is not configured and this is enabled,
    /// registration fails closed instead of silently creating a verified
    /// account (see [`ApiSmtp::host`]).
    #[serde(default = "default_true")]
    pub require_email_verification: bool,
    /// Maximum registrations allowed per source address inside the
    /// configured window.
    #[serde(default = "default_registration_limit")]
    pub rate_limit_count: u32,
    /// Length of the registration rate-limit window, in hours.
    #[serde(default = "default_registration_window_hours")]
    pub rate_limit_window_hours: u32,
    /// Optional shared secret allowing trusted internal tooling (seed scripts)
    /// to create pre-verified accounts. Sent as `X-NullCord-Internal`.
    ///
    /// Leave empty to disable. Never expose this to a browser or remote client.
    #[serde(default)]
    pub internal_registration_key: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct ApiSmtp {
    pub host: String,
    pub username: String,
    pub password: String,
    pub from_address: String,
    pub reply_to: Option<String>,
    pub port: Option<i32>,
    pub use_tls: Option<bool>,
    pub use_starttls: Option<bool>,
    pub expiry: EmailExpiry,
}

/// Email expiration config
#[derive(Deserialize, Debug, Clone)]
pub struct EmailExpiry {
    /// How long email verification codes should last for (in seconds)
    pub expire_verification: i64,
    /// How long password reset codes should last for (in seconds)
    pub expire_password_reset: i64,
    /// How long account deletion codes should last for (in seconds)
    pub expire_account_deletion: i64,
}

#[derive(Deserialize, Debug, Clone)]
pub struct PushVapid {
    pub queue: String,
    pub private_key: String,
    pub public_key: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct PushFcm {
    pub queue: String,
    pub key_type: String,
    pub project_id: String,
    pub private_key_id: String,
    pub private_key: String,
    pub client_email: String,
    pub client_id: String,
    pub auth_uri: String,
    pub token_uri: String,
    pub auth_provider_x509_cert_url: String,
    pub client_x509_cert_url: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct PushApn {
    pub queue: String,
    pub sandbox: bool,
    pub pkcs8: String,
    pub key_id: String,
    pub team_id: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct ApiSecurityCaptcha {
    pub hcaptcha_key: String,
    pub hcaptcha_sitekey: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct ApiSecurityShield {
    pub host: String,
    pub key: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct ApiSecurity {
    pub shield: ApiSecurityShield,
    pub captcha: ApiSecurityCaptcha,
    pub trust_cloudflare: bool,
    pub easypwned: String,
    pub tenor_key: String,
    pub admin_keys: Vec<String>,

    /// Reject plaintext HTTP requests instead of serving them.
    ///
    /// Clients behind a trusted reverse proxy must present
    /// `X-Forwarded-Proto: https`; direct connections from loopback are
    /// treated as internal and allowed.
    #[serde(default = "default_true")]
    pub require_https: bool,
    /// Only honour `X-Forwarded-*` / `CF-Connecting-IP` from these proxy
    /// addresses. Loopback is always trusted. Values may be IPs or CIDRs.
    #[serde(default)]
    pub trusted_proxies: Vec<String>,
    /// HSTS `max-age` in seconds. `0` disables the header.
    #[serde(default = "default_hsts_max_age")]
    pub hsts_max_age: u64,
    /// Origins permitted to make browser CORS requests. An empty list allows
    /// the configured app origin, localhost dev origins and opaque (`null`)
    /// origins. Set to `["*"]` to restore the historical wildcard behaviour.
    #[serde(default)]
    pub cors_allowed_origins: Vec<String>,

    /// Idle session timeout in seconds. `0` disables idle expiry.
    #[serde(default = "default_session_idle_timeout")]
    pub session_idle_timeout: i64,
    /// Absolute session lifetime in seconds. `0` disables absolute expiry.
    #[serde(default = "default_session_absolute_timeout")]
    pub session_absolute_timeout: i64,

    /// Failed login attempts before an account is temporarily locked.
    #[serde(default = "default_login_max_attempts")]
    pub login_max_attempts: i32,
    /// Lockout duration in seconds once the attempt limit is reached.
    #[serde(default = "default_login_lockout_seconds")]
    pub login_lockout_seconds: i64,
    /// Failed login attempts allowed per source IP inside the window.
    #[serde(default = "default_login_ip_max_attempts")]
    pub login_ip_max_attempts: u32,
    /// Login attempt window in seconds.
    #[serde(default = "default_login_window_seconds")]
    pub login_window_seconds: u64,

    /// Secret used to derive stored verification/reset token digests.
    ///
    /// Prefer the `EMAIL_VERIFICATION_SECRET` environment variable. Empty
    /// means tokens are stored as an unkeyed SHA-256 digest (still never
    /// plaintext, but a keyed digest is stronger).
    #[serde(default)]
    pub token_pepper: String,

    /// Optional risk-based IP intelligence policy.
    #[serde(default)]
    pub ip_risk: ApiSecurityIpRisk,
}

/// Configurable, risk-based IP intelligence.
///
/// The engine combines local lists (VPN/proxy/Tor/abuse) with an optional
/// external provider. It is disabled by default so no existing client is
/// affected until an operator opts in.
#[derive(Deserialize, Debug, Clone, Default)]
pub struct ApiSecurityIpRisk {
    #[serde(default)]
    pub enabled: bool,
    /// HTTP endpoint accepting `POST {"ip": "..."}` and returning
    /// `{"score": 0-100, "categories": ["vpn"], "action": "allow|challenge|block"}`.
    #[serde(default)]
    pub provider_url: String,
    /// Bearer token for the provider.
    #[serde(default)]
    pub provider_key: String,
    /// Local newline-delimited `CIDR,score,category` list. Empty disables.
    #[serde(default)]
    pub blocklist_file: String,
    /// Newline-delimited Tor exit node list. Empty disables.
    #[serde(default)]
    pub tor_exit_file: String,
    #[serde(default = "default_ip_risk_medium")]
    pub medium_threshold: i32,
    #[serde(default = "default_ip_risk_high")]
    pub high_threshold: i32,
    /// Policy for registration: `allow`, `challenge` or `block`.
    #[serde(default = "default_ip_risk_policy")]
    pub registration_policy: String,
    /// Policy for login: `allow`, `challenge` or `block`.
    #[serde(default = "default_ip_risk_policy")]
    pub login_policy: String,
}

fn default_true() -> bool {
    true
}
fn default_registration_limit() -> u32 {
    10
}
fn default_registration_window_hours() -> u32 {
    10
}
fn default_hsts_max_age() -> u64 {
    31_536_000
}
fn default_session_idle_timeout() -> i64 {
    60 * 60 * 24 * 30
}
fn default_session_absolute_timeout() -> i64 {
    60 * 60 * 24 * 180
}
fn default_login_max_attempts() -> i32 {
    10
}
fn default_login_lockout_seconds() -> i64 {
    15 * 60
}
fn default_login_ip_max_attempts() -> u32 {
    20
}
fn default_login_window_seconds() -> u64 {
    10 * 60
}
fn default_ip_risk_medium() -> i32 {
    30
}
fn default_ip_risk_high() -> i32 {
    60
}
fn default_ip_risk_policy() -> String {
    "challenge".to_string()
}

#[derive(Deserialize, Debug, Clone)]
pub struct ApiWorkers {
    pub max_concurrent_connections: usize,
}

#[derive(Deserialize, Debug, Clone)]
pub struct ApiLiveKit {
    pub call_ring_duration: usize,
    pub nodes: HashMap<String, LiveKitNode>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct LiveKitNode {
    pub url: String,
    pub lat: f64,
    pub lon: f64,
    pub key: String,
    pub secret: String,

    // whether to hide the node in the nodes list
    #[serde(default)]
    pub private: bool,
}

#[derive(Deserialize, Debug, Clone)]
pub struct ApiUsers {
    pub early_adopter_cutoff: Option<u64>,
    pub min_username_length: usize,
    /// Platform owner account id. When set, the API periodically restores
    /// this account's owner badge, admin flag and login eligibility if they
    /// are removed by another administrator or a direct database change.
    #[serde(default)]
    pub owner_id: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct ApiAuditLogs {
    /// How long audit log entries last before being removed, in seconds
    pub expires_after: u64,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Api {
    pub registration: ApiRegistration,
    pub smtp: ApiSmtp,
    pub security: ApiSecurity,
    pub workers: ApiWorkers,
    pub livekit: ApiLiveKit,
    pub users: ApiUsers,
    pub audit_logs: ApiAuditLogs,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Pushd {
    pub production: bool,
    pub exchange: String,
    pub mass_mention_chunk_size: usize,
    pub render_cache_time: usize,

    // Queues
    pub message_queue: String,
    pub mass_mention_queue: String,
    pub dm_call_queue: String,
    pub fr_accepted_queue: String,
    pub fr_received_queue: String,
    pub generic_queue: String,
    pub ack_queue: String,

    pub vapid: PushVapid,
    pub fcm: PushFcm,
    pub apn: PushApn,
}

impl Pushd {
    fn get_routing_key(&self, key: String) -> String {
        match self.production {
            true => key + "-prd",
            false => key + "-tst",
        }
    }

    pub fn get_ack_routing_key(&self) -> String {
        self.get_routing_key(self.ack_queue.clone())
    }

    pub fn get_message_routing_key(&self) -> String {
        self.get_routing_key(self.message_queue.clone())
    }

    pub fn get_mass_mention_routing_key(&self) -> String {
        self.get_routing_key(self.mass_mention_queue.clone())
    }

    pub fn get_dm_call_routing_key(&self) -> String {
        self.get_routing_key(self.dm_call_queue.clone())
    }

    pub fn get_fr_accepted_routing_key(&self) -> String {
        self.get_routing_key(self.fr_accepted_queue.clone())
    }

    pub fn get_fr_received_routing_key(&self) -> String {
        self.get_routing_key(self.fr_received_queue.clone())
    }

    pub fn get_generic_routing_key(&self) -> String {
        self.get_routing_key(self.generic_queue.clone())
    }
}

#[derive(Deserialize, Debug, Clone)]
pub struct January {
    pub blocked_domains: Vec<String>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct FilesLimit {
    pub min_file_size: usize,
    pub min_resolution: [usize; 2],
    pub max_mega_pixels: usize,
    pub max_pixel_side: usize,
}

#[derive(Deserialize, Debug, Clone)]
pub struct FilesS3 {
    pub endpoint: String,
    pub path_style_buckets: bool,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub default_bucket: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Files {
    pub encryption_key: String,
    pub webp_quality: f32,
    pub blocked_mime_types: Vec<String>,
    pub clamd_host: String,
    pub scan_mime_types: Vec<String>,

    pub limit: FilesLimit,
    pub preview: HashMap<String, [usize; 2]>,
    pub s3: FilesS3,
}

#[derive(Deserialize, Debug, Clone)]
pub struct GlobalLimits {
    pub group_size: usize,
    pub message_embeds: usize,
    pub message_replies: usize,
    pub message_reactions: usize,
    pub server_emoji: usize,
    pub server_roles: usize,
    pub server_channels: usize,

    pub new_user_hours: usize,

    pub body_limit_size: usize,

    pub restrict_server_creation: Vec<String>,

    pub max_invite_duration_days: usize,
}

#[derive(Deserialize, Debug, Clone)]
pub struct FeaturesLimits {
    pub outgoing_friend_requests: usize,

    pub bots: usize,
    pub message_length: usize,
    pub message_attachments: usize,
    pub servers: usize,
    pub voice_quality: u32,
    pub video: bool,
    pub video_resolution: [u32; 2],
    pub video_aspect_ratio: [f32; 2],

    pub file_upload_size_limit: HashMap<String, usize>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct FeaturesLimitsCollection {
    pub global: GlobalLimits,

    pub new_user: FeaturesLimits,
    pub default: FeaturesLimits,

    #[serde(flatten)]
    pub roles: HashMap<String, FeaturesLimits>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct LegalLinks {
    /// Terms of Service URL
    pub terms_of_service: String,
    /// Privacy Policy URL
    pub privacy_policy: String,
    /// Guidelines URL
    pub guidelines: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct FeaturesAdvanced {
    #[serde(default)]
    pub process_message_delay_limit: u16,
    #[serde(default)]
    pub seen_events_cache_size: u32,
}

impl Default for FeaturesAdvanced {
    fn default() -> Self {
        Self {
            process_message_delay_limit: 5,
            seen_events_cache_size: 20,
        }
    }
}

#[derive(Deserialize, Debug, Clone)]
pub struct Features {
    pub limits: FeaturesLimitsCollection,
    pub legal_links: LegalLinks,
    pub webhooks_enabled: bool,
    pub mass_mentions_send_notifications: bool,
    pub mass_mentions_enabled: bool,

    #[serde(default)]
    pub advanced: FeaturesAdvanced,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Sentry {
    pub api: String,
    pub events: String,
    pub voice_ingress: String,
    pub files: String,
    pub proxy: String,
    pub pushd: String,
    pub crond: String,
    pub gifbox: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Settings {
    pub database: Database,
    pub rabbit: Rabbit,
    pub hosts: Hosts,
    pub api: Api,
    pub pushd: Pushd,
    pub january: January,
    pub files: Files,
    pub features: Features,
    pub sentry: Sentry,
    pub production: bool,
    pub environment: String,
    pub disable_events_dont_use: bool,
}

impl Settings {
    pub fn preflight_checks(&self) {
        if self.api.smtp.host.is_empty() {
            if self.api.registration.require_email_verification {
                log::error!(
                    "Email verification is required but SMTP is not configured. \
                     Registration will be refused until SMTP_HOST/SMTP_PORT/\
                     SMTP_USERNAME/SMTP_PASSWORD/SMTP_FROM_ADDRESS are set. \
                     See SECURITY.md."
                );
            } else {
                log::warn!("No SMTP settings specified! Remember to configure email.");
            }
        }

        if self.api.security.captcha.hcaptcha_key.is_empty() {
            log::warn!("No Captcha key specified! Remember to add hCaptcha key.");
        }

        if self.api.security.tenor_key.is_empty() {
            log::warn!(
                "No GIF provider key configured; the GIF picker will return errors. \
                 Set GIFBOX_API_KEY (or TENOR_API_KEY) in the gifbox service environment."
            );
        }

        if self.api.security.token_pepper.is_empty() {
            log::warn!(
                "EMAIL_VERIFICATION_SECRET is not set; verification and reset \
                 token digests use an unkeyed hash. Set a long random secret."
            );
        }

        if !self.api.security.require_https {
            log::warn!(
                "require_https is disabled; plaintext authentication traffic \
                 will be accepted. This is only appropriate for isolated \
                 development instances."
            );
        }
    }
}

pub async fn init() {
    // Never print the full configuration: it contains SMTP passwords, S3
    // keys, LiveKit secrets, VAPID private keys and admin keys.
    let config = config().await;
    println!(
        ":: Revolt Configuration ::\nenvironment={:?} app={} api={} smtp_configured={} \
         captcha={} https_required={} email_verification_required={}",
        config.environment,
        config.hosts.app,
        config.hosts.api,
        !config.api.smtp.host.is_empty(),
        !config.api.security.captcha.hcaptcha_key.is_empty(),
        config.api.security.require_https,
        config.api.registration.require_email_verification,
    );
}

pub async fn read() -> Config {
    CONFIG_BUILDER.read().await.clone()
}

pub async fn config_no_cache() -> Settings {
    let mut config = read().await.try_deserialize::<Settings>().unwrap();

    // inject REDIS_URI for redis-kiss library
    if std::env::var("REDIS_URI").is_err() {
        unsafe {
            std::env::set_var("REDIS_URI", config.database.redis.clone());
        }
    }

    // auto-detect production nodes
    if config.hosts.api.contains("https")
        && (config.hosts.api.contains("revolt.chat") || config.hosts.api.contains("stoat.chat"))
    {
        config.production = true;
    }

    config
}

#[cached(time = 30)]
pub async fn config() -> Settings {
    #[cfg(feature = "test")]
    if let Some(overwrites) = CONFIG_OVERWRITES.get() {
        return overwrites.clone();
    }

    config_no_cache().await
}

#[cfg(feature = "test")]
static CONFIG_OVERWRITES: OnceLock<Settings> = OnceLock::new();

/// Modify the config values for a test, this can only be called once
///
/// This will also fail if two or more tests are running in the same process and both try to modify the config,
/// This could happen if tests where run under `cargo test` instead of `nextest`.
#[cfg(feature = "test")]
pub async fn overwrite_config(f: impl FnOnce(&mut Settings)) {
    let mut config = config_no_cache().await;

    f(&mut config);

    CONFIG_OVERWRITES.set(config).expect(
        "Cannot overwrite config multiple times, make sure you are running tests through nextest.",
    );
}

/// Configure logging and common Rust variables
#[cfg(feature = "sentry")]
pub async fn setup_logging(release: &'static str, dsn: String) -> Option<sentry::ClientInitGuard> {
    if std::env::var("RUST_LOG").is_err() {
        unsafe {
            std::env::set_var("RUST_LOG", "info");
        }
    }

    if std::env::var("ROCKET_ADDRESS").is_err() {
        unsafe {
            std::env::set_var("ROCKET_ADDRESS", "0.0.0.0");
        }
    }

    pretty_env_logger::init();
    log::info!("Starting {release}");

    if dsn.is_empty() {
        None
    } else {
        Some(sentry::init((
            dsn,
            sentry::ClientOptions {
                release: Some(release.into()),
                ..Default::default()
            },
        )))
    }
}

#[cfg(feature = "sentry")]
#[macro_export]
macro_rules! configure {
    ($application: ident) => {
        let config = $crate::config().await;
        let _sentry = $crate::setup_logging(
            concat!(env!("CARGO_PKG_NAME"), "@", env!("CARGO_PKG_VERSION")),
            config.sentry.$application,
        )
        .await;
    };
}

#[cfg(feature = "test")]
#[cfg(test)]
mod tests {
    use crate::init;

    #[tokio::test]
    async fn it_works() {
        init().await;
    }
}
