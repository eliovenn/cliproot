// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'dart:convert';
import 'dart:io';

import 'package:code_assets/code_assets.dart';
import 'package:flutter_rust_bridge_hooks/flutter_rust_bridge_hooks.dart';

void main(List<String> args) async {
  await build(args, (input, output) async {
    if (!input.config.buildCodeAssets) return;
    final bundled = File.fromUri(
      input.packageRoot.resolve('rust/crates/cliproot-frb/Cargo.toml'),
    );
    final cratePath = await bundled.exists()
        ? 'rust/crates/cliproot-frb'
        : '../../crates/cliproot-frb';
    final cargoEnvironment = <String, String>{};
    if (input.config.code.targetOS == OS.iOS) {
      // Only query the SDK location; compilation remains owned by the public
      // Rust Native Assets builder. iOS has no bundled rquickjs C bindings.
      final sdk = input.config.code.iOS.targetSdk.toString();
      final result = await Process.run('xcrun', [
        '--sdk',
        sdk,
        '--show-sdk-path',
      ]);
      if (result.exitCode != 0) {
        throw StateError('Xcode SDK $sdk could not be resolved.');
      }
      final sdkRoot = (result.stdout as String).trim();
      if (sdkRoot.isEmpty) {
        throw StateError('Xcode returned an empty SDK path.');
      }
      final existingArgs =
          Platform.environment['BINDGEN_EXTRA_CLANG_ARGS'] ?? '';
      cargoEnvironment['SDKROOT'] = sdkRoot;
      cargoEnvironment['BINDGEN_EXTRA_CLANG_ARGS'] =
          '$existingArgs -isysroot ${jsonEncode(sdkRoot)}'.trim();
    }
    await FlutterRustBridgeNativeAssetsBuilder(
      cratePath: cratePath,
      assetName: 'src/native/native_library.g.dart',
      extraCargoBuildArgs: const ['--locked'],
      extraCargoEnvironmentVariables: cargoEnvironment,
    ).run(input: input, output: output);
  });
}
