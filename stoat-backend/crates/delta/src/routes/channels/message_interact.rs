use revolt_database::{
    events::client::EventV1,
    util::{permissions::DatabasePermissionQuery, reference::Reference},
    Channel, Database, Message, User,
};
use revolt_models::v0;
use revolt_permissions::{calculate_channel_permissions, ChannelPermission};
use revolt_result::{create_error, Result};
use rocket::{serde::json::Json, State};
use rocket_empty::EmptyResponse;
use validator::Validate;

/// # Interact with Message Component
///
/// Records a button or select interaction and forwards it to the message
/// author's bot gateway.  The component must exist on the message.
#[openapi(tag = "Interactions")]
#[post("/<target>/messages/<msg>/interactions", data = "<data>")]
pub async fn interact(
    db: &State<Database>,
    user: User,
    target: Reference<'_>,
    msg: Reference<'_>,
    data: Json<v0::DataMessageInteract>,
) -> Result<EmptyResponse> {
    let data = data.into_inner();
    data.validate().map_err(|error| {
        create_error!(FailedValidation {
            error: error.to_string()
        })
    })?;

    let channel = target.as_channel(db).await?;
    let mut query = DatabasePermissionQuery::new(db, &user).channel(&channel);
    let permissions = calculate_channel_permissions(&mut query).await;
    permissions.throw_if_lacking_channel_permission(ChannelPermission::ViewChannel)?;

    let message = msg.as_message_in_channel(db, channel.id()).await?;
    let components = message
        .components
        .as_ref()
        .ok_or_else(|| create_error!(InvalidOperation))?;

    let component = components
        .iter()
        .find(|component| component.custom_id == data.custom_id)
        .ok_or_else(|| create_error!(NotFound))?;

    if component.disabled {
        return Err(create_error!(InvalidOperation));
    }

    let values = data.values.unwrap_or_default();
    if component.component_type == "select" {
        let options = component
            .options
            .as_ref()
            .ok_or_else(|| create_error!(InvalidOperation))?;
        let min = component.min_values.unwrap_or(1) as usize;
        let max = component.max_values.unwrap_or(1) as usize;
        if values.len() < min || values.len() > max {
            return Err(create_error!(InvalidOperation));
        }
        if values
            .iter()
            .any(|value| !options.iter().any(|option| option.value == *value))
        {
            return Err(create_error!(InvalidOperation));
        }
    }

    let guild_id = channel.server().map(|server| server.to_string());
    let user_model: v0::User = user.clone().into(db, Some(&user)).await;
    let message_model = message.clone().into_model(None, None);

    EventV1::InteractionCreate {
        id: ulid::Ulid::new().to_string(),
        message: message_model,
        user: user_model,
        channel_id: channel.id().to_string(),
        guild_id,
        custom_id: component.custom_id.clone(),
        component_type: component.component_type.clone(),
        values,
    }
    .p(message.author.clone())
    .await;

    Ok(EmptyResponse)
}
