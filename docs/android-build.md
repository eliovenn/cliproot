# Linux 主机构建 Android

Flutter 在 Linux 上构建 Android 时，Native Assets 传给 SDK 的目标是 Android ABI，
不是 Linux 主机 ABI。hook 负责以 Android NDK 编译 Rust/QuickJS 并将 `.so` 打包进 APK。
不要求用户手动复制原生库或指定开发库路径。

## 构建环境

- Flutter／Dart、JDK、Android SDK 与 NDK。
- 固定的 Rust `1.99.1` 工具链及对应 Android 标准库目标。
- 主机 libclang，用于 rquickjs 的 Android C 绑定生成；不需要手写这些绑定。
- Android 设备调试需 ADB、设备授权及满足应用 minSdk。

本机环境是 Debian Linux、Flutter 3.50.0、Dart 3.14.0、JDK 21、Android SDK 36、
NDK 28.2.13676358。连接的设备为 MI 8／Android 9（API 28）、arm64。

## 验证中发现的修复

首次普通 APK 构建发现 rquickjs 没有附带 `aarch64-linux-android` 绑定。
SDK 现在只在 Android 目标上启用 rquickjs 的 `bindgen`，复用 Native Assets 提供的
NDK sysroot 与目标参数，其他平台继续使用其已有绑定。

原 `full-async` 还启用了 SDK 不需要的 `dyn-load`，其 dlopen2 传递依赖在 Android 上
缺少 once_cell 声明。现在显式保留其余功能、移除动态原生模块加载，不修改 pub／Cargo 缓存
或手写第三方底层。SDK 本来也只允许内置模块，这也收窄了依赖与能力范围。

## 验证命令与范围

在 Folinel 项目运行普通构建命令：

```sh
flutter build apk --debug --target-platform android-arm64
```

手机运行验证使用独立临时应用，不覆盖 Folinel。验证包含自动加载 25 个规则、
从应用内静态 HTTP 服务提取正文、取消与关闭；不访问真实社交网站、不修改用户内容库。
Folinel arm64 debug 构建已通过，产物为
`build/app/outputs/flutter-apk/app-debug.apk`。已检查其中的
`lib/arm64-v8a/libcliproot_frb.so` 为 AArch64 ELF，包含路径入口及 FRB 导出；
Native Assets 映射存在，APK 不包含 FJS 库。
MI 8／Android 9（API 28）上的独立应用验证也已通过，日志确认：

```text
CLIPROOT_ANDROID_PROBE PASS rules=25 extraction=ok cancellation=ok cleanup=ok
```

成功包含 Native Assets 自动加载、完整 Rust→JS→HTTP→结果返回链路、正文内容检查、
取消及资源关闭。临时应用使用独立 applicationId，未安装或替换手机上的 Folinel，
验证后已移除；本次不等于 Folinel 全部界面功能或真实站点通过验证。
其他 ABI 和平台不以 arm64 结果代替验证。

构建仍有 AGP／Kotlin 即将停止支持旧版本的提醒，但没有阻塞当前构建；此轮不为了
验证解析 SDK 而扩大升级应用构建工具或其他插件。
