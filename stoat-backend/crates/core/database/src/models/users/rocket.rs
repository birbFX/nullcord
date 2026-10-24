use revolt_result::Error;
use rocket::http::Status;
use rocket::request::{self, FromRequest, Outcome, Request};

use crate::{Database, Session, User};

#[rocket::async_trait]
impl<'r> FromRequest<'r> for User {
    type Error = Error;

    async fn from_request(request: &'r Request<'_>) -> request::Outcome<Self, Self::Error> {
        let db = request.rocket().state::<Database>().expect("`Database`");
        let ip = crate::util::ip::rocket::to_real_ip(request).await;
        if let Ok(Some(ip_ban)) = db.fetch_ip_ban(&ip).await {
            let error = ip_ban.ban_error();
            if let Ok(body) = serde_json::to_string(&error) {
                if let Ok(mut slot) = request
                    .local_cache(|| std::sync::Mutex::new(None::<String>))
                    .lock()
                {
                    *slot = Some(body);
                }
            }
            return request::Outcome::Error((Status::Forbidden, error));
        }
        let user: &Option<User> = request
            .local_cache_async(async {
                let db = request.rocket().state::<Database>().expect("`Database`");

                let header_bot_token = request
                    .headers()
                    .get("x-bot-token")
                    .next()
                    .map(|x| x.to_string());

                if let Some(bot_token) = header_bot_token {
                    if let Ok(bot) = db.fetch_bot_by_token(&bot_token).await
                        && let Ok(user) = db.fetch_user(&bot.id).await
                    {
                        return Some(user);
                    }
                } else if let Outcome::Success(session) = request.guard::<Session>().await
                    && let Ok(user) = db.fetch_user(&session.user_id).await
                {
                    return Some(user);
                }

                None
            })
            .await;

        if let Some(user) = user {
            if let Some(error) = user.ban_error() {
                if let Ok(body) = serde_json::to_string(&error) {
                    if let Ok(mut slot) = request
                        .local_cache(|| std::sync::Mutex::new(None::<String>))
                        .lock()
                    {
                        *slot = Some(body);
                    }
                }
                Outcome::Error((Status::Forbidden, error))
            } else {
                Outcome::Success(user.clone())
            }
        } else {
            Outcome::Error((Status::Unauthorized, create_error!(InvalidSession)))
        }
    }
}
