// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ParseErrorCode {
    UnsupportedUrl,
    AuthenticationRequired,
    ContentUnavailable,
    RateLimited,
    NetworkError,
    Timeout,
    SourceError,
    IncompatibleSource,
    Cancelled,
    Closed,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ParseAttempt {
    pub stage: String,
    pub code: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ParseError {
    pub code: ParseErrorCode,
    #[serde(default)]
    pub attempts: Vec<ParseAttempt>,
}

impl ParseError {
    pub(crate) fn new(code: ParseErrorCode) -> Self {
        Self {
            code,
            attempts: Vec::new(),
        }
    }
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // 仅输出稳定代码，不携带上游响应、Cookie、签名或 URL 查询参数。
        write!(f, "{:?}", self.code)
    }
}

impl std::error::Error for ParseError {}
pub(crate) type Result<T> = std::result::Result<T, ParseError>;
