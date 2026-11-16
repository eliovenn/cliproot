# 构建与发布

当前工程不自动提交、推送、注册 npm scope 或发布包。

1. 更新源码、依赖锁和规则来源记录。
2. 规则通过 `rules/tool/build.mjs` 生成，许可汇总随 bundle 分发。
3. FRB 绑定通过 `node tools/generate-frb.mjs` 生成；禁止手改生成输出。
   路径入口在 `packages/flutter/` 下通过 `dart run tool/ffigen.dart` 生成。
4. Flutter 发行包需包含 Rust workspace、核心源码、内置资源、锁文件和固定工具链。
5. 后续 Node 的各 OS／架构 `.node`、Kotlin 和 Swift 库分别编译和打包。
6. 发布前核实许可证、包名／scope、目标平台及独立安装流程。

第一阶段只有原生核心与 Flutter SDK。没有预编译二进制发行，不宣称消费者无需工具链。
Wasm／浏览器支持需要另行实现网络、缓存和运行环境，不通过声明 package 平台来冒充。

`node tools/package-flutter.mjs` 会准备自包含 Flutter 源码包。`tools/native-targets.json`
维护原生构建声明，覆盖 Folinel 的 Android、iOS/iPadOS、macOS、Windows、Linux 目标。
声明不等于验证通过；目前实际验证是 Linux x64。生成 FRB 时按根工具链固定宿主版本，
不为生成绑定安装所有交叉目标；真正构建仍需目标标准库和原生工具链。
自动加载通过生成的 Native 入口定位实际镜像，Folinel 已改用此 SDK。
