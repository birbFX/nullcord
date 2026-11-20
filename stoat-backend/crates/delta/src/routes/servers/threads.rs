use revolt_database::{
    util::{permissions::DatabasePermissionQuery, reference::Reference},
    Channel, Database, PartialChannel, User,
};
use revolt_models::v0;
use revolt_permissions::{
    calculate_channel_permissions, calculate_server_permissions, ChannelPermission,
};
use revolt_result::{create_error, Result};
use rocket::{serde::json::Json, State};
use rocket_empty::EmptyResponse;
use serde::{Deserialize, Serialize};

use super::extras::{load, store};

const MAX_THREADS: usize = 500;
const MAX_FORUMS: usize = 20;
const PREFIX: &str = "🧵 ";

fn invalid(msg: &str) -> revolt_result::Error {
    create_error!(FailedValidation {
        error: msg.to_string()
    })
}

#[derive(Serialize, Deserialize, Clone, Debug, JsonSchema)]
pub struct Thread {
    /// Channel id of the thread (a real text channel)
    pub channel: String,
    /// Parent text channel or forum
    pub parent: String,
    pub name: String,
    pub creator: String,
    pub created: i64,
    pub archived: bool,
}

#[derive(Serialize, Deserialize, Default)]
pub struct ThreadsDoc {
    #[serde(rename = "_id", default)]
    id: String,
    /// Channel ids marked as forums
    #[serde(default)]
    forums: Vec<String>,
    #[serde(default)]
    threads: Vec<Thread>,
}

#[derive(Serialize, JsonSchema)]
pub struct ThreadList {
    pub forums: Vec<String>,
    pub threads: Vec<Thread>,
}

#[derive(Deserialize, JsonSchema)]
pub struct DataCreateThread {
    pub parent: String,
    pub name: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct DataEditThread {
    pub archived: bool,
}

async fn load_doc(db: &Database, server: &str) -> Result<ThreadsDoc> {
    let mut doc = load::<ThreadsDoc>(db, &format!("threads:{server}"))
        .await?
        .unwrap_or_default();
    doc.id = format!("threads:{server}");
    Ok(doc)
}

/// Whether a channel is an archived thread (messages are refused there).
pub async fn is_archived_thread(db: &Database, server: &str, channel: &str) -> bool {
    match load::<ThreadsDoc>(db, &format!("threads:{server}")).await {
        Ok(Some(doc)) => doc.threads.iter().any(|t| t.channel == channel && t.archived),
        _ => false,
    }
}

/// # List Threads
///
/// List forums and threads in a server that you can see.
#[openapi(tag = "Server Information")]
#[get("/<target>/threads")]
pub async fn list_threads(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
) -> Result<Json<ThreadList>> {
    let server = target.as_server(db).await?;
    db.fetch_member(&server.id, &user.id).await?;
    let doc = load_doc(db, &server.id).await?;

    let mut visible = Vec::new();
    for thread in doc.threads {
        if let Ok(channel) = db.fetch_channel(&thread.channel).await {
            let mut query = DatabasePermissionQuery::new(db, &user).channel(&channel);
            if calculate_channel_permissions(&mut query)
                .await
                .has_channel_permission(ChannelPermission::ViewChannel)
            {
                visible.push(thread);
            }
        }
    }
    Ok(Json(ThreadList {
        forums: doc.forums,
        threads: visible,
    }))
}

/// # Create Thread
///
/// Start a thread (or forum post) under a text channel. Requires Send Messages on the parent.
#[openapi(tag = "Server Information")]
#[post("/<target>/threads", data = "<data>")]
pub async fn create_thread(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    data: Json<DataCreateThread>,
) -> Result<Json<v0::Channel>> {
    let data = data.into_inner();
    let name = data.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 28 {
        return Err(invalid("thread name must be 1-28 characters"));
    }

    let mut server = target.as_server(db).await?;
    db.fetch_member(&server.id, &user.id).await?;
    let mut doc = load_doc(db, &server.id).await?;

    if doc.threads.len() >= MAX_THREADS {
        return Err(invalid("too many threads in this server"));
    }
    if doc.threads.iter().any(|t| t.channel == data.parent) {
        return Err(invalid("threads cannot be nested"));
    }

    let parent = db.fetch_channel(&data.parent).await?;
    let (default_permissions, role_permissions) = match &parent {
        Channel::TextChannel {
            server: s,
            default_permissions,
            role_permissions,
            ..
        } if *s == server.id => (default_permissions.clone(), role_permissions.clone()),
        _ => return Err(create_error!(NotFound)),
    };

    let mut query = DatabasePermissionQuery::new(db, &user).channel(&parent);
    calculate_channel_permissions(&mut query)
        .await
        .throw_if_lacking_channel_permission(ChannelPermission::SendMessage)?;

    // Created directly (not via the ManageChannel route) since the parent's
    // Send Messages permission is what gates thread creation.
    let mut channel = Channel::create_server_channel(
        db,
        &mut server,
        v0::DataCreateServerChannel {
            channel_type: v0::LegacyServerChannelType::Text,
            name: format!("{PREFIX}{name}"),
            description: None,
            nsfw: None,
            voice: None,
        },
        true,
    )
    .await?;

    // Inherit the parent's overrides so a thread in a private channel stays private
    channel
        .update(
            db,
            PartialChannel {
                default_permissions,
                role_permissions: Some(role_permissions),
                ..Default::default()
            },
            vec![],
        )
        .await?;

    doc.threads.push(Thread {
        channel: channel.id().to_string(),
        parent: data.parent,
        name,
        creator: user.id,
        created: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0),
        archived: false,
    });
    store(db, &format!("threads:{}", server.id), &doc).await?;

    Ok(Json(channel.into()))
}

/// # Archive Thread
///
/// Archive or reopen a thread. Allowed for its creator or anyone with Manage Channel.
#[openapi(tag = "Server Information")]
#[patch("/<target>/threads/<thread>", data = "<data>")]
pub async fn edit_thread(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    thread: String,
    data: Json<DataEditThread>,
) -> Result<EmptyResponse> {
    let server = target.as_server(db).await?;
    db.fetch_member(&server.id, &user.id).await?;
    let mut doc = load_doc(db, &server.id).await?;

    let entry = doc
        .threads
        .iter_mut()
        .find(|t| t.channel == thread)
        .ok_or_else(|| create_error!(NotFound))?;

    if entry.creator != user.id {
        let mut query = DatabasePermissionQuery::new(db, &user).server(&server);
        calculate_server_permissions(&mut query)
            .await
            .throw_if_lacking_channel_permission(ChannelPermission::ManageChannel)?;
    }
    entry.archived = data.into_inner().archived;
    store(db, &format!("threads:{}", server.id), &doc).await?;
    Ok(EmptyResponse)
}

/// # Mark Channel As Forum
///
/// Treat a text channel as a forum: its threads are posts.
#[openapi(tag = "Server Information")]
#[put("/<target>/forums/<channel>")]
pub async fn set_forum(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    channel: String,
) -> Result<EmptyResponse> {
    let server = target.as_server(db).await?;
    let mut query = DatabasePermissionQuery::new(db, &user).server(&server);
    calculate_server_permissions(&mut query)
        .await
        .throw_if_lacking_channel_permission(ChannelPermission::ManageChannel)?;
    if !server.channels.contains(&channel) {
        return Err(create_error!(NotFound));
    }
    let mut doc = load_doc(db, &server.id).await?;
    if doc.threads.iter().any(|t| t.channel == channel) {
        return Err(invalid("a thread cannot be a forum"));
    }
    if !doc.forums.contains(&channel) {
        if doc.forums.len() >= MAX_FORUMS {
            return Err(invalid("too many forums"));
        }
        doc.forums.push(channel);
        store(db, &format!("threads:{}", server.id), &doc).await?;
    }
    Ok(EmptyResponse)
}

/// # Unmark Forum
///
/// Turn a forum back into a normal text channel.
#[openapi(tag = "Server Information")]
#[delete("/<target>/forums/<channel>")]
pub async fn unset_forum(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    channel: String,
) -> Result<EmptyResponse> {
    let server = target.as_server(db).await?;
    let mut query = DatabasePermissionQuery::new(db, &user).server(&server);
    calculate_server_permissions(&mut query)
        .await
        .throw_if_lacking_channel_permission(ChannelPermission::ManageChannel)?;
    let mut doc = load_doc(db, &server.id).await?;
    doc.forums.retain(|f| *f != channel);
    store(db, &format!("threads:{}", server.id), &doc).await?;
    Ok(EmptyResponse)
}
