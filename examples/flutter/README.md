# Cliproot Flutter 验证应用

独立的原生 SDK 验证宿主，不包含 Folinel 的内容库、账号和阅读 UI，也不访问真实站点。
Android、iOS、Linux、macOS、Windows 共用 `lib/verification.dart` 的同一条验证流程。

## 检查内容

- Native Assets 自动定位原生库，不设置开发镜像路径。
- 加载 25 个内置规则，解析当前进程创建的 loopback HTTP 固定正文。
- 校验标题、正文和结果 JSON v1 的往返转换。
- 请求开始前取消、HTTP 请求进行中取消、超时、幂等关闭及重新打开。
- 清理原生任务、HTTP 服务和临时缓存；不会读取用户 Cookie 或修改用户内容库。

`allowPrivateNetwork` 仅用于本验证宿主拥有的 loopback 服务器；生产服务不能将其交给外部
用户控制。Android cleartext 与 Apple 本地网络／沙盒权限也只属于这个验证工程。

## 本地运行

在本目录执行：

```sh
flutter pub get
flutter run -d linux
```

也可选择 `windows`、`macos` 或 Android／iOS 的明确设备 ID。通过时显示 `PASS` 并打印
`CLIPROOT_VALIDATION PASS`，失败时显示错误，不以启动应用成功代替原生验证成功。

只检查主机原生链路、不启动桌面窗口：

```sh
flutter test test/native_loading_test.dart --reporter expanded
```

运行最终平台应用内的集成验证：

```sh
flutter drive --driver test_driver/integration_test.dart \
  --target integration_test/native_loading_test.dart -d linux
```

`integration_test` 自己注册测试扩展，不在普通程序入口注入旧的 flutter_driver 扩展。
driver 将结果写到 `validation-results/report.json`；Linux CI 使用 Xvfb，其他平台使用其
原生 runner。设备验证使用独立 applicationId，不覆盖 Folinel。

## 自包含 SDK 验证

从仓库根目录运行 `python3 tools/ci/prepare_sdk.py`，再在本目录执行 `flutter pub get`。
该工具先生成完整源码 SDK，再写入临时 `pubspec_overrides.yaml`，因此后续构建不依赖
原 SDK 的 monorepo 相对 crate 路径。它不会覆盖手写的 override 文件。

恢复源码开发引用时删除该工具生成的 override 并重新 `flutter pub get`。
override、构建目录和验证报告不提交到 Git；平台工程来自 Flutter 3.50 模板。
