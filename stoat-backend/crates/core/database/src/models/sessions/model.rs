use iso8601_timestamp::{Duration, Timestamp};

use crate::{events::client::EventV1, Database};
use revolt_result::Result;

auto_derived_partial!(
    /// Session information
    pub struct Session {
        /// Unique Id
        #[serde(rename = "_id")]
        pub id: String,

        /// User Id
        pub user_id: String,

        /// Session token
        pub token: String,

        /// Display name
        pub name: String,

        /// When the session was last logged in
        pub last_seen: Timestamp,

        /// Where the session originated from
        ///
        /// This could be used to differentiate sessions that come from staging/test vs prod, etc.
        #[serde(skip_serializing_if = "Option::is_none")]
        pub origin: Option<String>,

        /// Last observed client IP for moderation
        #[serde(skip_serializing_if = "Option::is_none")]
        pub ip: Option<String>,

        /// Web Push subscription
        #[serde(skip_serializing_if = "Option::is_none")]
        pub subscription: Option<WebPushSubscription>,
    },
    "PartialSession"
);

auto_derived!(
    /// Web Push subscription
    pub struct WebPushSubscription {
        pub endpoint: String,
        pub p256dh: String,
        pub auth: String,
    }
);

impl Session {
    /// Creation time derived from the ULID session id.
    pub fn created_at(&self) -> Option<Timestamp> {
        ulid::Ulid::from_string(&self.id)
            .ok()
            .and_then(|id| {
                Timestamp::UNIX_EPOCH.checked_add(Duration::milliseconds(id.timestamp_ms() as i64))
            })
    }

    /// Whether the session has exceeded the configured idle or absolute
    /// lifetime. Zero disables the corresponding check.
    pub fn is_expired(&self, idle_timeout: i64, absolute_timeout: i64) -> bool {
        let now = Timestamp::now_utc();

        if idle_timeout > 0
            && now
                .duration_since(self.last_seen)
                .whole_seconds()
                > idle_timeout
        {
            return true;
        }

        if absolute_timeout > 0
            && let Some(created_at) = self.created_at()
            && now.duration_since(created_at).whole_seconds() > absolute_timeout
        {
            return true;
        }

        false
    }

    /// Save model
    pub async fn save(&self, db: &Database) -> Result<()> {
        db.save_session(self).await
    }

    /// Delete session
    pub async fn delete(self, db: &Database) -> Result<()> {
        // Delete from database
        db.delete_session(&self.id).await?;

        // Create and push event
        EventV1::DeleteSession {
            user_id: self.user_id.clone(),
            session_id: self.id,
        }
        .p(self.user_id)
        .await;

        Ok(())
    }
}


#[cfg(test)]
mod security_tests {
    use super::*;
    use std::time::{Duration as StdDuration, SystemTime};

    fn session(created_seconds_ago: u64, idle_seconds: i64) -> Session {
        let created = SystemTime::now() - StdDuration::from_secs(created_seconds_ago);
        Session {
            id: ulid::Ulid::from_datetime(created).to_string(),
            user_id: "user".to_string(),
            token: "token".to_string(),
            name: "test".to_string(),
            last_seen: Timestamp::now_utc()
                .checked_sub(Duration::seconds(idle_seconds))
                .unwrap(),
            origin: None,
            ip: None,
            subscription: None,
        }
    }

    #[test]
    fn idle_and_absolute_expiry_are_enforced() {
        let fresh = session(60, 10);
        assert!(!fresh.is_expired(3600, 86_400));

        let idle = session(60, 7_200);
        assert!(idle.is_expired(3_600, 0));

        let absolute = session(90_000, 10);
        assert!(absolute.is_expired(0, 86_400));

        assert!(!fresh.is_expired(0, 0));
    }
}
