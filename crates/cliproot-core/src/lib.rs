// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
//! 与调用语言无关的内容解析宿主。站点规则仍由共享 JavaScript 实现。

mod config;
mod error;
mod models;
mod network;
mod parser;
mod rules;
mod runtime;
mod tasks;

pub use config::{NetworkPolicy, ParserConfig, ParserCookie, PlatformConfig};
pub use error::{ParseAttempt, ParseError, ParseErrorCode};
pub use models::{MediaResource, MediaVariant, ParseAuthor, ParseResult};
pub use parser::{ParseOptions, ParseTask, Parser};
pub use rules::{RuleInfo, RuleUpdateReport, RuleUpdateStatus};
