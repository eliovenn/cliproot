# cliproot_flutter

Cliproot Rust 核心的 Flutter SDK。保留原 ParseResult／配置 JSON v1，HTTP、Cookie、
规则执行和取消不再依赖 Dart 的 Dio 或 Flutter FJS 插件。

## 当前状态

Native Assets hook 使用官方 FRB hooks 构建原生库。FFIgen 生成的入口先让 Dart 解析实际
代码资产，再定位该已加载镜像的路径交给 FRB；不猜测库名、工作目录或 Cargo 输出目录。
Linux x64 已完成自动加载与受限桥接验证，Folinel 已接入 SDK 并通过 Linux debug 构建。
Android arm64 已在 Linux 上构建 Folinel APK，并在 MI 8／Android 9 验证自动加载、
正文提取、取消与清理。其他 ABI 和原生平台仍需验证，不将这些结果描述为全部平台已经可运行。

普通使用不传 `nativeLibraryPath`；该参数仅供显式加载开发镜像。

```dart
import 'package:cliproot_flutter/cliproot_flutter.dart';

final hub = await ParseHub.open(
  cachePath: applicationCachePath,
  concurrency: 1,
);
try {
  final result = await hub.parse(input, cancellation: cancellation);
  // 在宿主保存或展示 result。
} finally {
  await hub.close();
}
```

`applicationCachePath` 由宿主通过 path_provider 等能力提供。SDK 不负责站点登录界面；
可选 Cookie 使用 `ParseHubConfig`，默认匿名、仅访问公共网络。

## 生成与打包

在 Cliproot 仓库根目录执行：

```sh
node tools/generate-frb.mjs
node tools/package-flutter.mjs
```

第二条命令只在新的 `dist/cliproot_flutter-*` 目录准备独立源码发行包，不覆盖原文件，
不构建、不提交或发布。发行包包含 Rust workspace、内置资源和固定工具链，不依赖
消费者机器上的 `../../crates/`。当前仍为 `publish_to: none`。

原生路径入口单独使用 FFIgen 生成，在本 SDK 目录执行：

```sh
dart run tool/ffigen.dart
```

生成工具使用 FFIgen 23 的 `Input`／`Visitor`／`Output` API，只有一个函数被包含；
输出与 recorded-use 映射均带许可头，禁止手改。Linux 开发环境需提供 libclang 与可执行的
`ldconfig`；若 PATH 不包含系统管理命令目录，需在生成命令环境中补足。

## Linux 构建 Android

用户可以在 Linux 主机执行正常的 Flutter Android 构建命令。需要 Android SDK／NDK、
JDK、固定 Rust 工具链及 Android 标准库目标；Android 目标的 rquickjs C 绑定在构建时
通过 bindgen 生成，主机还需可发现的 libclang。SDK 不要求用户手动复制 `.so`。
构建验证与手机验证范围记录在项目的 `docs/android-build.md`。

## Windows 构建兼容

`native_toolchain_rust` 1.1.1 的依赖路径转换不能处理 Windows 的 `\\?\` 前缀。
Windows hook 使用 Cargo 公开的 `build.dep-info-basedir` 配置，将 workspace 的 verbatim
依赖路径写成相对路径，然后通过 Hooks 的公开输出 API 解析回原文件的绝对 URI。
不修改任何 rustflags，仍复用 FRB builder 并保留其资产及依赖追踪；其他平台不启用
这项适配。Windows CI 已通过路径回归与原生库／应用编译；运行验证仍在推进，详见
项目的 `docs/ci-validation.md`。
