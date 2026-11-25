//! Platform-owner self-healing.
//!
//! The owner account can be demoted by another administrator or by a direct
//! database edit. A small background sweeper restores the Owner badge, the
//! privileged flag and login eligibility. It never touches the owner's email,
//! password or MFA settings.

use std::time::Duration;

use revolt_config::config;
use revolt_database::{Database, EmailVerification, PartialUser, SecurityEvent};

/// Badge bit for the platform owner (full power, cannot be demoted).
const OWNER_BADGE: i32 = 65536;

/// Restore the owner if any protected field was changed. Returns true when a
/// write occurred.
pub async fn restore_owner(db: &Database) -> bool {
    let owner_id = config().await.api.users.owner_id.trim().to_string();
    if owner_id.is_empty() {
        return false;
    }

    let mut user_changes = Vec::new();
    let mut user_partial = PartialUser::default();
    let mut account_changes = Vec::new();

    if let Ok(user) = db.fetch_user(&owner_id).await {
        let badges = user.badges.unwrap_or_default();

        if !user.privileged {
            user_partial.privileged = Some(true);
            user_changes.push("privileged");
        }

        if badges & OWNER_BADGE == 0 {
            user_partial.badges = Some(badges | OWNER_BADGE);
            user_changes.push("owner_badge");
        }

        if !user_changes.is_empty()
            && db.update_user(&owner_id, &user_partial, vec![]).await.is_err()
        {
            log::error!("Could not restore owner user record");
        }
    }

    if let Ok(mut account) = db.fetch_account(&owner_id).await {
        if account.disabled {
            account.disabled = false;
            account_changes.push("disabled");
        }

        if account.lockout.is_some() {
            account.lockout = None;
            account_changes.push("lockout");
        }

        if !matches!(&account.verification, EmailVerification::Verified) {
            account.verification = EmailVerification::Verified;
            account_changes.push("verification");
        }

        if account.deletion.is_some() {
            account.deletion = None;
            account_changes.push("deletion");
        }

        if !account_changes.is_empty() && db.save_account(&account).await.is_err() {
            log::error!("Could not restore owner account record");
        }
    }

    if user_changes.is_empty() && account_changes.is_empty() {
        return false;
    }

    log::warn!(
        "Auto-restored platform owner {owner_id}: user={user_changes:?} account={account_changes:?}"
    );

    db.log_security_event(
        SecurityEvent::new("owner.auto_restored", "success")
            .account(owner_id)
            .metadata(json!({
                "user": user_changes,
                "account": account_changes
            })),
    )
    .await;

    true
}

/// Start the owner guard. Restores immediately, then every 15 seconds.
pub fn start(db: Database) {
    tokio::spawn(async move {
        loop {
            let _ = restore_owner(&db).await;
            tokio::time::sleep(Duration::from_secs(15)).await;
        }
    });
}
