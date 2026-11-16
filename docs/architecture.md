# 目录与依赖方向

核心只有一个 `cliproot-core` crate，不依赖任何调用语言或绑定框架。

```text
Flutter SDK → cliproot-frb ─────────┐
Kotlin/Swift → cliproot-uniffi（后续）├→ cliproot-core → rquickjs / LLRT
Node SDK → cliproot-node（后续）─────┘                   ↓
                                                   共享 JS 规则
```

## 核心

- `parser.rs`：会话、规则选择、任务所有者及解析结果验证。
- `tasks.rs`：取消、截止时间和实际释放完成通知。
- `network/`：复用 reqwest／Cookie Jar，只实现宿主协议适配和 egress 业务策略。
- `runtime/`：复用 rquickjs 和所需 LLRT 模块；不开放文件、进程或任意动态模块。
- `rules/`：内置资源、SHA-256、快照、更新与活动 manifest 提交。
  文件提交复用 atomic-write-file，缓存读取有体积上限；每个候选规则单独限时验证。
- `config.rs`、`models.rs`、`error.rs`：共享契约，Serde 负责 JSON 序列化。

每个解析任务有独立 JS runtime 和 Cookie Jar。QuickJS 创建、执行及释放都在
共享 Tokio blocking pool 的同一线程完成，不把 JS 值跨线程或跨语言传递。
该池最多同时执行 8 个 JS 任务，worker 栈为 8 MiB，给 QuickJS 的 2 MiB 栈限制保留宿主空间。
首次返回任务句柄后再等待结果，解决取消操作早于任务注册的时序问题。
调用方放弃等待不会让 `close()` 提前宣称资源已释放；关闭会等待任务所有者完成。

## 规则

站点逻辑保留在 `rules/src/`，JS 构建结果进入 `resources/bootstrap/` 并嵌入 Rust。
解析包中的 HTML 清洗更新按迁移时工作区现状保留，原项目文件不删除。

第一阶段保留 `globalThis.fjs.bridge_call` 这一源 ABI 名称，实际回调完全在 Rust 内
处理；这个名字不代表依赖 Flutter FJS 插件。后续改名必须考虑已有 CDN 规则兼容性。
当前 25 个规则没有使用全局 timers；不为未使用能力安装 LLRT 全局定时器。
Rust 功能也不启用 `dyn-load`，避免无用的原生动态加载依赖；Android 单独启用
rquickjs 的 `bindgen`，通过 NDK 生成其尚未附带的 C 绑定；iOS 也按目标启用 bindgen，
hook 查询所选 Xcode SDK 的 sysroot，避免使用主机 macOS 头文件生成设备绑定。

## 绑定与 SDK

Rust 绑定 crate 只做 API／类型转换，不复制 HTTP、Cookie 或站点逻辑。
Flutter 第一阶段保留原有结果 JSON v1 和 Dart 展示模型，避免影响 Folinel 的持久化数据；
原生入口由 FRB 生成，不手写 FFI。新增模型以 Rust／版本化 JSON 契约为准。

Native Assets 的资产名称不等于传统动态库搜索名。SDK 使用自身 C ABI 的单个路径入口：
FFIgen 生成 `@Native` 调用及 recorded-use 映射，Dart 先解析已打包资产，Rust 使用系统
镜像查询 API 返回其实际路径，再交给 FRB。此适配仅位于 `cliproot-frb`／Flutter 包；
不把操作系统加载或绑定框架耦合到解析核心，也不在 Dart 手写 Native 函数。

开发工作区可以引用相邻 crate；发行包必须包含所需源码或经验证的预编译库，不能依赖
消费者机器上的仓库相对路径。Node、UniFFI 和 Web 目录在对应能力实现时再加入。

## 验证

`examples/flutter` 是独立的验证宿主，所有端共用 loopback HTML 与同一验证函数。
CI 引用自包含源码 SDK，区分构建、运行和真机覆盖，结果与产物通过 Actions 保存。
不会将一个端的成功描述为其他端成功，或将声明的矩阵描述为已经执行。
