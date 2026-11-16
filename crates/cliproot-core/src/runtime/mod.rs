// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
use crate::{
    error::{ParseError, ParseErrorCode, Result},
    network::Session,
    tasks::Task,
};
use rquickjs::{
    AsyncContext, AsyncRuntime, Function, Module, Value,
    loader::{BuiltinResolver, ModuleLoader},
    prelude::Async,
};
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;

// 兼容源 ABI v1 的 fjs 名称，但回调现在完全在 Rust 内处理，不再往返 Dart。
const BRIDGE: &str = r#"
(() => {
  const bridge = globalThis.__cliprootBridge;
  delete globalThis.__cliprootBridge;
  globalThis.fjs = Object.freeze({
    bridge_call: async input => JSON.parse(await bridge(JSON.stringify(input)))
  });
})();
"#;

pub(crate) async fn execute(
    source: Vec<u8>,
    method: &'static str,
    argument: Option<JsonValue>,
    session: Option<Arc<Session>>,
    task: Arc<Task>,
) -> Result<JsonValue> {
    task.check()?;
    let js = AsyncRuntime::new().map_err(|_| failure())?;
    js.set_memory_limit(256 * 1024 * 1024).await;
    js.set_max_stack_size(2 * 1024 * 1024).await;
    let interrupted = task.clone();
    js.set_interrupt_handler(Some(Box::new(move || interrupted.check().is_err())))
        .await;
    let resolver = BuiltinResolver::default()
        .with_module("crypto")
        .with_module("node:crypto")
        .with_module("buffer")
        .with_module("node:buffer")
        .with_module("url")
        .with_module("node:url")
        .with_module("util")
        .with_module("node:util");
    let loader = ModuleLoader::default()
        .with_module("crypto", llrt_crypto::CryptoModule)
        .with_module("node:crypto", llrt_crypto::CryptoModule)
        .with_module("buffer", llrt_buffer::BufferModule)
        .with_module("node:buffer", llrt_buffer::BufferModule)
        .with_module("url", llrt_url::UrlModule)
        .with_module("node:url", llrt_url::UrlModule)
        .with_module("util", llrt_util::UtilModule)
        .with_module("node:util", llrt_util::UtilModule);
    // 不安装文件解析器、原生动态模块加载器或通用 fetch，网络必须经过宿主策略。
    js.set_loader(resolver, loader).await;
    let context = AsyncContext::full(&js).await.map_err(|_| failure())?;
    let driver = tokio::task::spawn_local(js.drive());
    let evaluate = context.async_with(async move |ctx| -> rquickjs::Result<String> {
        llrt_buffer::init(&ctx)?;
        llrt_url::init(&ctx)?;
        llrt_util::init(&ctx)?;
        llrt_crypto::init(&ctx)?;
        llrt_exceptions::init(&ctx)?;
        if let Some(session) = session {
            let bridge = Function::new(
                ctx.clone(),
                Async(move |input: String| {
                    let session = session.clone();
                    async move {
                        let output = match serde_json::from_str(&input) {
                            Ok(input) => match session.dispatch(input).await {
                                Ok(data) => json!({"ok": true, "data": data}),
                                Err(error) => json!({"ok": false, "code": error.code}),
                            },
                            Err(_) => json!({"ok": false, "code": ParseErrorCode::SourceError}),
                        };
                        Ok::<String, rquickjs::Error>(output.to_string())
                    }
                }),
            )?;
            ctx.globals().set("__cliprootBridge", bridge)?;
            ctx.eval::<(), _>(BRIDGE)?;
        }
        let module = Module::declare(ctx.clone(), "source", source)?;
        let (module, ready) = module.eval()?;
        ready.into_future::<()>().await?;
        let function: Function = module.get(method)?;
        let value: Value = if let Some(argument) = argument {
            let input = ctx.json_parse(argument.to_string())?;
            function.call((input,))?
        } else {
            function.call(())?
        };
        let value = if let Some(promise) = value.as_promise() {
            promise.clone().into_future::<Value>().await?
        } else {
            value
        };
        ctx.json_stringify(value)?
            .ok_or(rquickjs::Error::Unknown)?
            .to_string()
    });
    let result = tokio::select! {
        _ = task.stopped() => Err(ParseError::new(task.reason().unwrap_or(ParseErrorCode::Timeout))),
        result = evaluate => result.map_err(|_| task.reason().map(ParseError::new).unwrap_or_else(failure)),
    };
    driver.abort();
    let _ = driver.await;
    // LocalSet 的所有后台任务和 JS 值均在同一线程释放。
    drop(context);
    drop(js);
    let text = result?;
    serde_json::from_str(&text).map_err(|_| failure())
}

fn failure() -> ParseError {
    ParseError::new(ParseErrorCode::SourceError)
}
