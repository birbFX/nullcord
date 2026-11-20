use std::collections::HashMap;

use revolt_database::{
    util::{permissions::DatabasePermissionQuery, reference::Reference},
    Database, User,
};
use revolt_permissions::{calculate_server_permissions, ChannelPermission};
use revolt_result::{create_error, Result};
use rocket::{serde::json::Json, State};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::extras::{load, store};

const MAX_EVENTS: usize = 100;
const MAX_WARNINGS: usize = 1_000;
const MAX_BLOCKED_WORDS: usize = 200;

fn invalid(error: &str) -> revolt_result::Error {
    create_error!(FailedValidation {
        error: error.to_string()
    })
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

async fn require_server_permission(
    db: &Database,
    user: &User,
    server: &revolt_database::Server,
    permission: ChannelPermission,
) -> Result<()> {
    let mut query = DatabasePermissionQuery::new(db, user).server(server);
    calculate_server_permissions(&mut query)
        .await
        .throw_if_lacking_channel_permission(permission)?;
    Ok(())
}

// ───────────────────────────── Events ─────────────────────────────

#[derive(Serialize, Deserialize, Clone, Default, JsonSchema)]
pub struct ServerEvent {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub location: String,
    /// Start time, ms since epoch
    pub start: i64,
    /// End time, ms since epoch
    #[serde(default)]
    pub end: Option<i64>,
    pub creator: String,
    /// user id -> `going` | `interested`
    #[serde(default)]
    pub rsvp: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Default)]
struct EventsDoc {
    #[serde(rename = "_id")]
    id: String,
    #[serde(default)]
    events: Vec<ServerEvent>,
}

fn events_key(server: &str) -> String {
    format!("events:{server}")
}

async fn load_events(db: &Database, server: &str) -> Result<EventsDoc> {
    let mut doc = load::<EventsDoc>(db, &events_key(server))
        .await?
        .unwrap_or_default();
    doc.id = events_key(server);
    Ok(doc)
}

/// Validates and normalises event text and times.
fn validate_event(title: &str, description: &str, location: &str, start: i64, end: Option<i64>) -> Result<()> {
    if title.trim().is_empty() || title.chars().count() > 100 {
        return Err(invalid("title must be 1-100 characters"));
    }
    if description.chars().count() > 1000 {
        return Err(invalid("description must be at most 1000 characters"));
    }
    if location.chars().count() > 100 {
        return Err(invalid("location must be at most 100 characters"));
    }
    if let Some(end) = end {
        if end <= start {
            return Err(invalid("end must be after start"));
        }
    }
    Ok(())
}

#[derive(Deserialize, JsonSchema)]
pub struct DataCreateEvent {
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    location: String,
    start: i64,
    end: Option<i64>,
}

/// # List Server Events
///
/// Upcoming and in-progress events, soonest first.
#[openapi(tag = "Server Events")]
#[get("/<target>/events")]
pub async fn list_events(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
) -> Result<Json<Vec<ServerEvent>>> {
    let server = target.as_server(db).await?;
    db.fetch_member(&server.id, &user.id).await?;
    let mut events = load_events(db, &server.id).await?.events;
    let cutoff = now_ms();
    events.retain(|e| e.end.unwrap_or(e.start + 3_600_000) >= cutoff);
    events.sort_by_key(|e| e.start);
    Ok(Json(events))
}

/// # Create Server Event
///
/// Needs Manage Server.
#[openapi(tag = "Server Events")]
#[post("/<target>/events", data = "<data>")]
pub async fn create_event(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    data: Json<DataCreateEvent>,
) -> Result<Json<ServerEvent>> {
    let data = data.into_inner();
    let server = target.as_server(db).await?;
    require_server_permission(db, &user, &server, ChannelPermission::ManageServer).await?;
    validate_event(&data.title, &data.description, &data.location, data.start, data.end)?;
    if data.start < now_ms() {
        return Err(invalid("start must be in the future"));
    }

    let mut doc = load_events(db, &server.id).await?;
    if doc.events.len() >= MAX_EVENTS {
        return Err(invalid("too many events"));
    }
    let event = ServerEvent {
        id: ulid::Ulid::new().to_string(),
        title: data.title.trim().to_string(),
        description: data.description,
        location: data.location,
        start: data.start,
        end: data.end,
        creator: user.id.clone(),
        rsvp: HashMap::new(),
    };
    doc.events.push(event.clone());
    store(db, &events_key(&server.id), &doc).await?;
    Ok(Json(event))
}

#[derive(Deserialize, JsonSchema)]
pub struct DataEditEvent {
    title: Option<String>,
    description: Option<String>,
    location: Option<String>,
    start: Option<i64>,
    end: Option<i64>,
}

/// # Edit Server Event
///
/// Needs Manage Server.
#[openapi(tag = "Server Events")]
#[patch("/<target>/events/<event>", data = "<data>")]
pub async fn edit_event(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    event: String,
    data: Json<DataEditEvent>,
) -> Result<Json<ServerEvent>> {
    let data = data.into_inner();
    let server = target.as_server(db).await?;
    require_server_permission(db, &user, &server, ChannelPermission::ManageServer).await?;

    let mut doc = load_events(db, &server.id).await?;
    let found = doc
        .events
        .iter_mut()
        .find(|e| e.id == event)
        .ok_or_else(|| create_error!(NotFound))?;
    if let Some(v) = data.title {
        found.title = v.trim().to_string();
    }
    if let Some(v) = data.description {
        found.description = v;
    }
    if let Some(v) = data.location {
        found.location = v;
    }
    if let Some(v) = data.start {
        found.start = v;
    }
    if data.end.is_some() {
        found.end = data.end;
    }
    validate_event(&found.title, &found.description, &found.location, found.start, found.end)?;
    let out = found.clone();
    store(db, &events_key(&server.id), &doc).await?;
    Ok(Json(out))
}

/// # Delete Server Event
///
/// Needs Manage Server.
#[openapi(tag = "Server Events")]
#[delete("/<target>/events/<event>")]
pub async fn delete_event(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    event: String,
) -> Result<()> {
    let server = target.as_server(db).await?;
    require_server_permission(db, &user, &server, ChannelPermission::ManageServer).await?;
    let mut doc = load_events(db, &server.id).await?;
    let before = doc.events.len();
    doc.events.retain(|e| e.id != event);
    if doc.events.len() == before {
        return Err(create_error!(NotFound));
    }
    store(db, &events_key(&server.id), &doc).await
}

#[derive(Deserialize, JsonSchema)]
pub struct DataRsvp {
    /// `going`, `interested` or `none` to withdraw
    status: String,
}

/// # RSVP To Event
///
/// Any member can set their own response.
#[openapi(tag = "Server Events")]
#[put("/<target>/events/<event>/rsvp", data = "<data>")]
pub async fn rsvp_event(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    event: String,
    data: Json<DataRsvp>,
) -> Result<Json<ServerEvent>> {
    let status = data.into_inner().status;
    if !matches!(status.as_str(), "going" | "interested" | "none") {
        return Err(invalid("status must be going, interested or none"));
    }
    let server = target.as_server(db).await?;
    db.fetch_member(&server.id, &user.id).await?;
    let mut doc = load_events(db, &server.id).await?;
    let found = doc
        .events
        .iter_mut()
        .find(|e| e.id == event)
        .ok_or_else(|| create_error!(NotFound))?;
    if status == "none" {
        found.rsvp.remove(&user.id);
    } else {
        found.rsvp.insert(user.id.clone(), status);
    }
    let out = found.clone();
    store(db, &events_key(&server.id), &doc).await?;
    Ok(Json(out))
}

// ──────────────────────────── Warnings ────────────────────────────

#[derive(Serialize, Deserialize, Clone, JsonSchema)]
pub struct Warning {
    pub id: String,
    pub user: String,
    pub moderator: String,
    pub reason: String,
    /// ms since epoch
    pub created: i64,
}

#[derive(Serialize, Deserialize, Default)]
struct WarningsDoc {
    #[serde(rename = "_id")]
    id: String,
    #[serde(default)]
    warnings: Vec<Warning>,
}

fn warnings_key(server: &str) -> String {
    format!("warnings:{server}")
}

async fn load_warnings(db: &Database, server: &str) -> Result<WarningsDoc> {
    let mut doc = load::<WarningsDoc>(db, &warnings_key(server))
        .await?
        .unwrap_or_default();
    doc.id = warnings_key(server);
    Ok(doc)
}

#[derive(Deserialize, JsonSchema)]
pub struct DataCreateWarning {
    user: String,
    reason: String,
}

/// # Warn Member
///
/// Records a warning against a member. Needs Kick Members.
#[openapi(tag = "Server Moderation")]
#[post("/<target>/warnings", data = "<data>")]
pub async fn create_warning(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    data: Json<DataCreateWarning>,
) -> Result<Json<Warning>> {
    let data = data.into_inner();
    let server = target.as_server(db).await?;
    require_server_permission(db, &user, &server, ChannelPermission::KickMembers).await?;
    if data.reason.trim().is_empty() || data.reason.chars().count() > 500 {
        return Err(invalid("reason must be 1-500 characters"));
    }
    if data.user == user.id {
        return Err(invalid("you cannot warn yourself"));
    }
    if data.user == server.owner {
        return Err(create_error!(NotElevated));
    }
    db.fetch_member(&server.id, &data.user).await?;

    let mut doc = load_warnings(db, &server.id).await?;
    if doc.warnings.len() >= MAX_WARNINGS {
        doc.warnings.remove(0);
    }
    let warning = Warning {
        id: ulid::Ulid::new().to_string(),
        user: data.user,
        moderator: user.id.clone(),
        reason: data.reason.trim().to_string(),
        created: now_ms(),
    };
    doc.warnings.push(warning.clone());
    store(db, &warnings_key(&server.id), &doc).await?;
    Ok(Json(warning))
}

/// # List Warnings
///
/// All warnings in the server, newest first. Needs Kick Members.
#[openapi(tag = "Server Moderation")]
#[get("/<target>/warnings?<user_id>")]
pub async fn list_warnings(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    user_id: Option<String>,
) -> Result<Json<Vec<Warning>>> {
    let server = target.as_server(db).await?;
    require_server_permission(db, &user, &server, ChannelPermission::KickMembers).await?;
    let mut list = load_warnings(db, &server.id).await?.warnings;
    if let Some(id) = user_id {
        list.retain(|w| w.user == id);
    }
    list.reverse();
    Ok(Json(list))
}

/// # Delete Warning
///
/// Needs Kick Members.
#[openapi(tag = "Server Moderation")]
#[delete("/<target>/warnings/<warning>")]
pub async fn delete_warning(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    warning: String,
) -> Result<()> {
    let server = target.as_server(db).await?;
    require_server_permission(db, &user, &server, ChannelPermission::KickMembers).await?;
    let mut doc = load_warnings(db, &server.id).await?;
    let before = doc.warnings.len();
    doc.warnings.retain(|w| w.id != warning);
    if doc.warnings.len() == before {
        return Err(create_error!(NotFound));
    }
    store(db, &warnings_key(&server.id), &doc).await
}

// ───────────────────────────── Automod ─────────────────────────────

#[derive(Serialize, Deserialize, Clone, Default, JsonSchema)]
pub struct AutomodConfig {
    #[serde(default)]
    pub enabled: bool,
    /// Messages containing any of these words (case-insensitive, whole word) are blocked
    #[serde(default)]
    pub blocked_words: Vec<String>,
    /// Block messages with more than this many user/role mentions (0 = off)
    #[serde(default)]
    pub max_mentions: u32,
    /// Block messages containing http(s) links
    #[serde(default)]
    pub block_links: bool,
    /// Block Discord/NullCord invite links
    #[serde(default)]
    pub block_invites: bool,
    /// Block messages that are mostly capital letters (percent, 0 = off)
    #[serde(default)]
    pub max_caps_percent: u32,
}

#[derive(Serialize, Deserialize, Default)]
struct AutomodDoc {
    #[serde(rename = "_id")]
    id: String,
    #[serde(flatten)]
    config: AutomodConfig,
}

fn automod_key(server: &str) -> String {
    format!("automod:{server}")
}

/// Loads the automod config for a server (default: disabled).
pub async fn load_automod(db: &Database, server: &str) -> AutomodConfig {
    load::<AutomodDoc>(db, &automod_key(server))
        .await
        .ok()
        .flatten()
        .map(|d| d.config)
        .unwrap_or_default()
}

/// Returns the reason a message is blocked, or `None` if it passes.
pub fn automod_violation(config: &AutomodConfig, content: &str) -> Option<&'static str> {
    if !config.enabled {
        return None;
    }
    let lower = content.to_lowercase();

    for word in &config.blocked_words {
        let word = word.trim().to_lowercase();
        if word.is_empty() {
            continue;
        }
        let hit = lower
            .split(|c: char| !c.is_alphanumeric())
            .any(|token| token == word)
            || (word.contains(|c: char| !c.is_alphanumeric()) && lower.contains(&word));
        if hit {
            return Some("blocked word");
        }
    }

    if config.max_mentions > 0 {
        let mentions = content.matches("<@").count();
        if mentions as u32 > config.max_mentions {
            return Some("too many mentions");
        }
    }

    if config.block_invites
        && (lower.contains("discord.gg/")
            || lower.contains("discord.com/invite/")
            || lower.contains("/invite/"))
    {
        return Some("invite link");
    }

    if config.block_links && (lower.contains("http://") || lower.contains("https://")) {
        return Some("link");
    }

    if config.max_caps_percent > 0 {
        let letters: Vec<char> = content.chars().filter(|c| c.is_alphabetic()).collect();
        if letters.len() >= 10 {
            let caps = letters.iter().filter(|c| c.is_uppercase()).count();
            if (caps * 100 / letters.len()) as u32 > config.max_caps_percent {
                return Some("excessive caps");
            }
        }
    }

    None
}

/// # Fetch Automod Config
///
/// Needs Manage Server.
#[openapi(tag = "Server Moderation")]
#[get("/<target>/automod")]
pub async fn fetch_automod(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
) -> Result<Json<AutomodConfig>> {
    let server = target.as_server(db).await?;
    require_server_permission(db, &user, &server, ChannelPermission::ManageServer).await?;
    Ok(Json(load_automod(db, &server.id).await))
}

/// # Edit Automod Config
///
/// Replaces the automod rules. Needs Manage Server.
#[openapi(tag = "Server Moderation")]
#[put("/<target>/automod", data = "<data>")]
pub async fn edit_automod(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    data: Json<AutomodConfig>,
) -> Result<Json<AutomodConfig>> {
    let mut config = data.into_inner();
    let server = target.as_server(db).await?;
    require_server_permission(db, &user, &server, ChannelPermission::ManageServer).await?;

    config.blocked_words = config
        .blocked_words
        .into_iter()
        .map(|w| w.trim().to_lowercase())
        .filter(|w| !w.is_empty() && w.chars().count() <= 50)
        .take(MAX_BLOCKED_WORDS)
        .collect();
    if config.max_mentions > 100 || config.max_caps_percent > 100 {
        return Err(invalid("max_mentions and max_caps_percent are out of range"));
    }

    let doc = AutomodDoc {
        id: automod_key(&server.id),
        config: config.clone(),
    };
    store(db, &automod_key(&server.id), &doc).await?;
    Ok(Json(config))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> AutomodConfig {
        AutomodConfig {
            enabled: true,
            blocked_words: vec!["badword".into()],
            max_mentions: 3,
            block_links: false,
            block_invites: true,
            max_caps_percent: 70,
        }
    }

    #[test]
    fn disabled_allows_everything() {
        let mut c = cfg();
        c.enabled = false;
        assert_eq!(automod_violation(&c, "BADWORD discord.gg/x"), None);
    }

    #[test]
    fn blocked_word_is_whole_word_and_case_insensitive() {
        assert_eq!(automod_violation(&cfg(), "you BadWord!"), Some("blocked word"));
        assert_eq!(automod_violation(&cfg(), "badwords are fine"), None);
    }

    #[test]
    fn mentions_over_limit_blocked() {
        let ok = "<@A> <@B> <@C> hi";
        let bad = "<@A> <@B> <@C> <@D> hi";
        assert_eq!(automod_violation(&cfg(), ok), None);
        assert_eq!(automod_violation(&cfg(), bad), Some("too many mentions"));
    }

    #[test]
    fn invites_and_links() {
        assert_eq!(automod_violation(&cfg(), "join discord.gg/abc"), Some("invite link"));
        assert_eq!(automod_violation(&cfg(), "see https://example.com"), None);
        let mut c = cfg();
        c.block_links = true;
        assert_eq!(automod_violation(&c, "see https://example.com"), Some("link"));
    }

    #[test]
    fn caps_only_checked_for_longer_messages() {
        assert_eq!(automod_violation(&cfg(), "OK"), None);
        assert_eq!(
            automod_violation(&cfg(), "STOP SHOUTING AT EVERYONE"),
            Some("excessive caps")
        );
        assert_eq!(automod_violation(&cfg(), "Normal sentence here, fine."), None);
    }

    #[test]
    fn event_validation() {
        assert!(validate_event("Game night", "", "", 10, Some(20)).is_ok());
        assert!(validate_event("", "", "", 10, None).is_err());
        assert!(validate_event("x", "", "", 10, Some(10)).is_err());
        assert!(validate_event(&"a".repeat(101), "", "", 10, None).is_err());
    }
}
