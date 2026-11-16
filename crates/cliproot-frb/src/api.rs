// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
use cliproot_core::{ParseOptions, Parser, ParserConfig};
use flutter_rust_bridge::frb;
use std::fmt;

#[derive(Debug)]
pub struct CliprootFailure {
    pub details_json: String,
}

impl fmt::Display for CliprootFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.details_json)
    }
}
impl std::error::Error for CliprootFailure {}

impl From<cliproot_core::ParseError> for CliprootFailure {
    fn from(error: cliproot_core::ParseError) -> Self {
        Self {
            details_json: serde_json::to_string(&error)
                .unwrap_or_else(|_| r#"{"code":"sourceError","attempts":[]}"#.into()),
        }
    }
}

fn invalid() -> CliprootFailure {
    CliprootFailure {
        details_json: r#"{"code":"sourceError","attempts":[]}"#.into(),
    }
}

pub struct NativeParser {
    inner: Parser,
}
pub struct NativeParseTask {
    inner: cliproot_core::ParseTask,
}

#[frb(init)]
pub fn init_bridge() {
    flutter_rust_bridge::setup_default_user_utils();
}

impl NativeParser {
    pub async fn open(config_json: String) -> Result<Self, CliprootFailure> {
        if config_json.len() > 1024 * 1024 {
            return Err(invalid());
        }
        let config: ParserConfig = serde_json::from_str(&config_json).map_err(|_| invalid())?;
        Ok(Self {
            inner: Parser::open(config).await?,
        })
    }

    pub async fn start(
        &self,
        input: String,
        task_id: String,
        timeout_ms: u64,
    ) -> Result<NativeParseTask, CliprootFailure> {
        Ok(NativeParseTask {
            inner: self
                .inner
                .start(
                    input,
                    ParseOptions {
                        task_id,
                        timeout_ms,
                    },
                )
                .await?,
        })
    }

    pub async fn rules_json(&self) -> Result<String, CliprootFailure> {
        serde_json::to_string(&self.inner.sources().await).map_err(|_| invalid())
    }

    pub async fn source_release(&self) -> String {
        self.inner.source_release().await
    }
    pub async fn recovered_source_cache(&self) -> bool {
        self.inner.recovered_source_cache()
    }

    pub async fn update_platforms(&self, platforms_json: String) -> Result<(), CliprootFailure> {
        if platforms_json.len() > 1024 * 1024 {
            return Err(invalid());
        }
        let platforms = serde_json::from_str(&platforms_json).map_err(|_| invalid())?;
        Ok(self.inner.update_platforms(platforms)?)
    }

    pub async fn update_rules_json(&self) -> Result<String, CliprootFailure> {
        serde_json::to_string(&self.inner.update_rules().await?).map_err(|_| invalid())
    }

    pub async fn set_source_manifest_url(
        &self,
        url: Option<String>,
    ) -> Result<(), CliprootFailure> {
        Ok(self.inner.set_source_manifest_url(url)?)
    }

    pub async fn close(&self) -> Result<(), CliprootFailure> {
        Ok(self.inner.close().await?)
    }
}

impl NativeParseTask {
    pub async fn result_json(&self) -> Result<String, CliprootFailure> {
        serde_json::to_string(&self.inner.result().await?).map_err(|_| invalid())
    }

    pub async fn cancel(&self) {
        self.inner.cancel();
    }
}
