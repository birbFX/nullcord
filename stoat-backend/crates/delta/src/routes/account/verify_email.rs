//! Verify an account
//! POST /verify/<code>
use rocket::{serde::json::Json, State};
use revolt_database::{
    Database, EmailVerification, MFATicket, SecurityEvent, util::email::normalise_email,
};
use revolt_result::Result;
use revolt_models::v0;

use crate::util::security::{RequestId, TrustedIp, enforce_rate_limit};

/// # Verify Email
///
/// Verify an email address.
#[openapi(tag = "Account")]
#[post("/verify/<code>")]
pub async fn verify_email(
    db: &State<Database>,
    client_ip: TrustedIp,
    request_id: RequestId,
    code: String,
) -> Result<Json<v0::ResponseVerify>> {
    if let Ok(Some(ip_ban)) = db.fetch_ip_ban(&client_ip.0).await {
        return Err(ip_ban.ban_error());
    }

    enforce_rate_limit("verify_ip", &client_ip.0, 30, 60 * 60).await?;

    // Find the account
    let mut account = match db.fetch_account_with_email_verification(&code).await {
        Ok(account) => account,
        Err(error) => {
            db.log_security_event(
                SecurityEvent::new("email.verify_failure", "failure")
                    .ip(client_ip.0.clone())
                    .request(request_id.0.clone()),
            )
            .await;
            return Err(error);
        }
    };

    // Update account email
    let moved = matches!(account.verification, EmailVerification::Moving { .. });
    let response = if let EmailVerification::Moving { new_email, .. } = &account.verification {
        account.email = new_email.clone();
        account.email_normalised = normalise_email(new_email.clone());
        v0::ResponseVerify::NoTicket
    } else {
        let mut ticket = MFATicket::new(account.id.to_string(), false);
        ticket.authorised = true;
        ticket.save(db).await?;
        v0::ResponseVerify::WithTicket { ticket: ticket.into() }
    };

    // Mark as verified
    account.verification = EmailVerification::Verified;

    // Save to database
    account.save(db).await?;

    // Changing the account address is a sensitive identity change: force
    // every other session to re-authenticate with the new address.
    if moved {
        account.delete_all_sessions(db, None).await?;
    }

    db.log_security_event(
        SecurityEvent::new("email.verify_success", "success")
            .account(account.id.clone())
            .ip(client_ip.0.clone())
            .request(request_id.0)
            .metadata(serde_json::json!({ "email_move": moved })),
    )
    .await;

    Ok(Json(response))
}

#[cfg(test)]
mod tests {
    use iso8601_timestamp::{Timestamp, Duration};
    use revolt_database::EmailVerification;
    use crate::{rocket, util::test::TestHarness};
    use rocket::http::{ContentType, Status};
    use revolt_models::v0;
    use revolt_result::{Error, ErrorType};
    
    #[rocket::async_test]
    async fn success() {
        let harness = TestHarness::new().await;
        let (mut account, _, _) = harness.new_user().await;

        account.verification = EmailVerification::Pending {
            token: "token".into(),
            expiry: Timestamp::now_utc() + Duration::seconds(100),
        };

        account.save(&harness.db).await.unwrap();

        let res = harness.client.post("/auth/account/verify/token").dispatch().await;

        assert_eq!(res.status(), Status::Ok);

        // Make sure it was used and can't be used again
        assert!(harness.db
            .fetch_account_with_email_verification("token")
            .await
            .is_err());

        // Check that we can login using the received MFA ticket
        let response = res.into_json::<v0::ResponseVerify>().await
            .expect("`ResponseVerify`");

        if let v0::ResponseVerify::WithTicket { ticket } = response {
            let res = harness.client
                .post("/auth/session/login")
                .header(ContentType::JSON)
                .body(json!({ "mfa_ticket": ticket.token }).to_string())
                .dispatch()
                .await;

            assert_eq!(res.status(), Status::Ok);
            assert!(res.into_json::<v0::Session>().await.is_some());
        } else {
            panic!("Expected `ResponseVerify::WithTicket`");
        }
    }

    #[rocket::async_test]
    async fn fail_invalid_token() {
        let harness = TestHarness::new().await;

        let res = harness.client.post("/auth/account/verify/token").dispatch().await;

        assert_eq!(res.status(), Status::Unauthorized);
        assert!(matches!(
            res.into_json::<Error>().await.unwrap().error_type,
            ErrorType::InvalidToken,
        ));
    }
}
