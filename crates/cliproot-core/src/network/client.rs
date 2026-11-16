// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
use super::{RestrictedResolver, http_url, policy::validate_destination};
use crate::{
    NetworkPolicy, PlatformConfig,
    error::{ParseError, ParseErrorCode, Result},
    tasks::Task,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use flate2::{Compression, write::GzEncoder};
use futures_util::StreamExt;
use reqwest::{
    Client, Method,
    cookie::{CookieStore, Jar},
    header::{HeaderMap, HeaderName, HeaderValue},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io::Write,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

pub(crate) struct Session {
    client: Client,
    cookies: Arc<Jar>,
    policy: NetworkPolicy,
    task: Arc<Task>,
    requests: AtomicUsize,
    request_limit: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    url: String,
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    headers: BTreeMap<String, String>,
    #[serde(default = "enabled")]
    follow_redirects: bool,
    #[serde(default)]
    https_only: bool,
}

fn enabled() -> bool {
    true
}

impl Session {
    pub(crate) fn new(
        config: &PlatformConfig,
        policy: NetworkPolicy,
        task: Arc<Task>,
        request_limit: usize,
    ) -> Result<Arc<Self>> {
        let cookies = Arc::new(Jar::default());
        for cookie in &config.cookies {
            cookie.validate()?;
            let origin = http_url(&format!(
                "https://{}{}",
                cookie.domain.trim_start_matches('.'),
                cookie.path
            ))?;
            let mut value = format!("{}={}; Path={}", cookie.name, cookie.value, cookie.path);
            if !cookie.host_only {
                value.push_str(&format!("; Domain={}", cookie.domain));
            }
            if cookie.secure {
                value.push_str("; Secure");
            }
            if let Some(expires) = &cookie.expires {
                value.push_str(&format!(
                    "; Expires={}",
                    expires.format("%a, %d %b %Y %H:%M:%S GMT")
                ));
            }
            cookies.add_cookie_str(&value, &origin);
        }
        // 使用内置公共根证书，避免 Android 的 JVM 证书验证器初始化耦合到核心。
        let tls = rustls::ClientConfig::builder_with_provider(Arc::new(
            rustls::crypto::ring::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .map_err(|_| ParseError::new(ParseErrorCode::NetworkError))?
        .with_root_certificates(rustls::RootCertStore::from_iter(
            webpki_roots::TLS_SERVER_ROOTS.iter().cloned(),
        ))
        .with_no_client_auth();
        let client = Client::builder()
            .tls_backend_preconfigured(tls)
            .redirect(reqwest::redirect::Policy::none())
            .cookie_provider(cookies.clone())
            .dns_resolver(Arc::new(RestrictedResolver(policy)))
            .no_proxy()
            .connect_timeout(Duration::from_secs(20))
            .read_timeout(Duration::from_secs(25))
            .timeout(Duration::from_secs(45))
            .build()
            .map_err(|_| ParseError::new(ParseErrorCode::NetworkError))?;
        Ok(Arc::new(Self {
            client,
            cookies,
            policy,
            task,
            requests: AtomicUsize::new(0),
            request_limit,
        }))
    }

    pub(crate) async fn dispatch(&self, input: Value) -> Result<Value> {
        self.task.check()?;
        match input.get("action").and_then(Value::as_str) {
            Some("http.request") => self.request(input).await,
            Some("cookies.get") => {
                let url = http_url(string(&input, "url")?)?;
                let name = string(&input, "name")?;
                let value = self
                    .cookies
                    .cookies(&url)
                    .and_then(|h| h.to_str().ok().map(str::to_owned))
                    .and_then(|h| {
                        h.split(';').find_map(|c| {
                            let (key, value) = c.trim().split_once('=')?;
                            (key == name).then(|| value.to_owned())
                        })
                    });
                Ok(json!(value))
            }
            Some("cookies.set") => {
                let url = http_url(string(&input, "url")?)?;
                let cookie = crate::ParserCookie {
                    name: string(&input, "name")?.into(),
                    value: string(&input, "value")?.into(),
                    domain: url.host_str().unwrap_or_default().into(),
                    path: "/".into(),
                    secure: true,
                    host_only: true,
                    expires: None,
                };
                cookie.validate()?;
                self.cookies.add_cookie_str(
                    &format!("{}={}; Path=/; Secure", cookie.name, cookie.value),
                    &url,
                );
                Ok(json!(true))
            }
            Some("random.hex") => {
                let length = input.get("length").and_then(Value::as_u64).unwrap_or(16);
                if !(1..=4096).contains(&length) {
                    return Err(ParseError::new(ParseErrorCode::SourceError));
                }
                Ok(json!(
                    (0..length)
                        .map(|_| format!("{:02x}", rand::random::<u8>()))
                        .collect::<String>()
                ))
            }
            Some("codec.gzip") => {
                let text = string(&input, "text")?;
                if text.encode_utf16().count() > 1024 * 1024 {
                    return Err(ParseError::new(ParseErrorCode::SourceError));
                }
                let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
                encoder
                    .write_all(text.as_bytes())
                    .map_err(|_| ParseError::new(ParseErrorCode::SourceError))?;
                Ok(json!(STANDARD.encode(encoder.finish().map_err(|_| {
                    ParseError::new(ParseErrorCode::SourceError)
                })?)))
            }
            _ => Err(ParseError::new(ParseErrorCode::IncompatibleSource)),
        }
    }

    pub(crate) async fn request(&self, input: Value) -> Result<Value> {
        if self.requests.fetch_add(1, Ordering::Relaxed) >= self.request_limit {
            return Err(ParseError::new(ParseErrorCode::SourceError));
        }
        let request: Request = serde_json::from_value(input)
            .map_err(|_| ParseError::new(ParseErrorCode::SourceError))?;
        let mut url = http_url(&request.url)?;
        let mut method =
            Method::from_bytes(request.method.unwrap_or_else(|| "GET".into()).as_bytes())
                .map_err(|_| ParseError::new(ParseErrorCode::SourceError))?;
        let mut body = request.body;
        let mut headers = HeaderMap::new();
        for (name, value) in request.headers {
            if ["cookie", "host", "content-length"].contains(&name.to_ascii_lowercase().as_str()) {
                continue;
            }
            headers.insert(
                HeaderName::from_bytes(name.as_bytes())
                    .map_err(|_| ParseError::new(ParseErrorCode::SourceError))?,
                HeaderValue::from_str(&value)
                    .map_err(|_| ParseError::new(ParseErrorCode::SourceError))?,
            );
        }
        for redirect in 0..=8 {
            self.task.check()?;
            if request.https_only && url.scheme() != "https" {
                return Err(ParseError::new(ParseErrorCode::IncompatibleSource));
            }
            validate_destination(&url, self.policy)?;
            let mut builder = self
                .client
                .request(method.clone(), url.clone())
                .headers(headers.clone());
            if let Some(body) = &body {
                builder = builder.body(body.clone());
            }
            let response = tokio::select! {
                _ = self.task.stopped() => { self.task.check()?; unreachable!() },
                response = builder.send() => response.map_err(|_| ParseError::new(ParseErrorCode::NetworkError))?,
            };
            let status = response.status().as_u16();
            let location = response
                .headers()
                .get("location")
                .and_then(|h| h.to_str().ok())
                .map(str::to_owned);
            let content_type = response
                .headers()
                .get("content-type")
                .and_then(|h| h.to_str().ok())
                .unwrap_or_default()
                .to_ascii_lowercase();
            let output_headers: BTreeMap<String, String> = response
                .headers()
                .keys()
                .filter(|k| k.as_str() != "set-cookie")
                .map(|k| {
                    (
                        k.to_string(),
                        response
                            .headers()
                            .get_all(k)
                            .iter()
                            .filter_map(|v| v.to_str().ok())
                            .collect::<Vec<_>>()
                            .join(", "),
                    )
                })
                .collect();
            let mut stream = response.bytes_stream();
            let mut bytes = Vec::new();
            loop {
                let chunk = tokio::select! {
                    _ = self.task.stopped() => { self.task.check()?; unreachable!() },
                    chunk = stream.next() => chunk,
                };
                let Some(chunk) = chunk else {
                    break;
                };
                let chunk = chunk.map_err(|_| ParseError::new(ParseErrorCode::NetworkError))?;
                if bytes.len() + chunk.len() > 12 * 1024 * 1024 {
                    return Err(ParseError::new(ParseErrorCode::SourceError));
                }
                bytes.extend_from_slice(&chunk);
            }
            if request.follow_redirects
                && [301, 302, 303, 307, 308].contains(&status)
                && let Some(location) = location
            {
                if redirect == 8 {
                    return Err(ParseError::new(ParseErrorCode::NetworkError));
                }
                let next = url
                    .join(&location)
                    .map_err(|_| ParseError::new(ParseErrorCode::UnsupportedUrl))?;
                http_url(next.as_str())?;
                if next.origin() != url.origin() {
                    for name in [
                        "authorization",
                        "proxy-authorization",
                        "origin",
                        "referer",
                        "x-csrf-token",
                        "x-csrftoken",
                    ] {
                        headers.remove(name);
                    }
                }
                if status == 303 && method != Method::HEAD
                    || [301, 302].contains(&status) && method == Method::POST
                {
                    method = Method::GET;
                    body = None;
                    headers.remove("content-type");
                }
                url = next;
                continue;
            }
            let text = if content_type.contains("charset=iso-8859-1") {
                bytes.iter().map(|b| char::from(*b)).collect()
            } else {
                String::from_utf8_lossy(&bytes).into_owned()
            };
            return Ok(
                json!({"status": status, "url": url.as_str(), "body": text, "headers": output_headers}),
            );
        }
        Err(ParseError::new(ParseErrorCode::NetworkError))
    }
}

fn string<'a>(input: &'a Value, name: &str) -> Result<&'a str> {
    input
        .get(name)
        .and_then(Value::as_str)
        .ok_or_else(|| ParseError::new(ParseErrorCode::SourceError))
}
