# API 契约

## Rust

- `Parser::open(ParserConfig)`：打开缓存并加载可信内置／已验证规则。
- `Parser::start(input, ParseOptions)`：返回任务句柄，随后调用 `result()` 等待结果。
- `Parser::parse(input, ParseOptions)`：不需要提前取消握手时的便利入口。
- `ParseTask::cancel()`／`Parser::cancel(task_id)`：停止等待、网络请求及同步 JS 执行。
- `Parser::update_platforms(...)`：修改后续任务的站点配置，不更改进行中的任务。
- `Parser::set_source_manifest_url(...)`：修改后续更新的 CDN 地址。
- `Parser::sources()`、`source_release()`、`recovered_source_cache()`：规则状态。
- `Parser::update_rules()`：显式检查 CDN；失败返回报告，不替换当前快照。
- `Parser::close()`：关闭入口、取消任务并等待 worker 释放。

异步 Rust API 在 Tokio runtime 中使用；Flutter 绑定负责其对应运行环境。

## 参数

`ParserConfig` 的 JSON 使用 camelCase：

```json
{
  "cachePath": "/application-cache/cliproot",
  "concurrency": 1,
  "networkPolicy": "publicOnly",
  "sourceManifestUrl": null,
  "platforms": {}
}
```

站点配置沿用 `cookies` 和 `options`。Cookie 包含名称、值、域、路径、Secure、hostOnly
和可选过期时间；传入值由配置拥有者管理，不记录在日志中。任务配置包括唯一 `taskId`
和 `timeoutMs`（默认 60000）；超时包括排队时间。最多 8 个执行槽、128 个在途任务。
输入文本最多 64 KiB；解析 HTTP 请求预算为 80，CDN 更新使用独立预算。

## 结果与错误

保留原 `ParseResult` JSON schema v1，包括正文、作者、媒体、规范链接、源版本和
后备尝试记录。媒体请求头禁止包含 Cookie 和 Authorization。错误仅返回稳定 code
及 `{stage, code}` 尝试记录，不回传原始站点响应、签名输入和底层异常文本。

打开、配置和规则更新也可能失败。调用方必须等待 `close()`；释放语言层代理对象不等于
确认系统进程退出前已经完成所有清理。

Flutter SDK 保留 `ParseHub`、`ParseCancellation`、`ParseResult` 的展示契约，缓存参数
改为路径字符串；不接受 Dart `Dio` 或 `AssetBundle`。普通初始化由 Native Assets 自动定位
实际库路径，也可显式传开发镜像路径。输入规范化由 Rust 核心统一处理，Flutter 宿主不复制
`extractUrl` 的业务逻辑。平台验证范围见 Flutter 集成文档。
