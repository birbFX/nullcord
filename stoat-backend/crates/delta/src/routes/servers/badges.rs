use revolt_database::{util::reference::Reference, Database, User};
use revolt_result::{create_error, Result};
use rocket::{serde::json::Json, State};
use rocket_empty::EmptyResponse;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::extras::{load, store};

const OWNER_ID: &str = "01M5KCFRPDZZHPADH5BKJT19VG";
const CATALOG_KEY: &str = "badges:catalog";
const MAX_BADGES: usize = 100;
const MAX_PER_USER: usize = 24;
const MAX_IMAGE_CHARS: usize = 150_000;

/// Built-in artwork a badge can reuse (served from `/assets/badges/<name>.svg`).
const PRESETS: &[&str] = &[
    "active_supporter",
    "admin",
    "amog",
    "amorbus",
    "bestie",
    "bughunter",
    "developer",
    "developer_wrench",
    "early_adopter",
    "early_member",
    "former_admin",
    "founder",
    "mod",
    "moderation",
    "nitro-gift",
    "nitro",
    "paw",
    "raccoon",
    "revolt_r",
    "supporter",
    "translator",
    "trial_mod",
    "verified",
];

fn invalid(msg: &str) -> revolt_result::Error {
    create_error!(FailedValidation {
        error: msg.to_string()
    })
}

fn require_owner(user: &User) -> Result<()> {
    if user.id == OWNER_ID {
        Ok(())
    } else {
        Err(create_error!(NotPrivileged))
    }
}

fn user_key(id: &str) -> String {
    format!("badges:user:{id}")
}

#[derive(Serialize, Deserialize, Clone, Debug, JsonSchema)]
pub struct CustomBadge {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// `preset`, `emoji` or `image`
    pub kind: String,
    /// Preset name, an emoji, or an image data URI
    pub value: String,
    /// Optional ring/background colour as `#rrggbb`
    #[serde(default)]
    pub colour: Option<String>,
    #[serde(default)]
    pub created: i64,
}

#[derive(Serialize, Deserialize, Default)]
struct CatalogDoc {
    #[serde(rename = "_id", default)]
    id: String,
    #[serde(default)]
    badges: Vec<CustomBadge>,
}

#[derive(Serialize, Deserialize, Default)]
struct UserBadgesDoc {
    #[serde(rename = "_id", default)]
    id: String,
    #[serde(default)]
    badges: Vec<String>,
}

#[derive(Serialize, JsonSchema)]
pub struct BadgeCatalog {
    pub badges: Vec<CustomBadge>,
    /// Built-in artwork names usable with kind `preset`
    pub presets: Vec<String>,
    /// Whether the requesting user may manage badges
    pub can_manage: bool,
}

#[derive(Deserialize, JsonSchema)]
pub struct DataBadge {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub kind: String,
    pub value: String,
    #[serde(default)]
    pub colour: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
pub struct DataEditBadge {
    pub name: Option<String>,
    pub description: Option<String>,
    pub kind: Option<String>,
    pub value: Option<String>,
    /// Empty string clears the colour
    pub colour: Option<String>,
}

fn valid_image(value: &str) -> bool {
    let ok_prefix = ["png", "jpeg", "webp", "gif"]
        .iter()
        .any(|t| value.starts_with(&format!("data:image/{t};base64,")));
    ok_prefix
        && value.len() <= MAX_IMAGE_CHARS
        && value
            .split(',')
            .nth(1)
            .map(|b| {
                !b.is_empty()
                    && b.chars()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '='))
            })
            .unwrap_or(false)
}

fn validate_art(kind: &str, value: &str) -> Result<()> {
    match kind {
        "preset" => {
            if PRESETS.contains(&value) {
                Ok(())
            } else {
                Err(invalid("unknown preset badge"))
            }
        }
        "emoji" => {
            let n = value.chars().count();
            if (1..=8).contains(&n) && !value.chars().any(|c| c.is_control() || c.is_whitespace())
            {
                Ok(())
            } else {
                Err(invalid("emoji must be 1-8 visible characters"))
            }
        }
        "image" => {
            if valid_image(value) {
                Ok(())
            } else {
                Err(invalid(
                    "image must be a png, jpeg, webp or gif under 110 KB",
                ))
            }
        }
        _ => Err(invalid("kind must be preset, emoji or image")),
    }
}

fn clean_colour(c: &str) -> Result<Option<String>> {
    if c.is_empty() {
        return Ok(None);
    }
    let ok = c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|h| h.is_ascii_hexdigit());
    if ok {
        Ok(Some(c.to_lowercase()))
    } else {
        Err(invalid("colour must be #rrggbb"))
    }
}

fn clean_name(name: &str) -> Result<String> {
    let name = name.trim().to_string();
    if name.is_empty() || name.chars().count() > 32 {
        return Err(invalid("badge name must be 1-32 characters"));
    }
    Ok(name)
}

fn clean_description(desc: &str) -> Result<String> {
    let desc = desc.trim().to_string();
    if desc.chars().count() > 100 {
        return Err(invalid("badge description must be at most 100 characters"));
    }
    Ok(desc)
}

async fn load_catalog(db: &Database) -> Result<CatalogDoc> {
    let mut doc = load::<CatalogDoc>(db, CATALOG_KEY)
        .await?
        .unwrap_or_default();
    doc.id = CATALOG_KEY.to_string();
    Ok(doc)
}

/// # Fetch Badge Catalog
///
/// Lists every custom badge, the built-in artwork presets, and whether you can manage badges.
#[openapi(tag = "User Information")]
#[get("/@me/nullcord/badge-catalog")]
pub async fn fetch_catalog(db: &State<Database>, user: User) -> Result<Json<BadgeCatalog>> {
    let doc = load_catalog(db).await?;
    Ok(Json(BadgeCatalog {
        badges: doc.badges,
        presets: PRESETS.iter().map(|s| s.to_string()).collect(),
        can_manage: user.id == OWNER_ID,
    }))
}

/// # Create Badge
///
/// Creates a custom badge from a preset, an emoji or an uploaded image. Owner only.
#[openapi(tag = "User Information")]
#[post("/@me/nullcord/badge-catalog", data = "<data>")]
pub async fn create_badge(
    db: &State<Database>,
    user: User,
    data: Json<DataBadge>,
) -> Result<Json<CustomBadge>> {
    require_owner(&user)?;
    let data = data.into_inner();
    validate_art(&data.kind, &data.value)?;

    let mut doc = load_catalog(db).await?;
    if doc.badges.len() >= MAX_BADGES {
        return Err(invalid("too many custom badges"));
    }

    let badge = CustomBadge {
        id: ulid::Ulid::new().to_string(),
        name: clean_name(&data.name)?,
        description: clean_description(data.description.as_deref().unwrap_or(""))?,
        kind: data.kind,
        value: data.value,
        colour: match data.colour.as_deref() {
            Some(c) => clean_colour(c)?,
            None => None,
        },
        created: chrono::Utc::now().timestamp_millis(),
    };
    doc.badges.push(badge.clone());
    store(db, CATALOG_KEY, &doc).await?;
    Ok(Json(badge))
}

/// # Edit Badge
///
/// Changes a custom badge's name, description, artwork or colour. Owner only.
#[openapi(tag = "User Information")]
#[patch("/@me/nullcord/badge-catalog/<id>", data = "<data>")]
pub async fn edit_badge(
    db: &State<Database>,
    user: User,
    id: String,
    data: Json<DataEditBadge>,
) -> Result<Json<CustomBadge>> {
    require_owner(&user)?;
    let data = data.into_inner();
    let mut doc = load_catalog(db).await?;
    let badge = doc
        .badges
        .iter_mut()
        .find(|b| b.id == id)
        .ok_or_else(|| create_error!(NotFound))?;

    if let Some(name) = &data.name {
        badge.name = clean_name(name)?;
    }
    if let Some(desc) = &data.description {
        badge.description = clean_description(desc)?;
    }
    if data.kind.is_some() || data.value.is_some() {
        let kind = data.kind.unwrap_or_else(|| badge.kind.clone());
        let value = data.value.unwrap_or_else(|| badge.value.clone());
        validate_art(&kind, &value)?;
        badge.kind = kind;
        badge.value = value;
    }
    if let Some(c) = &data.colour {
        badge.colour = clean_colour(c)?;
    }

    let out = badge.clone();
    store(db, CATALOG_KEY, &doc).await?;
    Ok(Json(out))
}

/// # Delete Badge
///
/// Deletes a custom badge. It disappears from everyone who held it. Owner only.
#[openapi(tag = "User Information")]
#[delete("/@me/nullcord/badge-catalog/<id>")]
pub async fn delete_badge(db: &State<Database>, user: User, id: String) -> Result<EmptyResponse> {
    require_owner(&user)?;
    let mut doc = load_catalog(db).await?;
    let before = doc.badges.len();
    doc.badges.retain(|b| b.id != id);
    if doc.badges.len() == before {
        return Err(create_error!(NotFound));
    }
    store(db, CATALOG_KEY, &doc).await?;
    Ok(EmptyResponse)
}

/// # Give Badge
///
/// Gives a custom badge to a user. Owner only.
#[openapi(tag = "User Information")]
#[put("/@me/nullcord/badge-catalog/<id>/users/<target>")]
pub async fn give_badge(
    db: &State<Database>,
    user: User,
    id: String,
    target: Reference<'_>,
) -> Result<EmptyResponse> {
    require_owner(&user)?;
    let doc = load_catalog(db).await?;
    if !doc.badges.iter().any(|b| b.id == id) {
        return Err(create_error!(NotFound));
    }
    let holder = target.as_user(db).await?;

    let key = user_key(&holder.id);
    let mut mine = load::<UserBadgesDoc>(db, &key).await?.unwrap_or_default();
    mine.id = key.clone();
    if !mine.badges.contains(&id) {
        if mine.badges.len() >= MAX_PER_USER {
            return Err(invalid("that user already holds the maximum number of badges"));
        }
        mine.badges.push(id);
        store(db, &key, &mine).await?;
    }
    Ok(EmptyResponse)
}

/// # Take Badge
///
/// Removes a custom badge from a user. Owner only.
#[openapi(tag = "User Information")]
#[delete("/@me/nullcord/badge-catalog/<id>/users/<target>")]
pub async fn take_badge(
    db: &State<Database>,
    user: User,
    id: String,
    target: Reference<'_>,
) -> Result<EmptyResponse> {
    require_owner(&user)?;
    let holder = target.as_user(db).await?;
    let key = user_key(&holder.id);
    let mut mine = load::<UserBadgesDoc>(db, &key).await?.unwrap_or_default();
    mine.id = key.clone();
    let before = mine.badges.len();
    mine.badges.retain(|b| *b != id);
    if mine.badges.len() != before {
        store(db, &key, &mine).await?;
    }
    Ok(EmptyResponse)
}

/// # Fetch User Custom Badges
///
/// Custom badges a user holds, in the order they were given.
#[openapi(tag = "User Information")]
#[get("/<target>/nullcord/badges")]
pub async fn fetch_user_badges(
    db: &State<Database>,
    _user: User,
    target: Reference<'_>,
) -> Result<Json<Vec<CustomBadge>>> {
    let holder = target.as_user(db).await?;
    let mine = load::<UserBadgesDoc>(db, &user_key(&holder.id))
        .await?
        .unwrap_or_default();
    let catalog = load_catalog(db).await?;
    let out = mine
        .badges
        .iter()
        .filter_map(|id| catalog.badges.iter().find(|b| b.id == *id).cloned())
        .collect();
    Ok(Json(out))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn art_validation() {
        assert!(validate_art("preset", "bestie").is_ok());
        assert!(validate_art("preset", "nope").is_err());
        assert!(validate_art("emoji", "🔥").is_ok());
        assert!(validate_art("emoji", "").is_err());
        assert!(validate_art("emoji", "a b").is_err());
        assert!(validate_art("image", "data:image/png;base64,iVBORw0KGgo=").is_ok());
        assert!(validate_art("image", "data:image/svg+xml;base64,AAAA").is_err());
        assert!(validate_art("image", "https://evil.example/x.png").is_err());
        assert!(validate_art("image", "data:image/png;base64,<script>").is_err());
        assert!(validate_art("sticker", "x").is_err());
    }

    #[test]
    fn colour_and_names() {
        assert_eq!(clean_colour("").unwrap(), None);
        assert_eq!(clean_colour("#FFaa00").unwrap(), Some("#ffaa00".into()));
        assert!(clean_colour("red").is_err());
        assert!(clean_name("  ").is_err());
        assert!(clean_name(&"x".repeat(33)).is_err());
        assert_eq!(clean_name(" Hi ").unwrap(), "Hi");
    }

    #[test]
    fn image_size_cap() {
        let big = format!("data:image/png;base64,{}", "A".repeat(MAX_IMAGE_CHARS));
        assert!(!valid_image(&big));
    }
}
