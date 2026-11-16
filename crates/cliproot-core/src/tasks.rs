// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
use crate::error::{ParseError, ParseErrorCode, Result};
use std::{
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
    },
    time::Instant,
};
use tokio_util::sync::CancellationToken;

pub(crate) struct Task {
    pub token: CancellationToken,
    pub deadline: Instant,
    reason: AtomicU8,
    pub finished: CancellationToken,
}

impl Task {
    pub fn new(deadline: Instant) -> Arc<Self> {
        Arc::new(Self {
            token: CancellationToken::new(),
            deadline,
            reason: AtomicU8::new(0),
            finished: CancellationToken::new(),
        })
    }

    pub fn stop(&self, code: ParseErrorCode) {
        let value = match code {
            ParseErrorCode::Timeout => 2,
            ParseErrorCode::Closed => 3,
            _ => 1,
        };
        if self
            .reason
            .compare_exchange(0, value, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            self.token.cancel();
        }
    }

    pub fn reason(&self) -> Option<ParseErrorCode> {
        match self.reason.load(Ordering::Acquire) {
            1 => Some(ParseErrorCode::Cancelled),
            2 => Some(ParseErrorCode::Timeout),
            3 => Some(ParseErrorCode::Closed),
            _ => None,
        }
    }

    pub fn check(&self) -> Result<()> {
        if self.reason().is_none() && Instant::now() >= self.deadline {
            self.stop(ParseErrorCode::Timeout);
        }
        self.reason()
            .map_or(Ok(()), |code| Err(ParseError::new(code)))
    }

    pub async fn stopped(&self) {
        tokio::select! {
            _ = self.token.cancelled() => {},
            _ = tokio::time::sleep_until(self.deadline.into()) => self.stop(ParseErrorCode::Timeout),
        }
    }
}
