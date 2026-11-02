use chrono::Utc;
use revolt_database::{Database, User, UserSettingsImpl};
use revolt_result::{create_error, Result};
use rocket::{serde::json::Json, State};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const OWNER_ID: &str = "01M5KCFRPDZZHPADH5BKJT19VG";
const CLL_SERVER_ID: &str = "01M5KCHRW16JAS02MQN2SWRNX8";
const ECONOMY_KEY: &str = "nullcord:economy";
const DAILY_QUESTS: usize = 6;

#[derive(Serialize, Deserialize, Clone, Default)]
struct EconomyState {
    #[serde(default)]
    orbs: i64,
    #[serde(default)]
    nitro: Option<String>,
    #[serde(default)]
    date: String,
    #[serde(default)]
    events: HashMap<String, u32>,
    #[serde(default)]
    claimed: Vec<String>,
    #[serde(default)]
    spoken_servers: Vec<String>,
}

#[derive(Clone, Copy)]
struct QuestDef {
    id: &'static str,
    verification: &'static str,
    target: u32,
    reward: i64,
}

/// Only quests that can be verified by the API. Client-only actions are not
/// included in the daily pool, so a modified client cannot claim them.
const QUEST_DEFS: &[QuestDef] = &[
    QuestDef { id: "first_hello", verification: "first_message_server", target: 1, reward: 40 },
    QuestDef { id: "chat_1", verification: "message_sent", target: 1, reward: 15 },
    QuestDef { id: "chat_3", verification: "message_sent", target: 3, reward: 25 },
    QuestDef { id: "chat_10", verification: "message_sent", target: 10, reward: 45 },
    QuestDef { id: "chat_25", verification: "message_sent", target: 25, reward: 90 },
    QuestDef { id: "image_1", verification: "image_sent", target: 1, reward: 30 },
    QuestDef { id: "image_3", verification: "image_sent", target: 3, reward: 60 },
    QuestDef { id: "image_5", verification: "image_sent", target: 5, reward: 100 },
    QuestDef { id: "react_1", verification: "reaction", target: 1, reward: 15 },
    QuestDef { id: "react_5", verification: "reaction", target: 5, reward: 35 },
    QuestDef { id: "react_10", verification: "reaction", target: 10, reward: 65 },
    QuestDef { id: "invite_1", verification: "invite_created", target: 1, reward: 35 },
    QuestDef { id: "invite_3", verification: "invite_created", target: 3, reward: 70 },
    QuestDef { id: "invite_join", verification: "invite_joined", target: 1, reward: 80 },
    QuestDef { id: "invite_join_cll", verification: "invite_joined_cll", target: 1, reward: 120 },
    QuestDef { id: "voice_join", verification: "voice_join", target: 1, reward: 30 },
    QuestDef { id: "voice_hangout", verification: "voice_with_others", target: 1, reward: 70 },
    QuestDef { id: "profile_bio", verification: "profile_updated", target: 1, reward: 30 },
    QuestDef { id: "avatar", verification: "avatar_updated", target: 1, reward: 35 },
    QuestDef { id: "status", verification: "status_updated", target: 1, reward: 20 },
    QuestDef { id: "theme", verification: "theme_changed", target: 1, reward: 30 },
    QuestDef { id: "server_create", verification: "server_created", target: 1, reward: 50 },
    QuestDef { id: "friend", verification: "friend_requested", target: 1, reward: 30 },
];

#[derive(Serialize, JsonSchema)]
struct QuestResponse {
    id: String,
    verification: String,
    target: u32,
    reward: i64,
    progress: u32,
    verified: bool,
    claimed: bool,
}

#[derive(Serialize, JsonSchema)]
struct EconomyResponse {
    orbs: i64,
    nitro: Option<String>,
    date: String,
    admin: bool,
    quests: Vec<QuestResponse>,
}

fn today() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

fn fnv1a(value: &str) -> u32 {
    let mut hash = 2_166_136_261_u32;
    for byte in value.as_bytes() {
        hash ^= *byte as u32;
        hash = hash.wrapping_mul(16_777_619);
    }
    hash
}

fn daily_quests(user_id: &str, date: &str) -> Vec<&'static QuestDef> {
    let mut quests: Vec<&'static QuestDef> = QUEST_DEFS.iter().collect();
    quests.sort_by_key(|quest| fnv1a(&format!("{date}:{user_id}:{}", quest.id)));
    quests.truncate(DAILY_QUESTS);
    quests
}

fn is_admin(user: &User) -> bool {
    user.privileged || user.id == OWNER_ID
}

fn reset_if_needed(state: &mut EconomyState) {
    let date = today();
    if state.date != date {
        state.date = date;
        state.events.clear();
        state.claimed.clear();
    }
}

async fn load_state(db: &Database, user_id: &str) -> Result<EconomyState> {
    let settings = db
        .fetch_user_settings(user_id, &[ECONOMY_KEY.to_string()])
        .await?;

    let mut state = settings
        .get(ECONOMY_KEY)
        .and_then(|(_, value)| serde_json::from_str(value).ok())
        .unwrap_or_default();
    reset_if_needed(&mut state);
    Ok(state)
}

async fn save_state(db: &Database, user_id: &str, state: &EconomyState) -> Result<()> {
    let value = serde_json::to_string(state).map_err(|_| create_error!(InternalError))?;
    let mut settings = HashMap::new();
    settings.insert(
        ECONOMY_KEY.to_string(),
        (Utc::now().timestamp_millis(), value),
    );
    settings.set(db, user_id).await
}

fn response(state: &EconomyState, user: &User) -> EconomyResponse {
    let mut quests = Vec::new();
    for quest in daily_quests(&user.id, &state.date) {
        let progress = state
            .events
            .get(quest.verification)
            .copied()
            .unwrap_or(0)
            .min(quest.target);
        quests.push(QuestResponse {
            id: quest.id.to_string(),
            verification: quest.verification.to_string(),
            target: quest.target,
            reward: quest.reward,
            progress,
            verified: progress >= quest.target,
            claimed: state.claimed.iter().any(|id| id == quest.id),
        });
    }

    EconomyResponse {
        orbs: state.orbs,
        nitro: state.nitro.clone(),
        date: state.date.clone(),
        admin: is_admin(user),
        quests,
    }
}

/// # Fetch Economy
///
/// Returns the current user's Orbs, Nitro tier and daily quest state from the
/// server. This data is never read from or written to client storage.
#[openapi(tag = "Economy")]
#[get("/@me/economy")]
pub async fn fetch(db: &State<Database>, user: User) -> Result<Json<EconomyResponse>> {
    let state = load_state(db.inner(), &user.id).await?;
    Ok(Json(response(&state, &user)))
}

/// # Claim Daily Quest
#[openapi(tag = "Economy")]
#[post("/@me/economy/quests/<quest_id>/claim")]
pub async fn claim_quest(
    db: &State<Database>,
    user: User,
    quest_id: String,
) -> Result<Json<EconomyResponse>> {
    let mut state = load_state(db.inner(), &user.id).await?;
    reset_if_needed(&mut state);

    let quest = daily_quests(&user.id, &state.date)
        .into_iter()
        .find(|quest| quest.id == quest_id.as_str())
        .ok_or_else(|| create_error!(NotFound))?;

    if state.claimed.iter().any(|id| id == &quest_id) {
        return Err(create_error!(NoEffect));
    }

    let progress = state
        .events
        .get(quest.verification)
        .copied()
        .unwrap_or(0);
    if progress < quest.target {
        return Err(create_error!(InvalidOperation));
    }

    state.orbs = state.orbs.saturating_add(quest.reward);
    state.claimed.push(quest_id);
    save_state(db.inner(), &user.id, &state).await?;

    Ok(Json(response(&state, &user)))
}

#[derive(Deserialize, JsonSchema)]
pub struct DataRedeemNitro {
    pub plan: String,
}

/// # Redeem Nitro
///
/// Spends Orbs server-side. The client cannot set a balance or tier directly.
#[openapi(tag = "Economy")]
#[post("/@me/economy/nitro/redeem", data = "<data>")]
pub async fn redeem_nitro(
    db: &State<Database>,
    user: User,
    data: Json<DataRedeemNitro>,
) -> Result<Json<EconomyResponse>> {
    let plan = data.into_inner().plan;
    if plan != "basic" && plan != "nitro" {
        return Err(create_error!(InvalidProperty));
    }

    let mut state = load_state(db.inner(), &user.id).await?;
    reset_if_needed(&mut state);

    match (state.nitro.as_deref(), plan.as_str()) {
        (Some("nitro"), _) => return Err(create_error!(NoEffect)),
        (Some("basic"), "basic") => return Err(create_error!(NoEffect)),
        _ => {}
    }

    let cost = if plan == "basic" {
        300
    } else if state.nitro.as_deref() == Some("basic") {
        600
    } else {
        900
    };

    if !is_admin(&user) {
        if state.orbs < cost {
            return Err(create_error!(InvalidOperation));
        }
        state.orbs -= cost;
    }

    state.nitro = Some(plan);
    save_state(db.inner(), &user.id, &state).await?;

    Ok(Json(response(&state, &user)))
}

/* ------------------------------------------------------------------ hooks */

pub async fn record_event(db: &Database, user_id: &str, event: &str, amount: u32) -> Result<()> {
    let mut state = load_state(db, user_id).await?;
    reset_if_needed(&mut state);
    *state.events.entry(event.to_string()).or_insert(0) += amount;
    save_state(db, user_id, &state).await
}

pub async fn record_message(
    db: &Database,
    user_id: &str,
    server_id: Option<&str>,
    has_image: bool,
) -> Result<()> {
    let mut state = load_state(db, user_id).await?;
    reset_if_needed(&mut state);

    *state.events.entry("message_sent".to_string()).or_insert(0) += 1;
    if has_image {
        *state.events.entry("image_sent".to_string()).or_insert(0) += 1;
    }

    if let Some(server_id) = server_id {
        if !state.spoken_servers.iter().any(|id| id == server_id) {
            state.spoken_servers.push(server_id.to_string());
            *state
                .events
                .entry("first_message_server".to_string())
                .or_insert(0) += 1;
        }
    }

    save_state(db, user_id, &state).await
}

pub async fn record_invite_created(db: &Database, user_id: &str) -> Result<()> {
    record_event(db, user_id, "invite_created", 1).await
}

pub async fn record_invite_joined(
    db: &Database,
    creator_id: &str,
    server_id: Option<&str>,
) -> Result<()> {
    if server_id == Some(CLL_SERVER_ID) {
        let mut state = load_state(db, creator_id).await?;
        reset_if_needed(&mut state);
        *state.events.entry("invite_joined".to_string()).or_insert(0) += 1;
        *state
            .events
            .entry("invite_joined_cll".to_string())
            .or_insert(0) += 1;
        save_state(db, creator_id, &state).await
    } else {
        record_event(db, creator_id, "invite_joined", 1).await
    }
}

pub async fn record_voice_join(
    db: &Database,
    user_id: &str,
    with_others: bool,
) -> Result<()> {
    let mut state = load_state(db, user_id).await?;
    reset_if_needed(&mut state);
    *state.events.entry("voice_join".to_string()).or_insert(0) += 1;
    if with_others {
        *state
            .events
            .entry("voice_with_others".to_string())
            .or_insert(0) += 1;
    }
    save_state(db, user_id, &state).await
}
