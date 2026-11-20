use std::time::Duration;

use revolt_database::{
    util::{permissions::DatabasePermissionQuery, reference::Reference},
    voice::{
        get_user_voice_channel_in_server, remove_user_from_voice_channel, UserVoiceChannel,
        VoiceClient,
    },
    AuditLogEntryAction, Database, File, MemberCompositeKey, RemovalIntention, ServerBan, User,
};
use revolt_permissions::{calculate_server_permissions, ChannelPermission};
use revolt_result::{create_error, Result};
use rocket::{serde::json::Json, State};
use rocket_empty::EmptyResponse;
use serde::{Deserialize, Serialize};

use super::extras::{load, store};
use crate::util::audit_log_reason::AuditLogReason;

const MAX_STICKERS: usize = 30;
const MAX_NOTIFICATIONS: usize = 100;
const MAX_TEMPBANS: usize = 2000;
const MAX_TEMPBAN_MINUTES: i64 = 60 * 24 * 365;

fn invalid(msg: &str) -> revolt_result::Error {
    create_error!(FailedValidation {
        error: msg.to_string()
    })
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------- notifications

#[derive(Serialize, Deserialize, Clone, Debug, JsonSchema)]
pub struct Notification {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub server: Option<String>,
    pub created: i64,
    pub read: bool,
}

#[derive(Serialize, Deserialize, Default)]
struct NotificationsDoc {
    #[serde(rename = "_id", default)]
    id: String,
    items: Vec<Notification>,
}

/// Push a notification to a user's notification centre (best effort).
pub async fn notify(db: &Database, user: &str, kind: &str, title: &str, body: &str, server: Option<&str>) {
    let key = format!("notifications:{user}");
    let mut doc = load::<NotificationsDoc>(db, &key)
        .await
        .ok()
        .flatten()
        .unwrap_or_default();
    doc.id = key.clone();
    doc.items.insert(
        0,
        Notification {
            id: ulid::Ulid::new().to_string(),
            kind: kind.to_string(),
            title: title.chars().take(100).collect(),
            body: body.chars().take(500).collect(),
            server: server.map(str::to_string),
            created: now_ms(),
            read: false,
        },
    );
    doc.items.truncate(MAX_NOTIFICATIONS);
    let _ = store(db, &key, &doc).await;
}

/// # Fetch Notifications
///
/// Fetch your notification centre, newest first.
#[openapi(tag = "Server Information")]
#[get("/notifications")]
pub async fn list_notifications(db: &State<Database>, user: User) -> Result<Json<Vec<Notification>>> {
    let doc = load::<NotificationsDoc>(db, &format!("notifications:{}", user.id))
        .await?
        .unwrap_or_default();
    Ok(Json(doc.items))
}

/// # Mark Notifications Read
///
/// Mark all of your notifications as read.
#[openapi(tag = "Server Information")]
#[patch("/notifications/read")]
pub async fn read_notifications(db: &State<Database>, user: User) -> Result<EmptyResponse> {
    let key = format!("notifications:{}", user.id);
    if let Some(mut doc) = load::<NotificationsDoc>(db, &key).await? {
        doc.items.iter_mut().for_each(|n| n.read = true);
        store(db, &key, &doc).await?;
    }
    Ok(EmptyResponse)
}

/// # Clear Notifications
///
/// Delete all of your notifications.
#[openapi(tag = "Server Information")]
#[delete("/notifications")]
pub async fn clear_notifications(db: &State<Database>, user: User) -> Result<EmptyResponse> {
    let key = format!("notifications:{}", user.id);
    store(
        db,
        &key,
        &NotificationsDoc {
            id: key.clone(),
            items: vec![],
        },
    )
    .await?;
    Ok(EmptyResponse)
}

// ---------------------------------------------------------------- stickers

#[derive(Serialize, Deserialize, Clone, Debug, JsonSchema)]
pub struct Sticker {
    /// Autumn upload id (tag `emojis`), also the sticker id
    pub id: String,
    pub name: String,
    pub animated: bool,
    pub creator: String,
}

#[derive(Serialize, Deserialize, Default)]
struct StickersDoc {
    #[serde(rename = "_id", default)]
    id: String,
    items: Vec<Sticker>,
}

#[derive(Deserialize, JsonSchema)]
pub struct DataCreateSticker {
    pub name: String,
}

fn valid_sticker_name(name: &str) -> bool {
    (2..=32).contains(&name.len()) && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// # List Stickers
///
/// List a server's stickers. Members only.
#[openapi(tag = "Server Information")]
#[get("/<target>/stickers")]
pub async fn list_stickers(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
) -> Result<Json<Vec<Sticker>>> {
    let server = target.as_server(db).await?;
    db.fetch_member(&server.id, &user.id).await?;
    let doc = load::<StickersDoc>(db, &format!("stickers:{}", server.id))
        .await?
        .unwrap_or_default();
    Ok(Json(doc.items))
}

/// # Create Sticker
///
/// Bind an uploaded image (Autumn tag `emojis`) as a server sticker.
#[openapi(tag = "Server Information")]
#[put("/<target>/stickers/<sticker_id>", data = "<data>")]
pub async fn create_sticker(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    sticker_id: String,
    data: Json<DataCreateSticker>,
) -> Result<Json<Sticker>> {
    let server = target.as_server(db).await?;
    let mut query = DatabasePermissionQuery::new(db, &user).server(&server);
    calculate_server_permissions(&mut query)
        .await
        .throw_if_lacking_channel_permission(ChannelPermission::ManageCustomisation)?;

    let name = data.into_inner().name;
    if !valid_sticker_name(&name) {
        return Err(invalid("sticker name must be 2-32 letters, numbers or underscores"));
    }

    let key = format!("stickers:{}", server.id);
    let mut doc = load::<StickersDoc>(db, &key).await?.unwrap_or_default();
    doc.id = key.clone();
    if doc.items.len() >= MAX_STICKERS {
        return Err(invalid("too many stickers"));
    }
    if doc.items.iter().any(|s| s.id == sticker_id || s.name.eq_ignore_ascii_case(&name)) {
        return Err(invalid("sticker already exists"));
    }

    let file = File::use_emoji(db, &sticker_id, &sticker_id, &user.id).await?;
    let sticker = Sticker {
        id: sticker_id,
        name,
        animated: file.content_type == "image/gif",
        creator: user.id,
    };
    doc.items.push(sticker.clone());
    store(db, &key, &doc).await?;
    Ok(Json(sticker))
}

/// # Delete Sticker
///
/// Remove a server sticker.
#[openapi(tag = "Server Information")]
#[delete("/<target>/stickers/<sticker_id>")]
pub async fn delete_sticker(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    sticker_id: String,
) -> Result<EmptyResponse> {
    let server = target.as_server(db).await?;
    let mut query = DatabasePermissionQuery::new(db, &user).server(&server);
    calculate_server_permissions(&mut query)
        .await
        .throw_if_lacking_channel_permission(ChannelPermission::ManageCustomisation)?;

    let key = format!("stickers:{}", server.id);
    let mut doc = load::<StickersDoc>(db, &key).await?.unwrap_or_default();
    let before = doc.items.len();
    doc.items.retain(|s| s.id != sticker_id);
    if doc.items.len() == before {
        return Err(create_error!(NotFound));
    }
    doc.id = key.clone();
    store(db, &key, &doc).await?;
    Ok(EmptyResponse)
}

// ---------------------------------------------------------------- temp bans

#[derive(Serialize, Deserialize, Clone, Debug, JsonSchema)]
pub struct TempBan {
    pub server: String,
    pub user: String,
    /// Expiry, unix milliseconds
    pub expires: i64,
}

#[derive(Serialize, Deserialize, Default)]
struct TempBansDoc {
    #[serde(rename = "_id", default)]
    id: String,
    items: Vec<TempBan>,
}

const TEMPBANS_KEY: &str = "tempbans:all";

#[derive(Deserialize, JsonSchema)]
pub struct DataTempBan {
    /// Ban length in minutes (1 minute to 1 year)
    pub duration_minutes: i64,
    pub reason: Option<String>,
}

/// # Temporarily Ban User
///
/// Ban a user; the ban is lifted automatically when it expires.
#[openapi(tag = "Server Members")]
#[put("/<server>/tempbans/<target>", data = "<data>")]
pub async fn temp_ban(
    db: &State<Database>,
    voice_client: &State<VoiceClient>,
    user: User,
    reason: AuditLogReason,
    server: Reference<'_>,
    target: Reference<'_>,
    data: Json<DataTempBan>,
) -> Result<Json<TempBan>> {
    let data = data.into_inner();
    if !(1..=MAX_TEMPBAN_MINUTES).contains(&data.duration_minutes) {
        return Err(invalid("duration must be between 1 minute and 1 year"));
    }
    if data.reason.as_deref().map_or(false, |r| r.len() > 1024) {
        return Err(invalid("reason too long"));
    }

    let server = server.as_server(db).await?;
    if target.id == user.id {
        return Err(create_error!(CannotRemoveYourself));
    }
    if target.id == server.owner {
        return Err(create_error!(InvalidOperation));
    }

    let mut query = DatabasePermissionQuery::new(db, &user).server(&server);
    calculate_server_permissions(&mut query)
        .await
        .throw_if_lacking_channel_permission(ChannelPermission::BanMembers)?;

    let key = TEMPBANS_KEY.to_string();
    let mut doc = load::<TempBansDoc>(db, &key).await?.unwrap_or_default();
    doc.id = key.clone();
    if doc.items.len() >= MAX_TEMPBANS {
        return Err(invalid("too many active temporary bans"));
    }

    if let Ok(member) = target.as_member(db, &server.id).await {
        if member.get_ranking(query.server_ref().as_ref().unwrap())
            <= query.get_member_rank().unwrap_or(i64::MIN)
        {
            return Err(create_error!(NotElevated));
        }
        member
            .remove(db, &server, RemovalIntention::Ban, false)
            .await?;
        if let Some(channel_id) = get_user_voice_channel_in_server(target.id, &server.id).await? {
            remove_user_from_voice_channel(
                voice_client,
                &UserVoiceChannel {
                    id: channel_id,
                    server_id: Some(server.id.clone()),
                },
                target.id,
            )
            .await?;
        }
    }

    ServerBan::create(db, &server, target.id, data.reason.clone()).await?;

    let ban = TempBan {
        server: server.id.clone(),
        user: target.id.to_string(),
        expires: now_ms() + data.duration_minutes * 60_000,
    };
    doc.items
        .retain(|b| !(b.server == ban.server && b.user == ban.user));
    doc.items.push(ban.clone());
    store(db, &key, &doc).await?;

    AuditLogEntryAction::BanCreate {
        user: target.id.to_string(),
    }
    .insert(
        db,
        server.id.clone(),
        reason.0.or(data.reason.clone()),
        user.id,
        Some(target.id.to_string()),
    )
    .await;

    notify(
        db,
        target.id,
        "tempban",
        &format!("Temporarily banned from {}", server.name),
        &format!(
            "You were banned for {} minutes.{}",
            data.duration_minutes,
            data.reason.map(|r| format!(" Reason: {r}")).unwrap_or_default()
        ),
        Some(&server.id),
    )
    .await;

    Ok(Json(ban))
}

/// # List Temporary Bans
///
/// List active temporary bans for a server.
#[openapi(tag = "Server Members")]
#[get("/<server>/tempbans")]
pub async fn list_temp_bans(
    db: &State<Database>,
    user: User,
    server: Reference<'_>,
) -> Result<Json<Vec<TempBan>>> {
    let server = server.as_server(db).await?;
    let mut query = DatabasePermissionQuery::new(db, &user).server(&server);
    calculate_server_permissions(&mut query)
        .await
        .throw_if_lacking_channel_permission(ChannelPermission::BanMembers)?;
    let doc = load::<TempBansDoc>(db, TEMPBANS_KEY).await?.unwrap_or_default();
    Ok(Json(
        doc.items.into_iter().filter(|b| b.server == server.id).collect(),
    ))
}

/// Lift every expired temporary ban once. Returns how many were processed.
pub async fn sweep_temp_bans(db: &Database) -> Result<usize> {
    let Some(mut doc) = load::<TempBansDoc>(db, TEMPBANS_KEY).await? else {
        return Ok(0);
    };
    let now = now_ms();
    let (expired, active): (Vec<_>, Vec<_>) = doc.items.into_iter().partition(|b| b.expires <= now);
    for ban in &expired {
        let id = MemberCompositeKey {
            server: ban.server.clone(),
            user: ban.user.clone(),
        };
        // The ban may already have been lifted manually
        let _ = db.delete_ban(&id).await;
    }
    if expired.is_empty() {
        return Ok(0);
    }
    doc.id = TEMPBANS_KEY.to_string();
    doc.items = active;
    store(db, TEMPBANS_KEY, &doc).await?;
    Ok(expired.len())
}

/// Background loop lifting expired temporary bans.
pub async fn temp_ban_sweeper(db: Database) {
    loop {
        match sweep_temp_bans(&db).await {
            Ok(n) if n > 0 => log::info!("Lifted {n} expired temporary bans."),
            Ok(_) => {}
            Err(error) => log::error!("temp ban sweep failed: {error:?}"),
        }
        tokio::time::sleep(Duration::from_secs(30)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sticker_names() {
        assert!(valid_sticker_name("party_parrot"));
        assert!(!valid_sticker_name("a"));
        assert!(!valid_sticker_name("has space"));
        assert!(!valid_sticker_name(&"x".repeat(33)));
    }
}
