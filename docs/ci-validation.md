# GitHub Actions 跨平台验证

工作流：`.github/workflows/validate.yml`。在 `main` 推送、Pull Request 和手动 dispatch
时执行；使用只读 contents 权限，不需要发布 token、站点 Cookie 或 Apple 签名证书。
仓库已配置 GitHub remote；以实际运行记录为准，不把工作流存在视为所有平台已通过。

手动运行支持 `platform: all`／`windows`。选择 `windows` 时只分配 Windows runner，
quality、其他桌面端、Android 和 iOS 任务跳过，不启动它们的构建或测试。
推送 `main` 和 Pull Request 仍默认全平台；Windows 专属修复先推送调试分支，再针对
该分支手动运行 `windows`，避免为一次单端调试触发全平台任务。

## 矩阵

| 任务 | 原生构建 | 运行验证 |
| --- | --- | --- |
| Ubuntu 24.04 x64 | Linux debug | Xvfb 中运行最终应用的集成验证 |
| Windows 2025 x64 | Windows debug | 原生桌面集成验证 |
| macOS 15 Intel | macOS x64 debug | 原生桌面集成验证 |
| macOS 15 Apple Silicon | macOS arm64 debug | 原生桌面集成验证 |
| Android API 28 | armv7、arm64、x86_64 split APK | x86_64 模拟器集成验证 |
| Android API 35 | x86_64 集成应用 | x86_64 模拟器集成验证 |
| iOS Apple Silicon | arm64/x64 通用模拟器应用，不使用签名秘密 | 自动选择已安装 iPhone 模拟器并在 arm64 上验证 |

额外的 quality 任务做 Rust format／Clippy、资源 SHA-256、Flutter 静态分析与主机原生
验证。没有源码网站网络用例。Windows arm64、Linux arm64、Android armv7／arm64 真机和
iOS 真机不在这轮 hosted CI 的运行覆盖内；iOS x64 模拟器仅构建，不运行验证。
模拟器结果不替代真机结果。

## 同一验证流程

所有平台使用 `examples/flutter/lib/verification.dart`：25 个规则、固定正文提取、
JSON v1、取消、超时、关闭和重开。真正安装／启动平台应用后才执行这些检查，
“构建成功但运行失败”会使任务失败，不用 `continue-on-error` 掩盖失败。

CI 先通过 `tools/ci/prepare_sdk.py` 打包源码 SDK，再用 override 让验证应用引用该包。
这可以发现发行包漏掉生成绑定、内置资源或本地 crate 的问题，而非仅验证源码仓库布局。

## 工具链与依赖

- 固定 Flutter 3.50.0、Rust 1.99.1、Python 3.12、Node 24；Node 仅用于已有 SDK 打包工具。
- Android 使用 JDK 21、SDK 36、NDK 28.2.13676358、主机 libclang 和 KVM。
  `setup-android` 安装固定版本 command-line tools 并将 `sdkmanager`／`adb` 加入 PATH，
  不依赖 hosted runner 的默认 PATH。
- iOS 也没有附带 rquickjs C 绑定，故按目标启用 bindgen。SDK hook 使用 `xcrun`
  查询所选设备／模拟器 SDK 的 sysroot，编译仍交给公开的 Native Assets builder。
- Windows 使用 runner 自带 Visual Studio，Apple 平台使用其 Xcode 环境。
- 根目录 `RUSTUP_TOOLCHAIN` 与任务所需 targets 避免为生成／测试一个端安装全部交叉目标。
  iOS 通用模拟器构建安装 `aarch64-apple-ios-sim` 和 `x86_64-apple-ios` 两个目标；
  即使运行宿主为 arm64，也不能省略通用构建的 x64 标准库。
- 外部 Actions 固定到核对过的 commit SHA；变更版本时同时核对输入、runner 支持和文档。

Apple、Windows 的新配置必须以 GitHub 实际运行结果为准；在 Linux 上静态检查 YAML
不能证明这些端已经能运行。

## 本地收尾验证

工作流已通过 actionlint 1.7.12 检查，两个 Flutter 包静态分析与 Rust Clippy 均通过。
使用打包后的独立 SDK 完成了 Linux 主机原生测试、普通应用构建和 `flutter drive`
集成运行。driver 已保存 JSON 报告，确认规则、正文、JSON v1、取消、超时、关闭和重开
检查全部通过。运行结束后恢复示例的源码开发依赖，不把临时绝对路径写入 Git 锁文件。

这些是本地 Linux 结果，不是其他矩阵任务的成功结果。

## 首次远端运行与修复

2026-11-16 的 [运行 #1](https://github.com/eliovenn/cliproot/actions/runs/43891553311)
中，quality、Linux x64、macOS x64／arm64 通过；其余任务失败：

- Android API 28／35：SDK／NDK 安装步骤报 `sdkmanager: command not found`，
  未进入 APK 构建或模拟器验证。本次补上 SDK command-line tools 初始化。
- iOS：构建日志只显示 `cfg-if`／`libc` 编译失败；工作流也缺少通用模拟器构建所需的
  x64 Rust 目标，本次补齐并启用详细日志，具体结果仍需重跑确认。
- Windows x64：日志仅显示 Native Assets 构建失败，尚不能确认底层原因。
  本次启用 Flutter 详细日志并归档 hook 的 stdout／stderr，待重跑后定位，不宣称已修复。

2026-11-17 的 [运行 #2](https://github.com/eliovenn/cliproot/actions/runs/43997842124)
中，quality、Android API 28／35、iOS、Linux 和两个 macOS 任务均已通过；只剩 Windows。
完整 hook 日志确认 Rust 编译成功，失败发生在 `native_toolchain_rust` 1.1.1 的
`DependencyDiscoverer.discover`：`path.toUri` 将 `\\?\` 长路径前缀误当作 UNC 主机名，
随后抛出 `FormatException: Invalid character`。

Windows 首次定向 [运行 #3](https://github.com/eliovenn/cliproot/actions/runs/44009474953)
证明 compiler 的路径重映射不足以消除 Cargo dep-info 中的 verbatim 路径，未进入应用构建。
Windows hook 改为使用 Cargo 公开的 `build.dep-info-basedir` 配置，先将 workspace 的
verbatim 依赖路径写成相对路径，再通过 Hooks 的公开输出 API 解析回绝对 URI。
仍使用原 FRB builder，保留资产及依赖追踪，不改第三方缓存、不忽略异常、不修改 rustflags，
也不改变其他平台的 Cargo 参数。
Windows 任务增加路径配置回归检查，以及一个无外部依赖、完全离线的小型 Cargo
dep-info 复现；纯 Dart 入口先执行这些检查，不提前启动 SDK 的 build hook。
然后构建和运行原来的验证应用。

[运行 #5](https://github.com/eliovenn/cliproot/actions/runs/44024954072) 已通过 Windows
路径回归（含真实 Cargo dep-info 复现），原生库和正常应用均编译成功。
任务随后在 Python 日志转发处因 CP1252 无法编码 Flutter 的 `√` 标志而失败，尚未运行应用。
Windows 任务补上 `PYTHONIOENCODING=utf-8`，继续定向验证；不改变其他任务的 Python 环境。

## 产物与日志

正常应用先构建并归档，再构建测试入口。桌面／模拟器应用用 tar.gz 保存可执行权限和
symlink，Android split APK 也归档。各任务上传自己的 `validation-results/`，包括真实
命令日志、集成 driver 的 JSON 报告和正常构建产物；默认保留 7 天，矩阵名称互不冲突。
平台构建／集成命令启用 `--verbose`。平台 Artifacts 另外只收集
`.dart_tool/hooks_runner/` 中的 `stdout.txt`／`stderr.txt`，不上传整个隐藏缓存目录。
下载后普通日志和产物位于 `validation-results/`，底层日志位于
`.dart_tool/hooks_runner/`；即使构建失败也会上传，便于查看真正的 Cargo／编译器错误。
Windows 另收集 SDK hook 日志与 `cliproot_frb.d`，因此其归档保留
`examples/flutter/`、`packages/flutter/` 与 `target/native/` 的仓库相对目录。
这是 Actions Artifacts，不会提交二进制到 Git，也不会自动发布 Release 或 pub 包。

## 启用

1. 用户在 GitHub 创建并配置仓库 remote。
2. 提交源码、生成资源、平台验证工程和 workflow，并推到 `main`。
3. 在 Actions 页查看各矩阵任务和 Artifacts；也可通过 `workflow_dispatch` 手动运行。
   Windows 单端调试选择目标分支及 `platform: windows`；需要完整验证时选择 `all`。
4. 首次失败时按日志修复对应端，全部目标通过后再声明 CI 覆盖范围。

本代理不会因为配置 CI 自动创建远程仓库、提交、推送或放入任何凭据。
