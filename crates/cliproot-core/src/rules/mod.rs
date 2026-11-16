// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
use crate::{
    error::{ParseError, ParseErrorCode, Result},
    network::Session,
    tasks::Task,
};
use include_dir::{Dir, include_dir};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::{fs, sync::RwLock};
use url::Url;

static BOOTSTRAP: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../resources/bootstrap");

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleInfo {
    pub id: String,
    pub version: String,
    #[serde(rename = "name")]
    pub names: BTreeMap<String, String>,
    pub hosts: Vec<String>,
    pub cookie_domain: Option<String>,
    #[serde(default)]
    pub priority: i32,
    pub entry: String,
    pub sha256: String,
}

impl RuleInfo {
    pub(crate) fn matches(&self, url: &Url) -> bool {
        url.host_str().is_some_and(|host| {
            self.hosts
                .iter()
                .any(|domain| host == domain || host.ends_with(&format!(".{domain}")))
        })
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    manifest_version: u32,
    host_api_version: u32,
    result_schema_version: u32,
    release: String,
    sources: Vec<RuleInfo>,
}

pub(crate) struct Snapshot {
    manifest: Manifest,
    pub code: BTreeMap<String, Vec<u8>>,
}

impl Snapshot {
    pub fn sources(&self) -> &[RuleInfo] {
        &self.manifest.sources
    }
    pub fn release(&self) -> &str {
        &self.manifest.release
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RuleUpdateStatus {
    Updated,
    Unchanged,
    NotConfigured,
    Failed,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleUpdateReport {
    pub status: RuleUpdateStatus,
    pub release: String,
    pub error_code: Option<ParseErrorCode>,
}

pub(crate) struct Rules {
    cache: PathBuf,
    pub current: RwLock<Arc<Snapshot>>,
    pub update_lock: tokio::sync::Mutex<()>,
    pub recovered_cache: bool,
}

impl Rules {
    pub async fn open(cache: PathBuf) -> Result<Self> {
        fs::create_dir_all(&cache).await.map_err(|_| failure())?;
        let mut recovered = false;
        for name in ["active.json", "previous.json"] {
            if fs::try_exists(cache.join(name))
                .await
                .map_err(|_| failure())?
            {
                if let Ok(snapshot) = load_cache(&cache, name).await {
                    return Ok(Self {
                        cache,
                        current: RwLock::new(Arc::new(snapshot)),
                        update_lock: tokio::sync::Mutex::new(()),
                        recovered_cache: recovered || name == "previous.json",
                    });
                }
                recovered = true;
            }
        }
        let manifest = manifest(
            BOOTSTRAP
                .get_file("manifest.json")
                .ok_or_else(failure)?
                .contents(),
        )?;
        let mut code = BTreeMap::new();
        for info in &manifest.sources {
            let bytes = BOOTSTRAP
                .get_file(format!("{}.js", info.id))
                .ok_or_else(failure)?
                .contents()
                .to_vec();
            verify(info, &bytes)?;
            code.insert(info.id.clone(), bytes);
        }
        Ok(Self {
            cache,
            current: RwLock::new(Arc::new(Snapshot { manifest, code })),
            update_lock: tokio::sync::Mutex::new(()),
            recovered_cache: recovered,
        })
    }

    pub async fn update(
        &self,
        url: &str,
        session: Arc<Session>,
        task: Arc<Task>,
    ) -> Result<RuleUpdateReport> {
        let _guard = tokio::select! { _ = task.stopped() => { task.check()?; unreachable!() }, guard = self.update_lock.lock() => guard };
        let current = self.current.read().await.clone();
        let fetched = download(&session, url, 512 * 1024).await?;
        let final_url = crate::network::http_url(fetched.0.as_str())?;
        let candidate = manifest(&fetched.1)?;
        if serde_json::to_value(&candidate).map_err(|_| failure())?
            == serde_json::to_value(&current.manifest).map_err(|_| failure())?
        {
            return Ok(RuleUpdateReport {
                status: RuleUpdateStatus::Unchanged,
                release: current.release().into(),
                error_code: None,
            });
        }
        let mut code = BTreeMap::new();
        for info in &candidate.sources {
            task.check()?;
            let old = current
                .sources()
                .iter()
                .find(|old| old.sha256 == info.sha256);
            let bytes = if let Some(old) = old {
                current.code[&old.id].clone()
            } else {
                let cached = read_bounded(
                    &self.cache.join(format!("{}.js", info.sha256)),
                    8 * 1024 * 1024,
                )
                .await
                .ok();
                if let Some(bytes) = cached.filter(|b| verify(info, b).is_ok()) {
                    bytes
                } else {
                    let target = final_url.join(&info.entry).map_err(|_| failure())?;
                    download(&session, target.as_str(), 8 * 1024 * 1024)
                        .await?
                        .1
                }
            };
            verify(info, &bytes)?;
            let validation = Task::new(
                task.deadline
                    .min(std::time::Instant::now() + std::time::Duration::from_secs(15)),
            );
            let parent = task.clone();
            let child = validation.clone();
            let watcher = tokio::spawn(async move {
                parent.stopped().await;
                child.stop(parent.reason().unwrap_or(ParseErrorCode::Timeout));
            });
            let description =
                crate::parser::run_worker(bytes.clone(), "describe", None, None, validation).await;
            watcher.abort();
            let _ = watcher.await;
            let description = description?;
            if description.get("id").and_then(|v| v.as_str()) != Some(&info.id)
                || description.get("version").and_then(|v| v.as_str()) != Some(&info.version)
                || description.get("apiVersion").and_then(|v| v.as_u64()) != Some(1)
            {
                return Err(ParseError::new(ParseErrorCode::IncompatibleSource));
            }
            atomic_write(&self.cache.join(format!("{}.js", info.sha256)), &bytes).await?;
            code.insert(info.id.clone(), bytes);
        }
        // 数据先落盘，最后提交 manifest；不会让半下载版本成为活动快照。
        for info in current.sources() {
            atomic_write(
                &self.cache.join(format!("{}.js", info.sha256)),
                &current.code[&info.id],
            )
            .await?;
        }
        task.check()?;
        atomic_write(
            &self.cache.join("previous.json"),
            &serde_json::to_vec(&current.manifest).map_err(|_| failure())?,
        )
        .await?;
        atomic_write(
            &self.cache.join("active.json"),
            &serde_json::to_vec(&candidate).map_err(|_| failure())?,
        )
        .await?;
        let release = candidate.release.clone();
        *self.current.write().await = Arc::new(Snapshot {
            manifest: candidate,
            code,
        });
        Ok(RuleUpdateReport {
            status: RuleUpdateStatus::Updated,
            release,
            error_code: None,
        })
    }
}

fn manifest(bytes: &[u8]) -> Result<Manifest> {
    if bytes.len() > 512 * 1024 {
        return Err(failure());
    }
    let mut manifest: Manifest = serde_json::from_slice(bytes).map_err(|_| failure())?;
    if manifest.manifest_version != 1
        || manifest.host_api_version != 1
        || manifest.result_schema_version != 1
    {
        return Err(ParseError::new(ParseErrorCode::IncompatibleSource));
    }
    let mut ids = BTreeSet::new();
    for info in &manifest.sources {
        let id = info.id.as_bytes();
        if id.is_empty()
            || id.len() > 64
            || !id[0].is_ascii_lowercase()
            || !id
                .iter()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_')
            || !ids.insert(&info.id)
            || info.sha256.len() != 64
            || !info
                .sha256
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
            || info.hosts.iter().any(|h| {
                h.is_empty()
                    || !h.bytes().all(|c| {
                        c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'.' || c == b'-'
                    })
            })
        {
            return Err(failure());
        }
    }
    if manifest.sources.is_empty()
        || manifest.sources.len() > 100
        || !ids.contains(&"generic_web".to_owned())
    {
        return Err(failure());
    }
    manifest
        .sources
        .sort_by(|a, b| b.priority.cmp(&a.priority).then(a.id.cmp(&b.id)));
    Ok(manifest)
}

fn verify(info: &RuleInfo, bytes: &[u8]) -> Result<()> {
    if bytes.is_empty()
        || bytes.len() > 8 * 1024 * 1024
        || format!("{:x}", Sha256::digest(bytes)) != info.sha256
    {
        return Err(failure());
    }
    Ok(())
}

async fn load_cache(cache: &Path, name: &str) -> Result<Snapshot> {
    let manifest = manifest(&read_bounded(&cache.join(name), 512 * 1024).await?)?;
    let mut code = BTreeMap::new();
    for info in &manifest.sources {
        let bytes =
            read_bounded(&cache.join(format!("{}.js", info.sha256)), 8 * 1024 * 1024).await?;
        verify(info, &bytes)?;
        code.insert(info.id.clone(), bytes);
    }
    Ok(Snapshot { manifest, code })
}

async fn download(session: &Session, url: &str, limit: usize) -> Result<(String, Vec<u8>)> {
    let target = crate::network::http_url(url)?;
    if target.scheme() != "https" {
        return Err(ParseError::new(ParseErrorCode::IncompatibleSource));
    }
    let result = session
        .request(json!({"url": url, "httpsOnly": true}))
        .await?;
    if result["status"] != 200
        || !result["url"]
            .as_str()
            .is_some_and(|s| s.starts_with("https://"))
    {
        return Err(ParseError::new(ParseErrorCode::NetworkError));
    }
    let bytes = result["body"]
        .as_str()
        .ok_or_else(failure)?
        .as_bytes()
        .to_vec();
    if bytes.len() > limit {
        return Err(failure());
    }
    Ok((result["url"].as_str().ok_or_else(failure)?.into(), bytes))
}

async fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let path = path.to_owned();
    let bytes = bytes.to_vec();
    tokio::task::spawn_blocking(move || {
        use std::io::Write;
        let mut file = atomic_write_file::AtomicWriteFile::open(path).map_err(|_| failure())?;
        file.write_all(&bytes).map_err(|_| failure())?;
        file.commit().map_err(|_| failure())
    })
    .await
    .map_err(|_| failure())?
}

async fn read_bounded(path: &Path, limit: u64) -> Result<Vec<u8>> {
    use tokio::io::AsyncReadExt;
    let file = fs::File::open(path).await.map_err(|_| failure())?;
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| failure())?;
    if bytes.len() as u64 > limit {
        return Err(failure());
    }
    Ok(bytes)
}

fn failure() -> ParseError {
    ParseError::new(ParseErrorCode::SourceError)
}
