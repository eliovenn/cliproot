// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
use crate::{
    NetworkPolicy,
    error::{ParseError, ParseErrorCode, Result},
};
use reqwest::dns::{Name, Resolve, Resolving};
use std::{io, net::IpAddr};
use url::{Host, Url};

pub(crate) fn http_url(value: &str) -> Result<Url> {
    let url = Url::parse(value).map_err(|_| ParseError::new(ParseErrorCode::UnsupportedUrl))?;
    if !["http", "https"].contains(&url.scheme())
        || url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(ParseError::new(ParseErrorCode::UnsupportedUrl));
    }
    Ok(url)
}

pub(crate) fn validate_destination(url: &Url, policy: NetworkPolicy) -> Result<()> {
    if policy == NetworkPolicy::AllowPrivate {
        return Ok(());
    }
    let allowed = match url.host() {
        Some(Host::Ipv4(ip)) => public_ip(ip.into()),
        Some(Host::Ipv6(ip)) => public_ip(ip.into()),
        Some(Host::Domain(name)) => name != "localhost" && !name.ends_with(".localhost"),
        None => false,
    };
    if allowed {
        Ok(())
    } else {
        Err(ParseError::new(ParseErrorCode::NetworkError))
    }
}

// 服务端 egress 业务策略：保守拒绝私网、保留段、文档段及 IPv6 过渡地址。
fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !(a == 0
                || a == 10
                || a == 127
                || a >= 224
                || a == 100 && (64..=127).contains(&b)
                || a == 169 && b == 254
                || a == 172 && (16..=31).contains(&b)
                || a == 192 && (b == 168 || b == 0 && (c == 0 || c == 2) || b == 88 && c == 99)
                || a == 198 && (b == 18 || b == 19 || b == 51 && c == 100)
                || a == 203 && b == 0 && c == 113)
        }
        IpAddr::V6(ip) => {
            if let Some(ip) = ip.to_ipv4_mapped() {
                return public_ip(ip.into());
            }
            let s = ip.segments();
            s[0] & 0xe000 == 0x2000
                && !(s[0] == 0x2001 && (s[1] < 0x200 || s[1] == 0xdb8))
                && s[0] != 0x2002
                && !(s[0] == 0x3fff && s[1] < 0x1000)
        }
    }
}

pub(crate) struct RestrictedResolver(pub NetworkPolicy);

impl Resolve for RestrictedResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let name = name.as_str().to_owned();
        let policy = self.0;
        Box::pin(async move {
            // 这里的结果直接用于连接，不做“验证后另一次 DNS 查询”。
            let addresses: Vec<_> = tokio::net::lookup_host((name.as_str(), 0)).await?.collect();
            if addresses.is_empty()
                || policy == NetworkPolicy::PublicOnly
                    && addresses.iter().any(|a| !public_ip(a.ip()))
            {
                return Err(Box::new(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "destination denied",
                ))
                    as Box<dyn std::error::Error + Send + Sync>);
            }
            Ok(Box::new(addresses.into_iter())
                as Box<dyn Iterator<Item = std::net::SocketAddr> + Send>)
        })
    }
}
