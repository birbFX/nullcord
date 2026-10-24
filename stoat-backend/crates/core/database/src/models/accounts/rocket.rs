use crate::{Account, Database, Session};
use revolt_result::Error;
use rocket::{
    http::Status,
    request::{FromRequest, Outcome},
    Request,
};

#[rocket::async_trait]
impl<'r> FromRequest<'r> for Account {
    type Error = Error;

    async fn from_request(request: &'r Request<'_>) -> Outcome<Self, Self::Error> {
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
        match request.guard::<Session>().await {
            Outcome::Success(session) => {
                let db = request.rocket().state::<Database>().expect("`Database`");
                if let Ok(account) = db.fetch_account(&session.user_id).await {
                    match db.fetch_user(&session.user_id).await {
                        Ok(user) => match user.ban_error() {
                            Some(error) => {
                                if let Ok(body) = serde_json::to_string(&error) {
                                    if let Ok(mut slot) = request
                                        .local_cache(|| std::sync::Mutex::new(None::<String>))
                                        .lock()
                                    {
                                        *slot = Some(body);
                                    }
                                }
                                Outcome::Error((Status::Forbidden, error))
                            }
                            None => Outcome::Success(account),
                        },
                        Err(_) => Outcome::Error((Status::InternalServerError, create_error!(InternalError))),
                    }
                } else {
                    Outcome::Error((Status::InternalServerError, create_error!(InternalError)))
                }
            }
            Outcome::Forward(_) => unreachable!(),
            Outcome::Error(err) => Outcome::Error(err),
        }
    }
}
