# Flutter 原生加载与 Folinel 接入

## 加载方式

FRB 2.13 的默认加载器按传统动态库名称和开发目录查找；Native Assets 则由构建系统提供
资产映射。曾在最小加载验证中复现 `libcliproot_frb.so: No such file or directory`，
因此不能仅新增 build hook 后仍沿用默认猜测路径。

现在的调用链为：

```text
ParseHub.initialize
  → FFIgen 生成的 @Native 路径入口
  → Dart Native Assets 解析当前资产
  → Rust 通过系统镜像 API 查询实际路径
  → FRB 打开该镜像并核对内容 hash
```

C 声明在 `packages/flutter/src/native_library.h`，Rust 实现在绑定 crate，Dart 调用及
recorded-use 映射由 FFIgen 23 生成。指针指向镜像生命周期内的只读 UTF-8 字符串，不由
调用方释放；不使用进程级 FRB 符号查找，不要求设置开发库目录。

## Folinel

- `pubspec.yaml` 使用 `../../cliproot/packages/flutter`，不再依赖 FJS、Dio 或旧解析包。
- 保留 `ContentParser` 与 Riverpod 生命周期，首次解析才打开原生解析器。
- 路径参数改为字符串，但仍使用原 `parsehub/` 规则缓存目录。
- 链接、分享文本、BV 号直接交给 Rust，不在 Flutter 中维护另一份 URL 提取实现。
- 列表、阅读、封面、备份继续使用兼容的 Dart 模型和 JSON v1，不改写用户数据。
- 原 `packages/parsehub_dart/` 连同用户改动保留为历史副本，排除在根目录分析之外。

## 验证边界

实际加载验证使用独立、临时 Flutter 宿主，不传开发路径，读取全部 25 个内置规则，
并执行一次被公共网络策略拒绝的私网请求，以覆盖 Rust→JS→宿主桥接和资源释放。
不访问真实站点，不跑 UI 导航或全量业务测试；验证解决加载问题后停止扩展测试。

Linux x64 加载验证已通过，Folinel 的 `flutter build linux --debug` 也已成功。
构建产物为 `build/linux/x64/debug/bundle/folinel`；`lib/libcliproot_frb.so` 与
`NativeAssetsManifest.json` 中的 SDK 资产映射一致，路径入口和 FRB 导出符号均存在，
产物中没有 `libfjs.so`。未启动应用 GUI、播放媒体或访问真实社交站点。

源码发行包的 Cargo workspace 与本地依赖路径已检查，均位于发行包内部。
Android arm64 也已在 Linux 主机完成 Folinel debug APK 构建，并在 MI 8／Android 9 上
用独立临时宿主验证自动加载、正文提取与取消；没有覆盖 Folinel 数据。详见 Android 构建文档。
其他 Android ABI、Apple／Windows 未验证，不以构建声明代替真实验证。源码发行包
需要包含生成绑定、C 声明、核心、内置规则和固定工具链，不能依赖消费者的开发目录。
