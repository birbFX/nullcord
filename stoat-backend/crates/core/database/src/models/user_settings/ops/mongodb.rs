use ::mongodb::options::FindOneOptions;
use bson::to_bson;
use bson::{Bson, Document};
use mongodb::options::UpdateOptions;
use revolt_result::Result;

use crate::MongoDb;
use crate::UserSettings;

use super::AbstractUserSettings;

static COL: &str = "user_settings";

#[async_trait]
impl AbstractUserSettings for MongoDb {
    /// Fetch a subset of user settings
    async fn fetch_user_settings(&'_ self, id: &str, filter: &'_ [String]) -> Result<UserSettings> {
        let mut projection = doc! {
            "_id": 0,
        };

        for key in filter {
            projection.insert(key, 1);
        }

        // Read as a raw document and coerce, so a legacy/foreign writer that
        // stored the timestamp as a double or int32 cannot break (or panic) the
        // request.
        let doc = self
            .col::<Document>(COL)
            .find_one(doc! { "_id": id })
            .with_options(FindOneOptions::builder().projection(projection).build())
            .await
            .map_err(|_| create_database_error!("find_one", "user_settings"))?
            .unwrap_or_default();

        let mut out = UserSettings::new();
        for (key, value) in doc {
            if let Bson::Array(parts) = value {
                let ts = match parts.first() {
                    Some(Bson::Int64(n)) => *n,
                    Some(Bson::Int32(n)) => *n as i64,
                    Some(Bson::Double(n)) => *n as i64,
                    _ => 0,
                };
                let data = match parts.get(1) {
                    Some(Bson::String(s)) => s.clone(),
                    _ => String::new(),
                };
                out.insert(key, (ts, data));
            }
        }
        Ok(out)
    }

    /// Update a subset of user settings
    async fn set_user_settings(&self, id: &str, settings: &UserSettings) -> Result<()> {
        let mut set = doc! {};
        for (key, data) in settings {
            set.insert(
                key,
                vec![to_bson(&data.0).unwrap(), to_bson(&data.1).unwrap()],
            );
        }

        self.col::<Document>(COL)
            .update_one(
                doc! {
                    "_id": id
                },
                doc! {
                    "$set": set
                },
            )
            .with_options(UpdateOptions::builder().upsert(true).build())
            .await
            .map(|_| ())
            .map_err(|_| create_database_error!("update_one", "user_settings"))
    }

    /// Delete all user settings
    async fn delete_user_settings(&self, id: &str) -> Result<()> {
        query!(self, delete_one_by_id, COL, id).map(|_| ())
    }
}
