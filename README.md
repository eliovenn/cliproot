# Cliproot

跨平台网页与社交内容解析引擎：**Rust 宿主 + 共享 JavaScript 规则 + 各语言绑定**。

项目从 Folinel 当前使用的 `parsehub_dart` 提取解析能力。Rust 核心管理 HTTP、Cookie、
规则缓存、调度、超时和取消；站点提取、签名、HTML 清洗继续复用现有 25 个 JS 源。
不把应用数据库、账号界面、阅读器和媒体播放器放入 SDK。

## 当前阶段

已实现原生 Rust 核心、Flutter 绑定及 Native Assets 自动加载适配；Folinel 通过本地路径
接入此 SDK，原解析包作为历史副本保留。只推进 Flutter 集成，其他语言绑定暂缓。
Linux x64 已通过原生库自动加载及受限桥接验证，Folinel Linux debug 构建成功；
Android arm64 已在 Linux 上构建 Folinel debug APK，并在 MI 8／Android 9 验证原生加载与正文提取。
其他 Android ABI 和平台列入构建声明，但未在本机验证。
没有访问真实社交站点，也不把加载验证描述为全站解析成功保证。

## 目录

```text
crates/cliproot-core/    与调用语言无关的 Rust 核心
crates/cliproot-frb/     Flutter Rust Bridge 适配
packages/flutter/       Flutter SDK、生成绑定和 Native Assets hook
rules/                  JavaScript 规则源码、锁文件和构建工具
resources/bootstrap/    已生成的内置规则、manifest 和第三方许可
fixtures/               从现有解析包迁入的匿名 HTTP／HTML 样本
docs/                   架构、API、规则协议、安全和发布说明
tools/                  绑定生成及 SDK 打包工具
examples/flutter/       各 Flutter 原生端共用的离线验证应用
.github/workflows/      GitHub Actions 构建与运行矩阵
```

## 开发

Rust 工具链固定为 `1.99.1`；JS 构建使用 Node 22+，npm 版本和依赖以锁文件为准。
Flutter SDK 需要 Dart 3.10+、Flutter 3.38+；当前 Folinel 使用的 SDK 更高。

```sh
cargo fmt --all
cargo check --workspace
node tools/generate-frb.mjs
```

修改 JS 规则后，在 `rules/` 中执行：

```sh
npm ci
npm run build
```

Rust 编译时嵌入 `resources/bootstrap/`，普通 SDK 消费者不需要 Node，也不需要启动时
下载规则。修改生成输入后必须重新生成，不能直接改 bundle 或绑定。
Flutter 独立源码包通过 `node tools/package-flutter.mjs` 准备，详见 SDK README。
原生路径入口的 FFIgen 生成命令在 `packages/flutter/` 下执行 `dart run tool/ffigen.dart`。
加载与宿主接入说明见 [Flutter 集成](docs/flutter-integration.md)。
跨平台 CI 的目标、运行检查与 Artifacts 见 [CI 验证](docs/ci-validation.md)。
GitHub Actions 已有实际运行记录；Windows x64 专项验证已通过，状态与修复记录见 CI 验证文档。

## 使用边界

- 原生端不需要 WebView 即可处理能通过 HTTP／接口获取的内容，但不保证所有链接成功。
- 每个任务独立持有 Cookie 和 JS runtime；SDK 不自动获得用户浏览器或社交 App 的登录态。
- 默认仅访问公共网络，服务端不可允许外部用户切换到 `allowPrivate`。
- 返回正文与媒体链接，不永久下载媒体，不执行整页网页脚本，不提供浏览器自动化。
- 当前不是安全执行任意用户 JS 的公共平台；仅加载可信规则，CDN 地址由宿主配置。
- 浏览器 Wasm 的 HTTP、存储、CORS 和凭据边界需要单独适配。

详细说明见 [架构](docs/architecture.md)、[API](docs/api.md)、
[规则协议](docs/rule-protocol.md)、[安全](docs/security.md) 和 [发布](docs/releasing.md)。

## 开源与来源

Cliproot 新增代码采用 MIT；原有 JS 和第三方组件保留各自许可及来源。
见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与内置资源中的完整许可汇总。
已有来源中的授权疑点需要在公开发布前核实，不将来源记录视为已经完成授权审查。
