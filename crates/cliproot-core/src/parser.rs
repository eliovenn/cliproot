// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
use crate::{
    ParseResult, ParserConfig, PlatformConfig, RuleInfo, RuleUpdateReport, RuleUpdateStatus,
    error::{ParseError, ParseErrorCode, Result},
    network::{Session, http_url},
    rules::{Rules, Snapshot},
    runtime,
    tasks::Task,
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex, RwLock,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::sync::{Semaphore, oneshot};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseOptions {
    pub task_id: String,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
}

fn default_timeout() -> u64 {
    60_000
}

#[derive(Clone)]
pub struct Parser {
    inner: Arc<Inner>,
}

struct Inner {
    config: RwLock<ParserConfig>,
    rules: Rules,
    slots: Arc<Semaphore>,
    tasks: Mutex<BTreeMap<String, Arc<Task>>>,
    closed: AtomicBool,
}

/// 先获得任务再等待结果，取消可以发生在开始执行前，不依赖 taskId 注册时序。
pub struct ParseTask {
    task: Arc<Task>,
    result: tokio::sync::Mutex<Option<oneshot::Receiver<Result<ParseResult>>>>,
}

impl ParseTask {
    pub fn cancel(&self) {
        self.task.stop(ParseErrorCode::Cancelled);
    }

    pub async fn result(&self) -> Result<ParseResult> {
        let receiver = self
            .result
            .lock()
            .await
            .take()
            .ok_or_else(|| ParseError::new(ParseErrorCode::SourceError))?;
        receiver.await.map_err(|_| {
            ParseError::new(self.task.reason().unwrap_or(ParseErrorCode::SourceError))
        })?
    }
}

impl Drop for ParseTask {
    fn drop(&mut self) {
        if !self.task.finished.is_cancelled() {
            self.cancel();
        }
    }
}

struct TaskGuard {
    inner: Arc<Inner>,
    id: String,
    task: Arc<Task>,
}

impl Drop for TaskGuard {
    fn drop(&mut self) {
        if let Ok(mut tasks) = self.inner.tasks.lock() {
            tasks.remove(&self.id);
        }
        self.task.finished.cancel();
    }
}

impl Parser {
    pub async fn open(config: ParserConfig) -> Result<Self> {
        config.validate()?;
        let rules = Rules::open(config.cache_path.clone()).await?;
        let concurrency = config.concurrency;
        Ok(Self {
            inner: Arc::new(Inner {
                config: RwLock::new(config),
                rules,
                slots: Arc::new(Semaphore::new(concurrency)),
                tasks: Mutex::new(BTreeMap::new()),
                closed: AtomicBool::new(false),
            }),
        })
    }

    pub async fn start(&self, input: String, options: ParseOptions) -> Result<ParseTask> {
        self.check_open()?;
        let url = Self::extract_url(&input)?;
        let snapshot = self.inner.rules.current.read().await.clone();
        let config = self.inner.config.read().map_err(|_| failure())?.clone();
        let guard = self.register(options.task_id, options.timeout_ms)?;
        let task = guard.task.clone();
        let (sender, receiver) = oneshot::channel();
        // 任务所有者独立于等待结果的调用方，close() 能等待实际 worker 释放。
        tokio::spawn(async move {
            let result = run_parse(&guard.inner, &url, guard.task.clone(), snapshot, config).await;
            let _ = sender.send(result);
            drop(guard);
        });
        Ok(ParseTask {
            task,
            result: tokio::sync::Mutex::new(Some(receiver)),
        })
    }

    pub async fn parse(&self, input: String, options: ParseOptions) -> Result<ParseResult> {
        self.start(input, options).await?.result().await
    }

    pub fn cancel(&self, task_id: &str) -> bool {
        let Ok(tasks) = self.inner.tasks.lock() else {
            return false;
        };
        if let Some(task) = tasks.get(task_id) {
            task.stop(ParseErrorCode::Cancelled);
            true
        } else {
            false
        }
    }

    pub fn update_platforms(&self, platforms: BTreeMap<String, PlatformConfig>) -> Result<()> {
        self.check_open()?;
        let mut config = self.inner.config.write().map_err(|_| failure())?;
        let mut candidate = config.clone();
        candidate.platforms = platforms;
        candidate.validate()?;
        *config = candidate;
        Ok(())
    }

    pub fn set_source_manifest_url(&self, url: Option<String>) -> Result<()> {
        self.check_open()?;
        let mut config = self.inner.config.write().map_err(|_| failure())?;
        let mut candidate = config.clone();
        candidate.source_manifest_url = url;
        candidate.validate()?;
        *config = candidate;
        Ok(())
    }

    pub async fn sources(&self) -> Vec<RuleInfo> {
        self.inner.rules.current.read().await.sources().to_vec()
    }
    pub async fn source_release(&self) -> String {
        self.inner.rules.current.read().await.release().into()
    }
    pub fn recovered_source_cache(&self) -> bool {
        self.inner.rules.recovered_cache
    }

    pub async fn update_rules(&self) -> Result<RuleUpdateReport> {
        self.check_open()?;
        let config = self.inner.config.read().map_err(|_| failure())?.clone();
        let release = self.source_release().await;
        let Some(url) = config.source_manifest_url else {
            return Ok(RuleUpdateReport {
                status: RuleUpdateStatus::NotConfigured,
                release,
                error_code: None,
            });
        };
        let guard = self.register(format!("rules-{:032x}", rand::random::<u128>()), 300_000)?;
        let handle = tokio::spawn(async move {
            let result = async {
                let _permit = tokio::select! {
                    _ = guard.task.stopped() => return Err(ParseError::new(guard.task.reason().unwrap_or(ParseErrorCode::Timeout))),
                    permit = guard.inner.slots.clone().acquire_owned() => permit.map_err(|_| failure())?,
                };
                let session = Session::new(&PlatformConfig::default(), config.network_policy, guard.task.clone(), 128)?;
                guard.inner.rules.update(&url, session, guard.task.clone()).await
            }.await;
            match result {
                Ok(report) => report,
                Err(error) => RuleUpdateReport {
                    status: RuleUpdateStatus::Failed,
                    release,
                    error_code: Some(error.code),
                },
            }
        });
        handle.await.map_err(|_| failure())
    }

    pub async fn close(&self) -> Result<()> {
        let tasks: Vec<_> = {
            let tasks = self.inner.tasks.lock().map_err(|_| failure())?;
            self.inner.closed.store(true, Ordering::Release);
            tasks.values().cloned().collect()
        };
        for task in &tasks {
            task.stop(ParseErrorCode::Closed);
        }
        for task in tasks {
            task.finished.cancelled().await;
        }
        Ok(())
    }

    pub fn extract_url(input: &str) -> Result<String> {
        if input.len() > 64 * 1024 {
            return Err(ParseError::new(ParseErrorCode::UnsupportedUrl));
        }
        static BV: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
            Regex::new(r"(?i)^BV[0-9A-Za-z]{10}$").expect("constant regex")
        });
        static LINK: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
            Regex::new(r#"(?i)https?://[^\s<>"\u{3000}]+"#).expect("constant regex")
        });
        let input = input.trim();
        if BV.is_match(input) {
            return Ok(format!("https://www.bilibili.com/video/{input}"));
        }
        let mut text = LINK.find(input).map_or(input, |m| m.as_str());
        if let Some(next) = text.get(8..).and_then(|tail| LINK.find(tail)) {
            text = &text[..8 + next.start()];
        }
        let text = text.trim_end_matches([
            '。', '！', '，', '、', '；', '）', '】', ']', ')', '}', '>', ',', '.', ';',
        ]);
        let normalized = if text.contains("://") {
            text.to_owned()
        } else {
            format!("https://{text}")
        };
        let url = http_url(&normalized)?;
        if !url.host_str().is_some_and(|h| h.contains('.')) {
            return Err(ParseError::new(ParseErrorCode::UnsupportedUrl));
        }
        Ok(url.into())
    }

    fn check_open(&self) -> Result<()> {
        if self.inner.closed.load(Ordering::Acquire) {
            Err(ParseError::new(ParseErrorCode::Closed))
        } else {
            Ok(())
        }
    }

    fn register(&self, id: String, timeout_ms: u64) -> Result<TaskGuard> {
        if id.is_empty() || id.len() > 128 || !(1..=600_000).contains(&timeout_ms) {
            return Err(failure());
        }
        let mut tasks = self.inner.tasks.lock().map_err(|_| failure())?;
        self.check_open()?;
        if tasks.len() >= 128 || tasks.contains_key(&id) {
            return Err(failure());
        }
        let task = Task::new(Instant::now() + Duration::from_millis(timeout_ms));
        tasks.insert(id.clone(), task.clone());
        Ok(TaskGuard {
            inner: self.inner.clone(),
            id,
            task,
        })
    }
}

async fn run_parse(
    inner: &Inner,
    url: &str,
    task: Arc<Task>,
    snapshot: Arc<Snapshot>,
    config: ParserConfig,
) -> Result<ParseResult> {
    let _permit = tokio::select! {
        _ = task.stopped() => return Err(ParseError::new(task.reason().unwrap_or(ParseErrorCode::Timeout))),
        permit = inner.slots.clone().acquire_owned() => permit.map_err(|_| failure())?,
    };
    task.check()?;
    let uri = http_url(url)?;
    let source = snapshot
        .sources()
        .iter()
        .find(|s| s.matches(&uri))
        .or_else(|| snapshot.sources().iter().find(|s| s.id == "generic_web"))
        .ok_or_else(failure)?;
    let platform = config
        .platforms
        .get(&source.id)
        .cloned()
        .unwrap_or_default();
    let session = Session::new(&platform, config.network_policy, task.clone(), 80)?;
    let envelope = run_worker(
        snapshot.code[&source.id].clone(),
        "parse",
        Some(json!({"url": url, "options": platform.options})),
        Some(session),
        task.clone(),
    )
    .await?;
    task.check()?;
    if envelope["ok"] != true {
        return Err(serde_json::from_value(envelope["error"].clone()).unwrap_or_else(|_| failure()));
    }
    let result: ParseResult =
        serde_json::from_value(envelope["data"].clone()).map_err(|_| failure())?;
    result.validate()?;
    Ok(result)
}

pub(crate) async fn run_worker(
    source: Vec<u8>,
    method: &'static str,
    argument: Option<Value>,
    session: Option<Arc<Session>>,
    task: Arc<Task>,
) -> Result<Value> {
    static WORKERS: std::sync::OnceLock<Result<tokio::runtime::Runtime>> =
        std::sync::OnceLock::new();
    let workers = WORKERS
        .get_or_init(|| {
            // QuickJS 的 2 MiB 栈上限不能占满宿主默认的 2 MiB 线程栈。
            // 共享 Tokio blocking pool 同时约束跨 Parser 实例的 JS 执行资源。
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(1)
                .max_blocking_threads(8)
                .thread_stack_size(8 * 1024 * 1024)
                .enable_all()
                .build()
                .map_err(|_| failure())
        })
        .as_ref()
        .map_err(Clone::clone)?;
    workers
        .spawn_blocking(move || {
            let local = tokio::task::LocalSet::new();
            local.block_on(
                workers,
                runtime::execute(source, method, argument, session, task),
            )
        })
        .await
        .map_err(|_| failure())?
}

fn failure() -> ParseError {
    ParseError::new(ParseErrorCode::SourceError)
}
