use crate::{Database, Session};
use revolt_result::Error;
use rocket::{
    Request,
    http::Status,
    request::{FromRequest, Outcome},
};

#[rocket::async_trait]
impl<'r> FromRequest<'r> for Session {
    type Error = Error;

    async fn from_request(request: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        request
            .local_cache_async(async {
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
                    return Outcome::Error((Status::Forbidden, error));
                }
                if let Some(token) = request.headers().get("x-session-token").next() {
                    if let Ok(session) = request
                        .rocket()
                        .state::<Database>()
                        .expect("`Database`")
                        .fetch_session_by_token(token)
                        .await
                    {
                        Outcome::Success(session)
                    } else {
                        Outcome::Error((Status::Unauthorized, create_error!(InvalidSession)))
                    }
                } else {
                    Outcome::Error((Status::Unauthorized, create_error!(MissingHeaders)))
                }
            })
            .await
            .clone()
    }
}
