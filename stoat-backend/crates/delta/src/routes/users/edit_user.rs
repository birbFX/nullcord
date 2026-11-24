use revolt_database::FieldsUser;
use revolt_database::{util::reference::Reference, Database, File, PartialUser, User};
use revolt_models::v0;
use revolt_result::{create_error, Result};
use rocket::serde::json::Json;
use rocket::State;
use validator::Validate;

/// # Edit User
///
/// Edit currently authenticated user.
#[openapi(tag = "User Information")]
#[patch("/<target>", data = "<data>")]
pub async fn edit(
    db: &State<Database>,
    mut user: User,
    target: Reference<'_>,
    data: Json<v0::DataEditUser>,
) -> Result<Json<v0::User>> {
    let data = data.into_inner();
    data.validate().map_err(|error| {
        create_error!(FailedValidation {
            error: error.to_string()
        })
    })?;

    // Filter out invalid edit fields
    if !user.privileged && (data.badges.is_some() || data.flags.is_some()) {
        return Err(create_error!(NotPrivileged));
    }

    // If we want to edit a different user than self, ensure we have
    // permissions and subsequently replace the user in question
    if target.id != "@me" && target.id != user.id {
        let target_user = target.as_user(db).await?;
        let is_bot_owner = target_user
            .bot
            .as_ref()
            .map(|bot| bot.owner == user.id)
            .unwrap_or_default();

        if !is_bot_owner && !user.privileged {
            return Err(create_error!(NotPrivileged));
        }

        // Owner-role accounts can only be edited by the platform owner or themselves.
        if is_owner_account(&target_user) && !is_platform_owner(&user) {
            return Err(create_error!(NotPrivileged));
        }

        if let Some(new_badges) = data.badges {
            check_badge_change(&user, &target_user, new_badges)?;
        }

        user = target_user;
    } else if let Some(new_badges) = data.badges {
        check_badge_change(&user, &user, new_badges)?;
    }

    // Exit out early if nothing is changed
    if data.display_name.is_none()
        && data.pronouns.is_none()
        && data.status.is_none()
        && data.profile.is_none()
        && data.avatar.is_none()
        && data.badges.is_none()
        && data.flags.is_none()
        && data.remove.is_empty()
    {
        return Ok(Json(user.into_self(false).await));
    }

    let changed_profile =
        data.display_name.is_some() || data.pronouns.is_some() || data.profile.is_some();
    let changed_avatar = data.avatar.is_some();
    let changed_status = data.status.is_some();

    // 1. Remove fields from object
    if data.remove.contains(&v0::FieldsUser::Avatar) {
        if let Some(avatar) = &user.avatar {
            db.mark_attachment_as_deleted(&avatar.id).await?;
        }
    }

    if data.remove.contains(&v0::FieldsUser::ProfileBackground) {
        if let Some(profile) = &user.profile {
            if let Some(background) = &profile.background {
                db.mark_attachment_as_deleted(&background.id).await?;
            }
        }
    }

    for field in &data.remove {
        let field: FieldsUser = field.clone().into();
        user.remove_field(&field);
    }

    let mut partial: PartialUser = PartialUser {
        display_name: data.display_name,
        pronouns: data.pronouns,
        badges: data.badges,
        flags: data.flags,
        ..Default::default()
    };

    // 2. Apply new avatar
    if let Some(avatar) = data.avatar {
        partial.avatar = Some(File::use_user_avatar(db, &avatar, &user.id, &user.id).await?);
    }

    // 3. Apply new status
    if let Some(status) = data.status {
        let mut new_status = user.status.take().unwrap_or_default();
        if let Some(text) = status.text {
            new_status.text = Some(text);
        }

        if let Some(presence) = status.presence {
            new_status.presence = Some(presence.into());
        }

        partial.status = Some(new_status);
    }

    // 4. Apply new profile
    if let Some(profile) = data.profile {
        let mut new_profile = user.profile.take().unwrap_or_default();
        if let Some(content) = profile.content {
            new_profile.content = Some(content);
        }

        if let Some(background) = profile.background {
            new_profile.background =
                Some(File::use_background(db, &background, &user.id, &user.id).await?);
        }

        partial.profile = Some(new_profile);
    }

    user.update(
        db,
        partial,
        data.remove.into_iter().map(Into::into).collect(),
    )
    .await?;

    if changed_profile {
        let _ = crate::routes::users::economy::record_event(
            db.inner(),
            &user.id,
            "profile_updated",
            1,
        )
        .await;
    }
    if changed_avatar {
        let _ = crate::routes::users::economy::record_event(
            db.inner(),
            &user.id,
            "avatar_updated",
            1,
        )
        .await;
    }
    if changed_status {
        let _ = crate::routes::users::economy::record_event(
            db.inner(),
            &user.id,
            "status_updated",
            1,
        )
        .await;
    }

    Ok(Json(user.into_self(false).await))
}

const PLATFORM_OWNER_ID: &str = "YOUR_PLATFORM_OWNER_ID";
/// Badge bit granted to platform owners (full power, cannot be demoted).
const OWNER_BADGE: i32 = 65536;

fn is_platform_owner(user: &revolt_database::User) -> bool {
    user.id == PLATFORM_OWNER_ID
}

fn is_owner_account(user: &revolt_database::User) -> bool {
    is_platform_owner(user) || user.badges.unwrap_or_default() & OWNER_BADGE != 0
}

/// Only the platform owner can give or take the owner badge, and the platform
/// owner can never lose it.
fn check_badge_change(
    actor: &revolt_database::User,
    target: &revolt_database::User,
    new_badges: i32,
) -> Result<()> {
    let old_badges = target.badges.unwrap_or_default();
    if (old_badges ^ new_badges) & OWNER_BADGE != 0 && !is_platform_owner(actor) {
        return Err(create_error!(NotPrivileged));
    }
    if is_platform_owner(target) && new_badges & OWNER_BADGE == 0 {
        return Err(create_error!(NotPrivileged));
    }
    Ok(())
}
