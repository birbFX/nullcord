/// Return whether `cidr` (an IP or `network/prefix`) contains `ip`.
fn cidr_contains(cidr: &str, ip: std::net::IpAddr) -> bool {
    use std::net::IpAddr;

    let cidr = cidr.trim();
    let (network, prefix) = match cidr.split_once('/') {
        Some((network, prefix)) => (network, Some(prefix)),
        None => (cidr, None),
    };

    let Ok(network) = network.parse::<IpAddr>() else {
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

/// Whether an address is a loopback address.
pub fn is_loopback(ip: Option<std::net::IpAddr>) -> bool {
    ip.is_some_and(|ip| ip.is_loopback())
}

/// Whether forwarded headers from this peer may be trusted.
///
/// Loopback is always trusted because the reverse proxy (cloudflared) is
/// expected to connect locally. Additional proxies must be configured
/// explicitly with `api.security.trusted_proxies`.
pub async fn is_trusted_proxy(ip: Option<std::net::IpAddr>) -> bool {
    let Some(ip) = ip else {
        return false;
    };

    if ip.is_loopback() {
        return true;
    }

    revolt_config::config()
        .await
        .api
        .security
        .trusted_proxies
        .iter()
        .any(|entry| cidr_contains(entry, ip))
}

#[cfg(feature = "rocket-impl")]
pub mod rocket {
    use super::{is_loopback, is_trusted_proxy};
    use revolt_config::config;
    use rocket::{
        Request,
        request::{FromRequest, Outcome},
    };
    use std::net::IpAddr;

    /// Client IP resolved through the same trusted-proxy logic as ratelimits.
    pub struct RealIp(pub String);

    #[rocket::async_trait]
    impl<'r> FromRequest<'r> for RealIp {
        type Error = ();

        async fn from_request(request: &'r Request<'_>) -> Outcome<Self, Self::Error> {
            Outcome::Success(RealIp(to_real_ip(request).await))
        }
    }

    pub fn to_ip(request: &'_ Request<'_>) -> String {
        request
            .client_ip()
            .map(|x| x.to_string())
            .unwrap_or_default()
    }

    fn valid_ip(value: &str) -> Option<String> {
        value
            .trim()
            .parse::<IpAddr>()
            .ok()
            .map(|ip| ip.to_string())
    }

    /// Find the actual IP of the client.
    ///
    /// Forwarded headers are only honoured when the TCP peer is a trusted
    /// proxy. Without this check any remote client could spoof
    /// `X-Forwarded-For` / `CF-Connecting-IP` and bypass IP bans and
    /// per-address rate limits.
    pub async fn to_real_ip(request: &'_ Request<'_>) -> String {
        let peer = request.client_ip();
        if !is_trusted_proxy(peer).await {
            return to_ip(request);
        }

        let config = config().await;

        if config.api.security.trust_cloudflare
            && let Some(value) = request.headers().get_one("cf-connecting-ip")
            && let Some(ip) = valid_ip(value)
        {
            return ip;
        }

        if let Some(value) = request.headers().get_one("x-forwarded-for") {
            // The right-most entry is added by the proxy closest to us.
            if let Some(ip) = value.rsplit(',').find_map(valid_ip) {
                return ip;
            }
        }

        if let Some(value) = request.headers().get_one("x-real-ip")
            && let Some(ip) = valid_ip(value)
        {
            return ip;
        }

        to_ip(request)
    }

    /// A request that arrived directly over loopback without any forwarding
    /// headers. Cloudflared always adds forwarding headers, so this reliably
    /// identifies local operator tooling on the host.
    pub fn is_local_direct(request: &'_ Request<'_>) -> bool {
        is_loopback(request.client_ip())
            && request.headers().get_one("cf-connecting-ip").is_none()
            && request.headers().get_one("x-forwarded-for").is_none()
            && request.headers().get_one("x-real-ip").is_none()
    }

    /// The scheme as seen by the client, accepting forwarded protocol only
    /// from trusted proxies.
    pub async fn request_is_secure(request: &'_ Request<'_>) -> bool {
        let peer = request.client_ip();
        let trusted = is_trusted_proxy(peer).await;

        match request.headers().get_one("x-forwarded-proto") {
            Some(value) if trusted => value
                .split(',')
                .next()
                .is_some_and(|proto| proto.trim().eq_ignore_ascii_case("https")),
            Some(_) => false,
            None => trusted && is_loopback(peer),
        }
    }

    /// Whether the socket peer is loopback (used for internal-only routes).
    pub fn peer_is_loopback(request: &'_ Request<'_>) -> bool {
        is_loopback(request.client_ip())
    }
}

#[cfg(feature = "axum-impl")]
pub mod axum {
    use axum::{
        extract::ConnectInfo,
        http::request::Parts,
    };
    use revolt_config::config;
    use std::net::SocketAddr;

    pub fn to_ip(parts: &Parts) -> String {
        parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|info| info.ip().to_string())
            .unwrap_or_default()
    }

    /// Find the actual IP of the client.
    ///
    /// Forwarded headers are only honoured from a trusted proxy peer.
    pub async fn to_real_ip(parts: &Parts) -> String {
        use std::net::IpAddr;

        let peer = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|info| info.ip());

        if !super::is_trusted_proxy(peer).await {
            return to_ip(parts);
        }

        let valid = |value: &str| -> Option<String> {
            value.trim().parse::<IpAddr>().ok().map(|ip| ip.to_string())
        };

        if config().await.api.security.trust_cloudflare
            && let Some(value) = parts
                .headers
                .get("cf-connecting-ip")
                .and_then(|value| value.to_str().ok())
            && let Some(ip) = valid(value)
        {
            return ip;
        }

        if let Some(value) = parts
            .headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
            && let Some(ip) = value.rsplit(',').find_map(valid)
        {
            return ip;
        }

        to_ip(parts)
    }
}
