use revolt_rocket_okapi::revolt_okapi::openapi3::OpenApi;
use rocket::Route;

mod add_friend;
mod block_user;
mod change_username;
pub(crate) mod economy;
mod edit_user;
mod fetch_dms;
mod fetch_profile;
mod fetch_self;
mod fetch_user;
mod fetch_user_flags;
mod find_mutual;
mod get_default_avatar;
mod open_dm;
mod remove_friend;
mod send_friend_request;
mod unblock_user;

pub fn routes() -> (Vec<Route>, OpenApi) {
    openapi_get_routes_spec![
        // Economy
        economy::fetch,
        economy::claim_quest,
        economy::redeem_nitro,
        crate::routes::servers::extras::fetch_user_tag,
        crate::routes::servers::extras::equip_tag,
        crate::routes::servers::extras::set_accent,
        crate::routes::servers::extras::fetch_discord_template,
        // User Information
        fetch_self::fetch,
        fetch_user::fetch,
        fetch_user_flags::fetch_user_flags,
        edit_user::edit,
        change_username::change_username,
        get_default_avatar::default_avatar,
        fetch_profile::profile,
        // Direct Messaging
        fetch_dms::direct_messages,
        open_dm::open_dm,
        // Relationships
        find_mutual::mutual,
        add_friend::add,
        remove_friend::remove,
        block_user::block,
        unblock_user::unblock,
        send_friend_request::send_friend_request,
    ]
}
