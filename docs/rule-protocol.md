# JavaScript 规则协议

保留 `parsehub_dart` 源 ABI v1。源码位于 `rules/src/platforms/`，构建器统一生成：

- `describe()` → `{id, version, apiVersion: 1}`；此阶段不能请求网络。
- `parse({url, options})` → `{ok: true, data}` 或 `{ok: false, error: {code, attempts}}`。

宿主入口仍为 `globalThis.fjs.bridge_call({action, ...payload})`，回调由 Rust 提供。

| action | 能力 |
| --- | --- |
| `http.request` | 文本 HTTP 响应、最终 URL 和过滤凭据后的响应头 |
| `cookies.get` | 当前任务、当前请求作用域内的 Cookie |
| `cookies.set` | 当前任务中的 host-only Secure Cookie |
| `random.hex` | 密码学随机字节的十六进制表示 |
| `codec.gzip` | UTF-8 → gzip → Base64 |

HTTP 请求最多 80 次，单次最多 8 跳重定向，解压后响应最多 12 MiB。
跨 origin 移除 Authorization、Referer、Origin 和 CSRF 等请求头；Cookie 逐跳重新匹配。
gzip 输入按 UTF-16 code unit 限制为 1 Mi，保持 Dart 原协议的字符计数边界。

`Buffer`、`URL`、编码和 crypto 所需能力由 rquickjs／LLRT 提供，不由 Flutter 或 Node SDK
重复实现。HTML 仍使用打包后的 linkedom、Readability 和 Turndown，不运行整页网页脚本。
YouTube 使用已记录来源的 EJS 专用执行路径。

构建在 `rules/` 下执行 `npm ci`、`npm run build`。`SOURCE_RELEASE` 可指定规则版本。
生成内置 bundle、manifest、SHA-256 和完整第三方许可；CDN 产物在 `rules/dist/`。
修改后不得直接编辑 `resources/bootstrap/*.js`。
