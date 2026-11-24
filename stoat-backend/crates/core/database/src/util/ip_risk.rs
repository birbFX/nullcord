//! Configurable risk-based IP intelligence.
//!
//! The engine is intentionally provider-agnostic and disabled by default:
//! - local lists for VPN/proxy/Tor/abuse ranges (`blocklist_file`,
//!   `tor_exit_file`),
//! - an optional HTTP provider (`provider_url`, `provider_key`) with a
//!   documented JSON contract,
//! - administrator-selected policy per action (`allow`, `challenge`, `block`).
//!
//! It never treats an IP address as a permanent identity on its own and
//! never blocks all VPN traffic unless the operator explicitly configures
//! that policy.

use std::{
    collections::HashMap,
    net::IpAddr,
    sync::{LazyLock, Mutex},
    time::{Duration, Instant},
};

use revolt_config::{ApiSecurityIpRisk, config};
use serde::{Deserialize, Serialize};

/// Outcome of an IP risk assessment.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskAction {
    Allow,
    Challenge,
    Block,
}

impl RiskAction {
    fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "allow" | "none" => Some(Self::Allow),
            "challenge" | "verify" | "captcha" => Some(Self::Challenge),
            "block" | "deny" => Some(Self::Block),
            _ => None,
        }
    }
}

/// Full assessment result.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RiskAssessment {
    pub score: i32,
    pub categories: Vec<String>,
    pub action: RiskAction,
    /// `low`, `medium`, `high`
    pub risk: String,
}

impl Default for RiskAssessment {
    fn default() -> Self {
        Self {
            score: 0,
            categories: Vec::new(),
            action: RiskAction::Allow,
            risk: "low".to_string(),
        }
    }
}

#[derive(Deserialize)]
struct ProviderResponse {
    #[serde(default)]
    score: i32,
    #[serde(default)]
    categories: Vec<String>,
    #[serde(default)]
    action: Option<String>,
}

static CACHE: LazyLock<Mutex<HashMap<String, (Instant, RiskAssessment)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static HTTP: LazyLock<reqwest::Client> = LazyLock::new(reqwest::Client::new);

fn cidr_contains(cidr: &str, ip: IpAddr) -> bool {
    let (network, prefix) = match cidr.split_once('/') {
        Some((network, prefix)) => (network, Some(prefix)),
        None => (cidr, None),
    };

    let Ok(network) = network.trim().parse::<IpAddr>() else {
        return false;
    };

    match (network, ip) {
        (IpAddr::V4(network), IpAddr::V4(ip)) => {
            let bits = prefix
                .and_then(|p| p.parse::<u32>().ok())
                .unwrap_or(32)
                .min(32);
            let mask = if bits == 0 { 0 } else { u32::MAX << (32 - bits) };
            (u32::from(network) & mask) == (u32::from(ip) & mask)
        }
        (IpAddr::V6(network), IpAddr::V6(ip)) => {
            let bits = prefix
                .and_then(|p| p.parse::<u32>().ok())
                .unwrap_or(128)
                .min(128);
            let mask = if bits == 0 { 0 } else { u128::MAX << (128 - bits) };
            (u128::from(network) & mask) == (u128::from(ip) & mask)
        }
        _ => false,
    }
}

fn local_score(ip: IpAddr, policy: &ApiSecurityIpRisk) -> (i32, Vec<String>) {
    let mut score = 0;
    let mut categories = Vec::new();

    if !policy.tor_exit_file.is_empty()
        && let Ok(contents) = std::fs::read_to_string(&policy.tor_exit_file)
        && contents
            .lines()
            .map(str::trim)
            .any(|line| line.parse::<IpAddr>().ok() == Some(ip))
    {
        score += 45;
        categories.push("tor".to_string());
    }

    if !policy.blocklist_file.is_empty()
        && let Ok(contents) = std::fs::read_to_string(&policy.blocklist_file)
    {
        for line in contents.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            let mut parts = line.split(',');
            let Some(network) = parts.next() else {
                continue;
            };

            if !cidr_contains(network, ip) {
                continue;
            }

            let points = parts
                .next()
                .and_then(|value| value.trim().parse::<i32>().ok())
                .unwrap_or(policy.medium_threshold);
            let category = parts
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("listed")
                .to_string();

            score += points;
            categories.push(category);
            break;
        }
    }

    (score, categories)
}

async fn provider_score(ip: &str, policy: &ApiSecurityIpRisk) -> Option<(i32, Vec<String>, Option<String>)> {
    if policy.provider_url.is_empty() {
        return None;
    }

    let mut request = HTTP
        .post(&policy.provider_url)
        .timeout(Duration::from_secs(3))
        .json(&serde_json::json!({ "ip": ip }));

    if !policy.provider_key.is_empty() {
        request = request.bearer_auth(&policy.provider_key);
    }

    let response = request.send().await.ok()?;
    if !response.status().is_success() {
        log::warn!(
            "IP risk provider returned {} for a lookup",
            response.status()
        );
        return None;
    }

    let parsed = response.json::<ProviderResponse>().await.ok()?;
    Some((parsed.score, parsed.categories, parsed.action))
}

/// Assess a source address for a specific action.
pub async fn assess(ip: &str, registration: bool) -> RiskAssessment {
    let policy = config().await.api.security.ip_risk.clone();

    if !policy.enabled {
        return RiskAssessment::default();
    }

    if let Ok(cache) = CACHE.lock()
        && let Some((at, assessment)) = cache.get(ip)
        && at.elapsed() < Duration::from_secs(600)
    {
        return assessment.clone();
    }

    let Ok(parsed) = ip.trim().parse::<IpAddr>() else {
        return RiskAssessment::default();
    };

    let (mut score, mut categories) = local_score(parsed, &policy);
    let mut provider_action = None;

    if let Some((remote_score, remote_categories, action)) =
        provider_score(&parsed.to_string(), &policy).await
    {
        score += remote_score;
        categories.extend(remote_categories);
        provider_action = action;
    }

    let risk = if score >= policy.high_threshold {
        "high"
    } else if score >= policy.medium_threshold {
        "medium"
    } else {
        "low"
    };

    let configured = if registration {
        &policy.registration_policy
    } else {
        &policy.login_policy
    };
    let configured_action = RiskAction::parse(configured).unwrap_or(RiskAction::Challenge);

    let action = if let Some(action) = provider_action.as_deref().and_then(RiskAction::parse) {
        // The provider may escalate, but the operator's policy decides
        // whether a medium/high result is tolerated.
        if action == RiskAction::Allow && configured_action != RiskAction::Allow {
            configured_action
        } else {
            action
        }
    } else if score >= policy.high_threshold || score >= policy.medium_threshold {
        configured_action
    } else {
        RiskAction::Allow
    };

    let assessment = RiskAssessment {
        score,
        categories,
        action,
        risk: risk.to_string(),
    };

    if let Ok(mut cache) = CACHE.lock() {
        cache.insert(ip.to_string(), (Instant::now(), assessment.clone()));
        if cache.len() > 10_000 {
            cache.retain(|_, (at, _)| at.elapsed() < Duration::from_secs(600));
        }
    }

    assessment
}
