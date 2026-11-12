use redis_kiss::{AsyncCommands, Conn};

/// Add to set (string)
pub async fn __add_to_set_string(conn: &mut Conn, key: &str, value: &str) {
    let _: Option<()> = conn.sadd(key, value).await.ok();
}

/// Add to set (u32)
pub async fn __add_to_set_u32(conn: &mut Conn, key: &str, value: u32) {
    let _: Option<()> = conn.sadd(key, value).await.ok();
}

/// Remove from set (string)
pub async fn __remove_from_set_string(conn: &mut Conn, key: &str, value: &str) {
    let _: Option<()> = conn.srem(key, value).await.ok();
}

/// Remove from set (u32)
pub async fn __remove_from_set_u32(conn: &mut Conn, key: &str, value: u32) {
    let _: Option<()> = conn.srem(key, value).await.ok();
}

/// Get set members as string
pub async fn __get_set_members_as_string(conn: &mut Conn, key: &str) -> Vec<String> {
    // A failing command must not panic the caller: this runs on the
    // connection/presence path, and a panic there takes down the worker
    // thread serving the request.
    conn.smembers::<_, Vec<String>>(key).await.unwrap_or_default()
}

/// Get set size
pub async fn __get_set_size(conn: &mut Conn, id: &str) -> u32 {
    conn.scard::<_, u32>(id).await.unwrap_or(0)
}

/// Delete key by id
pub async fn __delete_key(conn: &mut Conn, id: &str) {
    let _ = conn.del::<_, ()>(id).await;
}
