//! Send a password reset email
//! POST /account/reset_password
use std::time::Duration;

use tokio::time::sleep;
use rocket::serde::json::Json;
use rocket::State;
use rocket_empty::EmptyResponse;
use revolt_result::Result;
use revolt_database::{Database, EmailVerification, util::{email::{normalise_email, validate_email}, captcha::check_captcha}};
use revolt_models::v0;

use crate::util::security::{TrustedIp, enforce_rate_limit};

const RESET_PER_EMAIL_PER_HOUR: u32 = 3;
const RESET_PER_IP_PER_HOUR: u32 = 10;

/// # Send Password Reset
///
/// Send an email to reset account password.
#[openapi(tag = "Account")]
#[post("/reset_password", data = "<data>")]
pub async fn send_password_reset(
    db: &State<Database>,
    client_ip: TrustedIp,
    data: Json<v0::DataSendPasswordReset>,
) -> Result<EmptyResponse> {
    let data = data.into_inner();

    // Random jitter from 0-1000ms
    sleep(Duration::from_millis((rand::random::<f32>() * 1000.) as u64)).await;

    // Check Captcha token
    check_captcha(data.captcha.as_deref()).await?;

    // Make sure email is valid and not blocked
    validate_email(&data.email)?;

    // Bound reset emails per address and source.
    let email_normalised = normalise_email(data.email);
    enforce_rate_limit(
        "reset_ip",
        &client_ip.0,
        RESET_PER_IP_PER_HOUR,
        60 * 60,
    )
    .await?;
    enforce_rate_limit(
        "reset_email",
        &email_normalised,
        RESET_PER_EMAIL_PER_HOUR,
        60 * 60,
    )
    .await?;

    if let Ok(Some(ip_ban)) = db.fetch_ip_ban(&client_ip.0).await {
        return Err(ip_ban.ban_error());
    }

    // From this point on, do not report failure to the
    // remote client, as this will open us up to user enumeration.

    // Try to find the relevant account
    if let Ok(Some(mut account)) = db
        .fetch_account_by_normalised_email(&email_normalised)
        .await
    {
        if !matches!(account.verification, EmailVerification::Pending { .. }) {
            if let Err(e) = account.start_password_reset(db, false).await {
                revolt_config::capture_error(&e);
            }
        }
    }

    // Never fail this route, (except for db error)
    // You may open the application to email enumeration otherwise.
    Ok(EmptyResponse)
}

#[cfg(test)]
mod tests {
    use crate::{rocket, util::test::TestHarness};
    use revolt_database::Account;
    use revolt_models::v0;
    use rocket::http::{ContentType, Status};

    #[rocket::async_test]
    async fn success() {
        let harness = TestHarness::new().await;

        Account::new(
            &harness.db,
            "password_reset@smtp.test".into(),
            "password".into(),
            false,
        )
        .await
        .unwrap();

        let res = harness.client
            .post("/auth/account/reset_password")
            .header(ContentType::JSON)
            .body(
                json!({
                    "email": "password_reset@smtp.test",
                })
                .to_string(),
            )
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::NoContent);

        let (_, code) = harness.assert_email("password_reset@smtp.test").await;
        let res = harness.client
            .patch("/auth/account/reset_password")
            .header(ContentType::JSON)
            .body(
                json!({
                    "token": code,
                    "password": "valid password"
                })
                .to_string(),
            )
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::NoContent);

        let res = harness.client
            .post("/auth/session/login")
            .header(ContentType::JSON)
            .body(
                json!({
                    "email": "password_reset@smtp.test",
                    "password": "valid password"
                })
                .to_string(),
            )
            .dispatch()
            .await;

        assert_eq!(res.status(), Status::Ok);
        assert!(serde_json::from_str::<v0::Session>(&res.into_string().await.unwrap()).is_ok());
    }
}
