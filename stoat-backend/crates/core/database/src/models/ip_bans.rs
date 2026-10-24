use std::{env, fs, path::PathBuf};

use iso8601_timestamp::Timestamp;

use crate::{Database, ReferenceDb};
#[cfg(feature = "mongodb")]
use crate::MongoDb;
use revolt_result::{Error, ErrorType, Result};

/// A platform-level IP ban stored in the `ip_bans` collection.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IpBan {
    /// IP address or CIDR-independent exact address
    #[serde(rename = "_id")]
    pub ip: String,
    /// Moderator-facing reason
    #[serde(default)]
    pub reason: Option<String>,
    /// Message returned to the banned client
    #[serde(default)]
    pub message: Option<String>,
    /// Expiry in milliseconds since Unix epoch; absent/null means permanent
    #[serde(default)]
    pub expires_at: Option<Timestamp>,
    /// Moderator who applied the ban
    #[serde(default)]
    pub created_by: Option<String>,
    /// Creation time
    #[serde(default)]
    pub created_at: Option<Timestamp>,
}

impl IpBan {
    pub fn is_active(&self) -> bool {
        match self.expires_at {
            Some(expires_at) => expires_at > Timestamp::now_utc(),
            None => true,
        }
    }

    pub fn message(&self) -> String {
        self.message
            .clone()
            .filter(|message| !message.trim().is_empty())
            .unwrap_or_else(|| "Your IP address has been banned from NullCord.".to_string())
    }

    pub fn ban_error(&self) -> Error {
        Error {
            error_type: ErrorType::IpBanned {
                message: Some(self.message()),
                expires_at: self.expires_at.map(|until| until.to_string()),
            },
            location: Some(format!("{}:{}:{}", file!(), line!(), column!())),
        }
    }
}

fn shared_ip_ban_file() -> PathBuf {
    PathBuf::from(env::var("NULLCORD_IP_BAN_FILE").unwrap_or_else(|_| {
        "/mnt/cll-storage/NullCord-legacy/ip-bans.json".to_string()
    }))
}

fn shared_ip_ban(ip: &str) -> Option<IpBan> {
    let raw = fs::read_to_string(shared_ip_ban_file()).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let entry = value.get(ip)?;
    let expires_at = entry
        .get("expires_at")
        .and_then(serde_json::Value::as_i64)
        .map(Timestamp::from_unix_timestamp_ms);
    let created_at = entry
        .get("created_at")
        .and_then(serde_json::Value::as_i64)
        .map(Timestamp::from_unix_timestamp_ms);
    let ban = IpBan {
        ip: ip.to_string(),
        reason: entry.get("reason").and_then(serde_json::Value::as_str).map(str::to_string),
        message: entry.get("message").and_then(serde_json::Value::as_str).map(str::to_string),
        expires_at,
        created_by: entry.get("created_by").and_then(serde_json::Value::as_str).map(str::to_string),
        created_at,
    };
    ban.is_active().then_some(ban)
}

impl Database {
    /// Fetch an IP ban by exact address. Expired rows are returned as None.
    pub async fn fetch_ip_ban(&self, ip: &str) -> Result<Option<IpBan>> {
        let mongo_ban = match self {
            Database::Reference(_reference) => None,
            #[cfg(feature = "mongodb")]
            Database::MongoDb(mongo) => mongo.fetch_ip_ban(ip).await.ok().flatten(),
        };
        Ok(mongo_ban.or_else(|| shared_ip_ban(ip)))
    }
}

#[cfg(feature = "mongodb")]
impl MongoDb {
    pub async fn fetch_ip_ban(&self, ip: &str) -> Result<Option<IpBan>> {
        let ban = self
            .col::<IpBan>("ip_bans")
            .find_one(doc! { "_id": ip })
            .await
            .map_err(|_| create_database_error!("find_one", "ip_bans"))?;
        Ok(ban.filter(IpBan::is_active))
    }
}

#[allow(dead_code)]
fn _assert_reference_type(_: &ReferenceDb) {}
