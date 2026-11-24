use reqwest::Client;
use sha1::Digest;
use std::{collections::HashSet, sync::LazyLock};

use revolt_config::config;
use revolt_result::{Result, ToRevoltError};

static CLIENT: LazyLock<Client> = LazyLock::new(Client::new);

/// OWASP-recommended Argon2id parameters (19 MiB, 2 iterations, 1 lane).
///
/// Older releases used `rust-argon2`'s default (Argon2i, 4 MiB, 3 passes).
/// Existing hashes still verify; [`password_needs_rehash`] upgrades them
/// transparently after the next successful login.
const HASH_MEM_COST: u32 = 19_456;
const HASH_TIME_COST: u32 = 2;

static ARGON_CONFIG: LazyLock<argon2::Config<'static>> = LazyLock::new(|| argon2::Config {
    variant: argon2::Variant::Argon2id,
    version: argon2::Version::Version13,
    mem_cost: HASH_MEM_COST,
    time_cost: HASH_TIME_COST,
    lanes: 1,
    thread_mode: argon2::ThreadMode::Sequential,
    secret: &[],
    ad: &[],
    hash_length: 32,
});
static TOP_100K_COMPROMISED: LazyLock<HashSet<String>> = LazyLock::new(|| {
    include_str!("../../assets/pwned100k.txt")
        .split('\n')
        .map(|x| x.into())
        .collect()
});

#[derive(Deserialize)]
struct EasyPwnedResult {
    secure: bool,
}

/// Hash a password using argon2
pub fn hash_password(plaintext_password: String) -> Result<String> {
    argon2::hash_encoded(
        plaintext_password.as_bytes(),
        nanoid::nanoid!(24).as_bytes(),
        &ARGON_CONFIG,
    )
    .to_internal_error()
}

/// Whether an existing Argon2 hash should be re-derived with current
/// parameters (algorithm, memory, iterations or lane count changed).
pub fn password_needs_rehash(encoded: &str) -> bool {
    let expected = format!("$argon2id$v=19$m={HASH_MEM_COST},t={HASH_TIME_COST},p=1$");
    !encoded.starts_with(&expected)
}

pub async fn assert_safe(password: &str) -> Result<()> {
    // Make sure the password is long enough.
    if password.len() < 8 {
        return Err(create_error!(ShortPassword));
    }

    // Bound the input so a hostile request cannot force expensive hashing
    // of an arbitrarily large payload.
    if password.len() > 1024 {
        return Err(create_error!(IncorrectData {
            with: "password".to_string()
        }));
    }

    let config = config().await;

    if !config.api.security.easypwned.is_empty() {
        let mut hasher = sha1::Sha1::new();
        hasher.update(password);
        let pwd_hash = hasher.finalize();

        let result = match CLIENT
            .get(format!(
                "{}/hash/{pwd_hash:#02x}",
                &config.api.security.easypwned
            ))
            .send()
            .await
        {
            Ok(response) => match response.json::<EasyPwnedResult>().await {
                Ok(result) => Ok(result.secure),
                Err(e) => Err(e),
            },
            Err(e) => Err(e),
        };

        if let Err(e) = &result {
            revolt_config::capture_error(e);
        } else if result.is_ok_and(|b| b) {
            return Ok(());
        }
    };

    if TOP_100K_COMPROMISED.contains(password) {
        return Err(create_error!(CompromisedPassword));
    };

    Ok(())
}

#[cfg(test)]
mod security_tests {
    use super::*;

    #[test]
    fn legacy_argon2i_hashes_need_rehash() {
        // Example hash produced by the previous default configuration.
        let legacy = "$argon2i$v=19$m=4096,t=3,p=1$c2FsdHNhbHQ$aGFzaA";
        assert!(password_needs_rehash(legacy));
    }

    #[test]
    fn current_hash_does_not_need_rehash() {
        let hash = hash_password("a-sufficiently-long-password".to_string()).unwrap();
        assert!(hash.starts_with("$argon2id$v=19$m=19456,t=2,p=1$"));
        assert!(!password_needs_rehash(&hash));
        argon2::verify_encoded(&hash, b"a-sufficiently-long-password").unwrap();
    }
}
