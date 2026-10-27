use std::time::Duration;

use revolt_database::Database;
use revolt_result::Result;
use tokio::time::sleep;

pub async fn task(db: Database, _: revolt_database::AMQP) -> Result<()> {
    loop {
        let users = db.fetch_users_due_for_unsuspension().await?;
        let count = users.len();

        for mut user in users {
            if let Err(error) = user.unsuspend(&db).await {
                log::error!("Failed to unsuspend {}: {error:?}", user.id);
            }
        }

        if count > 0 {
            log::info!("Unsuspended {count} accounts.");
        }

        sleep(Duration::from_mins(1)).await
    }
}
