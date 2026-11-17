use std::collections::HashMap;

use mongodb::{bson::doc, options::ReplaceOptions};
use revolt_database::{
    util::{permissions::DatabasePermissionQuery, reference::Reference},
    Database, User,
};
use revolt_permissions::{calculate_server_permissions, ChannelPermission};
use revolt_result::{create_error, Result};
use rocket::{serde::json::Json, State};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use revolt_database::UserSettingsImpl;

/// Nitro tier recorded in the user's server-side economy state.
async fn nitro_tier(db: &Database, user_id: &str) -> Option<String> {
    let key = "nullcord:economy".to_string();
    let settings = db.fetch_user_settings(user_id, &[key.clone()]).await.ok()?;
    let (_, value) = settings.get(&key)?;
    serde_json::from_str::<serde_json::Value>(value)
        .ok()?
        .get("nitro")?
        .as_str()
        .map(str::to_string)
}

const COLLECTION: &str = "nullcord_extras";
const MAX_BOOSTS: u32 = 14;
const BOOSTS_PER_NITRO: u32 = 2;
const VANITY_BOOSTS: u32 = 14;
/// Admins have effectively unlimited boosts.
const ADMIN_BOOSTS: u32 = 1_000;

/// Server-side Nullcord data for a server (tag, boosts, vanity link).
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct ServerExtrasDoc {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(default)]
    pub vanity: Option<String>,
    #[serde(default)]
    pub boosts: HashMap<String, u32>,
}

/// The tag a user has chosen to show next to their name.
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct UserTagDoc {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(default)]
    pub server: Option<String>,
    /// Profile card accent colour (`#rrggbb`)
    #[serde(default)]
    pub accent: Option<String>,
    /// Card background gradient stops (`#rrggbb`, up to 6)
    #[serde(default)]
    pub colors: Vec<String>,
    /// Gradient angle in degrees
    #[serde(default)]
    pub angle: Option<u32>,
}

pub fn server_key(id: &str) -> String {
    format!("server:{id}")
}

pub fn user_key(id: &str) -> String {
    format!("user:{id}")
}

pub async fn load<T>(db: &Database, key: &str) -> Result<Option<T>>
where
    T: serde::de::DeserializeOwned + Send + Sync + Unpin,
{
    match db {
        Database::MongoDb(m) => m
            .col::<T>(COLLECTION)
            .find_one(doc! { "_id": key })
            .await
            .map_err(|_| create_error!(InternalError)),
        _ => Ok(None),
    }
}

pub async fn store<T>(db: &Database, key: &str, value: &T) -> Result<()>
where
    T: Serialize + Send + Sync,
{
    match db {
        Database::MongoDb(m) => {
            m.col::<T>(COLLECTION)
                .replace_one(doc! { "_id": key }, value)
                .with_options(ReplaceOptions::builder().upsert(true).build())
                .await
                .map_err(|_| create_error!(InternalError))?;
            Ok(())
        }
        _ => Err(create_error!(InternalError)),
    }
}

fn clean_tag(tag: &str) -> String {
    tag.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(4)
        .collect()
}

fn clean_vanity(code: &str) -> String {
    code.to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '-')
        .take(24)
        .collect()
}

#[derive(Serialize, JsonSchema)]
pub struct ServerExtrasResponse {
    tag: Option<String>,
    vanity: Option<String>,
    boosts: HashMap<String, u32>,
    /// Boosts the requesting user may still add (their nitro capacity)
    capacity: u32,
}

fn is_admin(user: &User) -> bool {
    user.privileged || user.id == "01M5KCFRPDZZHPADH5BKJT19VG"
}

async fn capacity(db: &Database, user: &User) -> u32 {
    if is_admin(user) {
        return ADMIN_BOOSTS;
    }
    match nitro_tier(db, &user.id).await.as_deref() {
        Some("nitro") => BOOSTS_PER_NITRO,
        _ => 0,
    }
}

async fn respond(db: &Database, doc: ServerExtrasDoc, user: &User) -> ServerExtrasResponse {
    ServerExtrasResponse {
        tag: doc.tag,
        vanity: doc.vanity,
        boosts: doc.boosts,
        capacity: capacity(db, user).await,
    }
}

async fn require_member(db: &Database, server: &str, user: &User) -> Result<()> {
    use revolt_database::Member;
    let _ = std::marker::PhantomData::<Member>;
    db.fetch_member(server, &user.id).await.map(|_| ())
}

/// # Fetch Server Extras
///
/// Server tag, boosts and custom invite. Stored on the server, shared by
/// every member.
#[openapi(tag = "Server Information")]
#[get("/<target>/extras")]
pub async fn fetch_extras(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
) -> Result<Json<ServerExtrasResponse>> {
    let server = target.as_server(db).await?;
    require_member(db, &server.id, &user).await?;
    let doc = load::<ServerExtrasDoc>(db, &server_key(&server.id))
        .await?
        .unwrap_or_default();
    Ok(Json(respond(db, doc, &user).await))
}

#[derive(Deserialize, JsonSchema)]
pub struct DataEditExtras {
    tag: Option<String>,
    vanity: Option<String>,
}

/// # Edit Server Extras
///
/// Sets the server tag and/or custom invite. Needs Manage Server.
#[openapi(tag = "Server Information")]
#[patch("/<target>/extras", data = "<data>")]
pub async fn edit_extras(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    data: Json<DataEditExtras>,
) -> Result<Json<ServerExtrasResponse>> {
    let data = data.into_inner();
    let server = target.as_server(db).await?;
    let mut query = DatabasePermissionQuery::new(db, &user).server(&server);
    calculate_server_permissions(&mut query)
        .await
        .throw_if_lacking_channel_permission(ChannelPermission::ManageServer)?;

    let key = server_key(&server.id);
    let mut doc = load::<ServerExtrasDoc>(db, &key).await?.unwrap_or_default();
    doc.id = key.clone();

    if let Some(tag) = data.tag {
        let tag = clean_tag(&tag);
        doc.tag = if tag.is_empty() { None } else { Some(tag) };
    }

    if let Some(vanity) = data.vanity {
        let vanity = clean_vanity(&vanity);
        if vanity.is_empty() {
            doc.vanity = None;
        } else {
            let total: u32 = doc.boosts.values().sum();
            let owner = db.fetch_user(&server.owner).await.ok();
            let infinite = is_admin(&user) || owner.map(|o| is_admin(&o)).unwrap_or(false);
            if total < VANITY_BOOSTS && !infinite {
                return Err(create_error!(NotPrivileged));
            }
            doc.vanity = Some(vanity);
        }
    }

    store(db, &key, &doc).await?;
    Ok(Json(respond(db, doc, &user).await))
}

#[derive(Deserialize, JsonSchema)]
pub struct DataBoost {
    /// How many boosts you want to give this server
    count: u32,
}

/// # Set My Boosts
///
/// Sets how many of your boosts go to this server. Needs Nitro.
#[openapi(tag = "Server Information")]
#[put("/<target>/extras/boost", data = "<data>")]
pub async fn set_boost(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    data: Json<DataBoost>,
) -> Result<Json<ServerExtrasResponse>> {
    let count = data.into_inner().count;
    let server = target.as_server(db).await?;
    require_member(db, &server.id, &user).await?;

    if count > capacity(db, &user).await {
        return Err(create_error!(NotPrivileged));
    }

    let key = server_key(&server.id);
    let mut doc = load::<ServerExtrasDoc>(db, &key).await?.unwrap_or_default();
    doc.id = key.clone();

    let others: u32 = doc
        .boosts
        .iter()
        .filter(|(id, _)| **id != user.id)
        .map(|(_, n)| *n)
        .sum();
    if !is_admin(&user) && others + count > MAX_BOOSTS {
        return Err(create_error!(InvalidOperation));
    }

    if count == 0 {
        doc.boosts.remove(&user.id);
    } else {
        doc.boosts.insert(user.id.clone(), count);
    }

    store(db, &key, &doc).await?;
    Ok(Json(respond(db, doc, &user).await))
}

#[derive(Serialize, JsonSchema)]
pub struct UserTagResponse {
    server: Option<String>,
    tag: Option<String>,
    nitro: Option<String>,
    accent: Option<String>,
    colors: Vec<String>,
    angle: Option<u32>,
}

pub async fn user_tag(db: &Database, user: &User) -> Result<UserTagResponse> {
    let mut out = UserTagResponse {
        server: None,
        tag: None,
        nitro: if is_admin(user) {
            Some("nitro".to_string())
        } else {
            nitro_tier(db, &user.id).await
        },
        accent: None,
        colors: vec![],
        angle: None,
    };

    if let Some(sel) = load::<UserTagDoc>(db, &user_key(&user.id)).await? {
        out.accent = sel.accent.clone();
        out.colors = sel.colors.clone();
        out.angle = sel.angle;
        if let Some(server) = sel.server {
            // Only show the tag while the user is still a member
            if db.fetch_member(&server, &user.id).await.is_ok() {
                out.tag = load::<ServerExtrasDoc>(db, &server_key(&server))
                    .await?
                    .and_then(|d| d.tag);
                if out.tag.is_some() {
                    out.server = Some(server);
                }
            }
        }
    }

    Ok(out)
}

/// # Fetch User Tag
///
/// The server tag a user is wearing and their public Nitro tier.
#[openapi(tag = "User Information")]
#[get("/<target>/nullcord")]
pub async fn fetch_user_tag(
    db: &State<Database>,
    _user: User,
    target: Reference<'_>,
) -> Result<Json<UserTagResponse>> {
    let target = target.as_user(db).await?;
    Ok(Json(user_tag(db, &target).await?))
}

#[derive(Deserialize, JsonSchema)]
pub struct DataEquipTag {
    /// Server whose tag to wear, or null to clear
    server: Option<String>,
}

/// # Equip Server Tag
///
/// Chooses which server tag you wear. Saved to your account.
#[openapi(tag = "User Information")]
#[put("/@me/nullcord/tag", data = "<data>")]
pub async fn equip_tag(
    db: &State<Database>,
    user: User,
    data: Json<DataEquipTag>,
) -> Result<Json<UserTagResponse>> {
    let server = data.into_inner().server;

    if let Some(id) = &server {
        db.fetch_member(id, &user.id).await?;
        let has_tag = load::<ServerExtrasDoc>(db, &server_key(id))
            .await?
            .and_then(|d| d.tag)
            .is_some();
        if !has_tag {
            return Err(create_error!(InvalidOperation));
        }
    }

    let key = user_key(&user.id);
    let mut doc = load::<UserTagDoc>(db, &key).await?.unwrap_or_default();
    doc.id = key.clone();
    doc.server = server;
    store(db, &key, &doc).await?;
    Ok(Json(user_tag(db, &user).await?))
}

#[derive(Deserialize, JsonSchema)]
pub struct DataAccent {
    /// Gradient stops as `#rrggbb` (1-6); empty clears
    colors: Vec<String>,
    /// Gradient angle in degrees
    angle: Option<u32>,
}

/// # Set Profile Card Colours
///
/// Sets the background colour or gradient of your profile card. Saved to your account.
#[openapi(tag = "User Information")]
#[put("/@me/nullcord/accent", data = "<data>")]
pub async fn set_accent(
    db: &State<Database>,
    user: User,
    data: Json<DataAccent>,
) -> Result<Json<UserTagResponse>> {
    let data = data.into_inner();
    if data.colors.len() > 6 {
        return Err(create_error!(InvalidProperty));
    }
    let mut colors = Vec::new();
    for c in data.colors {
        let ok = c.len() == 7
            && c.starts_with('#')
            && c[1..].chars().all(|ch| ch.is_ascii_hexdigit());
        if !ok {
            return Err(create_error!(InvalidProperty));
        }
        colors.push(c.to_lowercase());
    }

    let key = user_key(&user.id);
    let mut doc = load::<UserTagDoc>(db, &key).await?.unwrap_or_default();
    doc.id = key.clone();
    doc.accent = colors.first().cloned();
    doc.colors = colors;
    doc.angle = data.angle.map(|a| a % 360);
    store(db, &key, &doc).await?;
    Ok(Json(user_tag(db, &user).await?))
}

/// # Fetch Discord Template
///
/// Fetches a Discord server template by code so it can be imported as a new server.
#[openapi(tag = "User Information")]
#[get("/@me/nullcord/template/<code>")]
pub async fn fetch_discord_template(
    _user: User,
    code: String,
) -> Result<Json<serde_json::Value>> {
    if code.is_empty()
        || code.len() > 64
        || !code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(create_error!(InvalidProperty));
    }

    let res = reqwest::Client::new()
        .get(format!("https://discord.com/api/v9/guilds/templates/{code}"))
        .header("User-Agent", "NullCord-template-import")
        .send()
        .await
        .map_err(|_| create_error!(InternalError))?;
    if !res.status().is_success() {
        return Err(create_error!(NotFound));
    }
    let value = res
        .json::<serde_json::Value>()
        .await
        .map_err(|_| create_error!(InternalError))?;
    Ok(Json(value))
}
