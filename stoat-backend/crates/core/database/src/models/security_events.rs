//! Centralised security event log.
//!
//! Events are stored in MongoDB separately from user-visible audit logs and
//! are only reachable through privileged administrative endpoints. They never
//! contain passwords, raw tokens, session secrets or authorization headers.

use iso8601_timestamp::Timestamp;
use revolt_config::config;
use serde_json::Value;

use crate::{Database, IpBan};
use revolt_result::Result;

/// A single authentication, registration or administrative security event.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SecurityEvent {
    /// Unique event id (ULID)
    #[serde(rename = "_id")]
    pub id: String,
    /// When the event occurred
    pub timestamp: Timestamp,
    /// Stable event name, for example `login.success` or `register.blocked`
    pub event: String,
    /// Related account, where one is known
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    /// Source address, where lawfully collected
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,
    /// Correlates with the response `X-Request-Id`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    /// `success`, `failure`, `blocked`, `challenge` or `allowed`
    pub result: String,
    /// Risk classification (`low`, `medium`, `high`, `unknown`)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk: Option<String>,
    /// Additional non-sensitive context
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

impl SecurityEvent {
    pub fn new(event: impl Into<String>, result: impl Into<String>) -> Self {
        Self {
            id: ulid::Ulid::new().to_string(),
            timestamp: Timestamp::now_utc(),
            event: event.into(),
            account_id: None,
            ip: None,
            request_id: None,
            result: result.into(),
            risk: None,
            metadata: None,
        }
    }

    pub fn account(mut self, account_id: impl Into<String>) -> Self {
        self.account_id = Some(account_id.into());
        self
    }

    pub fn ip(mut self, ip: impl Into<String>) -> Self {
        self.ip = Some(ip.into());
        self
    }

    pub fn request(mut self, request_id: impl Into<String>) -> Self {
        self.request_id = Some(request_id.into());
        self
    }

    pub fn risk(mut self, risk: impl Into<String>) -> Self {
        self.risk = Some(risk.into());
        self
    }

    pub fn metadata(mut self, metadata: Value) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

#[cfg(feature = "mongodb")]
const SECURITY_EVENTS_COLLECTION: &str = "security_events";

impl Database {
    /// Append a security event. Logging failures are reported but never make
    /// the underlying operation fail.
    pub async fn log_security_event(&self, event: SecurityEvent) {
        match self {
            Database::Reference(_) => {}
            #[cfg(feature = "mongodb")]
            Database::MongoDb(mongo) => {
                if let Err(error) = mongo
                    .col::<SecurityEvent>(SECURITY_EVENTS_COLLECTION)
                    .insert_one(&event)
                    .await
                {
                    log::error!("Failed to write security event {}: {error}", event.id);
                }
            }
        }
    }

    /// Read the most recent security events.
    pub async fn fetch_security_events(&self, limit: i64) -> Result<Vec<SecurityEvent>> {
        match self {
            Database::Reference(_) => Ok(Vec::new()),
            #[cfg(feature = "mongodb")]
            Database::MongoDb(mongo) => {
                use futures::TryStreamExt;
                use mongodb::bson::doc;
                use mongodb::options::FindOptions;

                let options = FindOptions::builder()
                    .sort(doc! { "timestamp": -1 })
                    .limit(limit.clamp(1, 500))
                    .build();

                mongo
                    .col::<SecurityEvent>(SECURITY_EVENTS_COLLECTION)
                    .find(doc! {})
                    .with_options(options)
                    .await
                    .map_err(|_| create_database_error!("find", SECURITY_EVENTS_COLLECTION))?
                    .try_collect::<Vec<_>>()
                    .await
                    .map_err(|_| create_database_error!("find", SECURITY_EVENTS_COLLECTION))
            }
        }
    }

    /// Create the TTL index used to enforce the configured retention period.
    pub async fn ensure_security_event_indexes(&self) {
        #[cfg(feature = "mongodb")]
        if let Database::MongoDb(mongo) = self {
            use mongodb::bson::doc;
            use mongodb::options::IndexOptions;
            use mongodb::IndexModel;

            let retention = config().await.api.audit_logs.expires_after.max(86_400) as i32;
            let index = IndexModel::builder()
                .keys(doc! { "timestamp": 1 })
                .options(
                    IndexOptions::builder()
                        .expire_after(std::time::Duration::from_secs(retention as u64))
                        .name("security_event_retention".to_string())
                        .build(),
                )
                .build();

            if let Err(error) = mongo
                .col::<SecurityEvent>(SECURITY_EVENTS_COLLECTION)
                .create_index(index)
                .await
            {
                log::warn!("Could not create security event TTL index: {error}");
            }
        }
    }

    /// Create or replace an IP ban.
    pub async fn save_ip_ban(&self, ban: &IpBan) -> Result<()> {
        match self {
            Database::Reference(_) => Ok(()),
            #[cfg(feature = "mongodb")]
            Database::MongoDb(mongo) => {
                mongo
                    .col::<IpBan>("ip_bans")
                    .replace_one(bson::doc! { "_id": &ban.ip }, ban)
                    .upsert(true)
                    .await
                    .map(|_| ())
                    .map_err(|_| create_database_error!("replace_one", "ip_bans"))
            }
        }
    }

    /// Remove an IP ban.
    pub async fn delete_ip_ban(&self, ip: &str) -> Result<()> {
        match self {
            Database::Reference(_) => Ok(()),
            #[cfg(feature = "mongodb")]
            Database::MongoDb(mongo) => {
                mongo
                    .col::<IpBan>("ip_bans")
                    .delete_one(bson::doc! { "_id": ip })
                    .await
                    .map(|_| ())
                    .map_err(|_| create_database_error!("delete_one", "ip_bans"))
            }
        }
    }

    /// List active and expired IP bans for the administrative UI.
    pub async fn list_ip_bans(&self) -> Result<Vec<IpBan>> {
        match self {
            Database::Reference(_) => Ok(Vec::new()),
            #[cfg(feature = "mongodb")]
            Database::MongoDb(mongo) => {
                use futures::TryStreamExt;
                use mongodb::bson::doc;

                mongo
                    .col::<IpBan>("ip_bans")
                    .find(doc! {})
                    .await
                    .map_err(|_| create_database_error!("find", "ip_bans"))?
                    .try_collect::<Vec<_>>()
                    .await
                    .map_err(|_| create_database_error!("find", "ip_bans"))
            }
        }
    }
}
