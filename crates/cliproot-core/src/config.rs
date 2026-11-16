// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
use crate::error::{ParseError, ParseErrorCode, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{collections::BTreeMap, fmt, path::PathBuf};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NetworkPolicy {
    /// 服务端默认策略；拒绝非公共地址和代理旁路。
    #[default]
    PublicOnly,
    /// 仅供可信本机使用；不得接受互联网用户自由指定此策略。
    AllowPrivate,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParserCookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    #[serde(default = "cookie_path")]
    pub path: String,
    #[serde(default = "enabled")]
    pub secure: bool,
    #[serde(default)]
    pub host_only: bool,
    pub expires: Option<chrono::DateTime<chrono::Utc>>,
}

fn cookie_path() -> String {
    "/".into()
}
fn enabled() -> bool {
    true
}

impl ParserCookie {
    pub(crate) fn validate(&self) -> Result<()> {
        let valid_name = !self.name.is_empty()
            && self
                .name
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&c));
        let valid_value = self
            .value
            .bytes()
            .all(|c| c > 32 && c != 127 && c != b';' && c != b',');
        let domain = self.domain.trim_start_matches('.');
        let valid_domain = !domain.is_empty()
            && domain.contains('.')
            && domain
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-');
        if !valid_name
            || !valid_value
            || !valid_domain
            || !self.path.starts_with('/')
            || self.path.contains(['\r', '\n', ';'])
        {
            return Err(ParseError::new(ParseErrorCode::SourceError));
        }
        Ok(())
    }
}

impl fmt::Debug for ParserCookie {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ParserCookie")
            .field("name", &self.name)
            .field("domain", &self.domain)
            .field("value", &"[redacted]")
            .finish()
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct PlatformConfig {
    #[serde(default)]
    pub cookies: Vec<ParserCookie>,
    #[serde(default)]
    pub options: Map<String, Value>,
}

impl fmt::Debug for PlatformConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PlatformConfig")
            .field("cookie_count", &self.cookies.len())
            .field("options", &"[redacted]")
            .finish()
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParserConfig {
    pub cache_path: PathBuf,
    #[serde(default = "default_concurrency")]
    pub concurrency: usize,
    #[serde(default)]
    pub network_policy: NetworkPolicy,
    pub source_manifest_url: Option<String>,
    #[serde(default)]
    pub platforms: BTreeMap<String, PlatformConfig>,
}

fn default_concurrency() -> usize {
    1
}

impl ParserConfig {
    pub fn local(cache_path: impl Into<PathBuf>) -> Self {
        Self {
            cache_path: cache_path.into(),
            concurrency: 1,
            network_policy: NetworkPolicy::PublicOnly,
            source_manifest_url: None,
            platforms: BTreeMap::new(),
        }
    }

    pub(crate) fn validate(&self) -> Result<()> {
        if self.cache_path.as_os_str().is_empty() || !(1..=8).contains(&self.concurrency) {
            return Err(ParseError::new(ParseErrorCode::SourceError));
        }
        for platform in self.platforms.values() {
            for cookie in &platform.cookies {
                cookie.validate()?;
            }
        }
        if let Some(url) = &self.source_manifest_url {
            let uri = crate::network::http_url(url)?;
            if uri.scheme() != "https" {
                return Err(ParseError::new(ParseErrorCode::IncompatibleSource));
            }
        }
        Ok(())
    }
}
