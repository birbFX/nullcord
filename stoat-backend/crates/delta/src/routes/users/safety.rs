use futures::TryStreamExt;
use iso8601_timestamp::{Duration, Timestamp};
use mongodb::bson::{doc, Bson, Document};
use revolt_database::{Database, User};
use revolt_models::v0;
use revolt_result::{create_error, Result};
use rocket::{get, serde::json::Json, State};
use ulid::Ulid;

fn bson_timestamp(value: Option<&Bson>) -> Option<Timestamp> {
    match value? {
        Bson::DateTime(date) => Timestamp::UNIX_EPOCH
            .checked_add(Duration::milliseconds(date.timestamp_millis())),
        Bson::Int64(ms) => Timestamp::UNIX_EPOCH.checked_add(Duration::milliseconds(*ms)),
        Bson::Int32(ms) => {
            Timestamp::UNIX_EPOCH.checked_add(Duration::milliseconds(*ms as i64))
        }
        Bson::Double(ms) => {
            Timestamp::UNIX_EPOCH.checked_add(Duration::milliseconds(*ms as i64))
        }
        _ => None,
    }
}

/// # Fetch Safety Standing
///
/// Returns the current user's platform safety records. This includes strikes,
/// suspensions and bans so the account settings page can show a full history.
#[openapi(tag = "User Information")]
#[get("/@me/safety")]
pub async fn fetch(db: &State<Database>, user: User) -> Result<Json<v0::SafetyStanding>> {
    let mut strikes = Vec::new();

    if let Database::MongoDb(mongo) = db.inner() {
        let cursor = mongo
            .col::<Document>("safety_strikes")
            .find(doc! { "user_id": &user.id })
            .sort(doc! { "_id": -1 })
            .await
            .map_err(|_| create_error!(InternalError))?;

        let records: Vec<Document> = cursor
            .try_collect()
            .await
            .map_err(|_| create_error!(InternalError))?;

        for record in records {
            let id = record
                .get_str("_id")
                .unwrap_or_default()
                .to_string();

            if id.is_empty() {
                continue;
            }

            let reason = record
                .get_str("reason")
                .unwrap_or("No reason provided")
                .to_string();
            let kind = record.get_str("type").ok().map(str::to_string);
            let created_at = Ulid::from_string(&id)
                .ok()
                .and_then(|value| {
                    Timestamp::UNIX_EPOCH
                        .checked_add(Duration::milliseconds(value.timestamp_ms() as i64))
                })
                .map(|value| value.to_string());
            let expires_at = bson_timestamp(record.get("banned_until"))
                .map(|value| value.to_string());

            strikes.push(v0::SafetyStrike {
                id,
                reason,
                kind,
                created_at,
                expires_at,
            });
        }
    }

    let now = Timestamp::now_utc();
    let flags = user.flags.unwrap_or_default();

    Ok(Json(v0::SafetyStanding {
        banned: flags & 4 != 0
            && user.banned_until.map_or(true, |until| until > now),
        suspended: flags & 1 != 0
            && user.suspended_until.map_or(true, |until| until > now),
        banned_until: user.banned_until.map(|until| until.to_string()),
        suspended_until: user.suspended_until.map(|until| until.to_string()),
        strikes,
    }))
}
