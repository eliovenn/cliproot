// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
use crate::{
    error::{ParseAttempt, ParseError, ParseErrorCode, Result},
    network::http_url,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseAuthor {
    pub id: Option<String>,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub profile_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaVariant {
    pub url: String,
    #[serde(default = "http_protocol")]
    pub protocol: String,
    pub mime_type: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_ms: Option<u64>,
    pub bitrate: Option<u64>,
    pub codecs: Option<String>,
    #[serde(default = "enabled")]
    pub has_video: bool,
    #[serde(default = "enabled")]
    pub has_audio: bool,
    pub audio_group_id: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub backup_urls: Vec<String>,
    pub expires_at: Option<String>,
}

fn enabled() -> bool {
    true
}
fn http_protocol() -> String {
    "http".into()
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaResource {
    pub kind: String,
    pub thumbnail: Option<String>,
    pub variants: Vec<MediaVariant>,
    pub companion_video: Option<Box<MediaResource>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseResult {
    pub schema_version: u32,
    pub platform_id: String,
    pub content_id: Option<String>,
    pub source_version: String,
    pub input_url: String,
    pub resolved_url: String,
    pub canonical_url: String,
    pub kind: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub text: String,
    pub html: Option<String>,
    pub markdown: Option<String>,
    pub author: Option<String>,
    pub author_info: Option<ParseAuthor>,
    pub published_at: Option<String>,
    pub cover: Option<String>,
    #[serde(default)]
    pub media: Vec<MediaResource>,
    #[serde(default)]
    pub attempts: Vec<ParseAttempt>,
}

impl ParseResult {
    pub(crate) fn validate(&self) -> Result<()> {
        let invalid = || ParseError::new(ParseErrorCode::SourceError);
        if self.schema_version != 1
            || !["article", "image", "video", "audio", "mixed", "text"]
                .contains(&self.kind.as_str())
        {
            return Err(invalid());
        }
        if self.title.is_empty() && self.text.is_empty() && self.media.is_empty() {
            return Err(invalid());
        }
        for url in [&self.input_url, &self.resolved_url, &self.canonical_url] {
            http_url(url).map_err(|_| invalid())?;
        }
        for url in self.cover.iter().chain(
            self.author_info
                .iter()
                .flat_map(|a| a.avatar_url.iter().chain(a.profile_url.iter())),
        ) {
            http_url(url).map_err(|_| invalid())?;
        }
        for media in &self.media {
            media.validate()?;
        }
        Ok(())
    }
}

impl MediaResource {
    fn validate(&self) -> Result<()> {
        let invalid = || ParseError::new(ParseErrorCode::SourceError);
        if self.variants.is_empty()
            || !["image", "video", "audio", "animation", "livePhoto"].contains(&self.kind.as_str())
        {
            return Err(invalid());
        }
        if let Some(url) = &self.thumbnail {
            http_url(url).map_err(|_| invalid())?;
        }
        for variant in &self.variants {
            http_url(&variant.url).map_err(|_| invalid())?;
            if !["http", "hls", "dash"].contains(&variant.protocol.as_str())
                || variant
                    .headers
                    .keys()
                    .any(|k| ["cookie", "authorization"].contains(&k.to_ascii_lowercase().as_str()))
            {
                return Err(invalid());
            }
            for url in &variant.backup_urls {
                http_url(url).map_err(|_| invalid())?;
            }
        }
        if let Some(media) = &self.companion_video {
            media.validate()?;
        }
        Ok(())
    }
}
