use revolt_database::{Database, User, UserSettingsImpl};
use revolt_models::v0;

use chrono::prelude::*;
use revolt_result::{create_error, Result};
use rocket::{serde::json::Json, State};
use rocket_empty::EmptyResponse;
use std::collections::HashMap;

type Data = HashMap<String, String>;

/// # Set Settings
///
/// Upload data to save to settings.
#[openapi(tag = "Sync")]
#[post("/settings/set?<options..>", data = "<data>")]
pub async fn set(
    db: &State<Database>,
    user: User,
    data: Json<Data>,
    options: v0::OptionsSetSettings,
) -> Result<EmptyResponse> {
    let data = data.into_inner();

    // Currency and entitlements are server-authoritative. They are exposed
    // through the dedicated economy routes, never through sync settings.
    if data.contains_key("nullcord:economy") {
        return Err(create_error!(NotPrivileged));
    }

    let theme_changed = data.contains_key("theme");
    let current_time = Utc::now().timestamp_millis();
    let timestamp = if let Some(timestamp) = options.timestamp {
        if timestamp > current_time {
            current_time
        } else {
            timestamp
        }
    } else {
        current_time
    };

    let mut settings = HashMap::new();
    for (key, data) in data {
        settings.insert(key, (timestamp, data));
    }

    settings.set(db, &user.id).await?;

    if theme_changed {
        let _ = crate::routes::users::economy::record_event(
            db.inner(),
            &user.id,
            "theme_changed",
            1,
        )
        .await;
    }

    Ok(EmptyResponse)
}
