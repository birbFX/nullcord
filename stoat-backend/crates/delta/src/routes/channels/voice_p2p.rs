use revolt_database::{
    events::client::EventV1,
    iso8601_timestamp::Timestamp,
    util::{permissions::perms, reference::Reference},
    voice::{
        create_voice_state, delete_voice_state, get_user_voice_channels, get_voice_channel_members,
        get_voice_peers, refresh_voice_peer, remove_voice_peer, set_voice_peer, UserVoiceChannel,
    },
    Database, User,
};
use revolt_models::v0;
use revolt_permissions::{calculate_channel_permissions, ChannelPermission};
use revolt_result::{create_error, Result};

use rocket::{serde::json::Json, State};

fn validate_peer_id(peer_id: &str) -> Result<&str> {
    let peer_id = peer_id.trim();

    if peer_id.is_empty()
        || peer_id.len() > 128
        || !peer_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(create_error!(FailedValidation {
            error: "Invalid peer id".to_string()
        }));
    }

    Ok(peer_id)
}

async fn peers_response(channel: &UserVoiceChannel) -> Result<v0::VoicePeersResponse> {
    let members = get_voice_channel_members(channel)
        .await?
        .unwrap_or_default();

    let peers: Vec<v0::VoicePeer> = get_voice_peers(&channel.id)
        .await?
        .into_iter()
        .map(|(user_id, peer_id)| v0::VoicePeer { user_id, peer_id })
        .collect();

    // Ignore legacy LiveKit members that have no PeerJS registration.
    let members = members
        .into_iter()
        .filter(|user_id| peers.iter().any(|peer| &peer.user_id == user_id))
        .collect();

    Ok(v0::VoicePeersResponse { members, peers })
}

/// # Join Peer-to-Peer Voice
///
/// Registers this browser's PeerJS id and returns the current call peers.
#[openapi(tag = "Voice")]
#[post("/<target>/voice/join", data = "<data>")]
pub async fn join(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    data: Json<v0::DataVoicePeer>,
) -> Result<Json<v0::VoicePeersResponse>> {
    let channel = target.as_channel(db).await?;
    let Some(_voice) = channel.voice() else {
        return Err(create_error!(NotAVoiceChannel));
    };

    let mut permissions = perms(db, &user).channel(&channel);
    let current_permissions = calculate_channel_permissions(&mut permissions).await;
    current_permissions.throw_if_lacking_channel_permission(ChannelPermission::Connect)?;

    let peer_id = validate_peer_id(&data.peer_id)?;
    let voice_channel = UserVoiceChannel::from_channel(&channel);

    // Leave any previous room first; a crashed tab or a missed webhook can
    // otherwise leave a permanent stale vc:<user> entry behind.
    for previous in get_user_voice_channels(&user.id).await? {
        if previous.id != voice_channel.id {
            remove_voice_peer(&previous.id, &user.id).await?;
            delete_voice_state(&previous, &user.id).await?;
            EventV1::VoiceChannelLeave {
                id: previous.id.clone(),
                user: user.id.clone(),
            }
            .p(previous.id)
            .await;
        }
    }

    let state = create_voice_state(&voice_channel, &user.id, Timestamp::now_utc()).await?;
    set_voice_peer(&voice_channel.id, &user.id, peer_id).await?;

    EventV1::VoiceChannelJoin {
        id: voice_channel.id.clone(),
        state,
    }
    .p(voice_channel.id.clone())
    .await;

    Ok(Json(peers_response(&voice_channel).await?))
}

/// # Leave Peer-to-Peer Voice
#[openapi(tag = "Voice")]
#[post("/<target>/voice/leave")]
pub async fn leave(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
) -> Result<Json<v0::VoicePeersResponse>> {
    let channel = target.as_channel(db).await?;
    let voice_channel = UserVoiceChannel::from_channel(&channel);

    remove_voice_peer(&voice_channel.id, &user.id).await?;
    delete_voice_state(&voice_channel, &user.id).await?;

    EventV1::VoiceChannelLeave {
        id: voice_channel.id.clone(),
        user: user.id.clone(),
    }
    .p(voice_channel.id.clone())
    .await;

    Ok(Json(peers_response(&voice_channel).await?))
}

/// # Fetch Peer-to-Peer Voice Peers
#[openapi(tag = "Voice")]
#[get("/<target>/voice/peers")]
pub async fn peers(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
) -> Result<Json<v0::VoicePeersResponse>> {
    let channel = target.as_channel(db).await?;
    let Some(_voice) = channel.voice() else {
        return Err(create_error!(NotAVoiceChannel));
    };

    let mut permissions = perms(db, &user).channel(&channel);
    let current_permissions = calculate_channel_permissions(&mut permissions).await;
    current_permissions.throw_if_lacking_channel_permission(ChannelPermission::ViewChannel)?;

    let voice_channel = UserVoiceChannel::from_channel(&channel);
    // Polling keeps this participant's relay registration alive without a
    // separate heartbeat endpoint.
    refresh_voice_peer(&voice_channel.id, &user.id).await?;

    Ok(Json(peers_response(&voice_channel).await?))
}
