// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'dart:convert';
import 'dart:io';

import 'package:code_assets/code_assets.dart';
import 'package:flutter_rust_bridge_hooks/flutter_rust_bridge_hooks.dart';
import 'package:path/path.dart' as path;
import 'package:test/test.dart';

import '../../hook/windows_cargo.dart';

void main() {
  final workspace = Uri.file(r'D:\a\cliproot\sdk\rust\', windows: true);

  group('Windows Cargo dependency configuration', () {
    test('reproduces the upstream verbatim path conversion failure', () {
      expect(
        () => path.windows.toUri(r'\\?\D:\a\cliproot\resources\manifest.json'),
        throwsFormatException,
      );
    });

    test('uses the verbatim workspace root as the dep-info base', () {
      expect(windowsCargoDependencyArguments(workspace), [
        '--config',
        'build.dep-info-basedir=${jsonEncode(r'\\?\D:\a\cliproot\sdk\rust\')}',
      ]);
    });

    test('supports UNC workspace paths and spaces', () {
      final root = Uri.file(r'\\server\shared files\sdk\', windows: true);
      expect(windowsCargoDependencyArguments(root), [
        '--config',
        'build.dep-info-basedir=${jsonEncode(r'\\?\UNC\server\shared files\sdk\')}',
      ]);
    });

    test('rejects paths without a Windows volume root', () {
      expect(
        () => windowsCargoDependencyArguments(
          Uri.file('/tmp/sdk', windows: false),
        ),
        throwsArgumentError,
      );
    });

    test('resolves relative dependencies and preserves native assets', () {
      final nativeOutput = BuildOutputBuilder();
      final absolute = workspace.resolve('crates/cliproot-frb/Cargo.toml');
      nativeOutput.dependencies.addAll([
        Uri(path: 'resources/bootstrap/manifest.json'),
        absolute,
      ]);
      nativeOutput.assets.code.add(
        CodeAsset(
          package: 'cliproot_flutter',
          name: 'src/native/native_library.g.dart',
          linkMode: DynamicLoadingBundled(),
          file: workspace.resolve('cliproot_frb.dll'),
        ),
      );
      final output = BuildOutputBuilder();
      copyWindowsCargoOutput(nativeOutput.build(), output, workspace);
      final result = output.build();
      expect(result.dependencies, [
        workspace.resolve('resources/bootstrap/manifest.json'),
        absolute,
      ]);
      expect(
        result.assets.code.single.id,
        'package:cliproot_flutter/src/native/native_library.g.dart',
      );
      expect(
        result.assets.code.single.file,
        workspace.resolve('cliproot_frb.dll'),
      );
    });
  });

  test('Cargo dep-info keeps embedded files URI-compatible on Windows', () async {
    final temporary = await Directory.systemTemp.createTemp(
      'cliproot_windows_paths_',
    );
    addTearDown(() => temporary.delete(recursive: true));
    final package = Directory(path.join(temporary.path, 'probe'));
    await Directory(path.join(package.path, 'src')).create(recursive: true);
    final resource = File(path.join(temporary.path, 'embedded.txt'));
    await resource.writeAsString('offline path fixture');
    final manifest = File(path.join(package.path, 'Cargo.toml'));
    await manifest.writeAsString('''
[package]
name = "cliproot_path_probe"
version = "0.0.0"
edition = "2024"
''');
    await File(path.join(package.path, 'src', 'lib.rs')).writeAsString(
      'pub const DATA: &[u8] = include_bytes!(r#"${r'\\?\'}${resource.absolute.path}"#);\n',
    );

    Future<String> build(
      String directory,
      List<String> extraArguments,
      Map<String, String> environment,
    ) async {
      final target = path.join(temporary.path, directory);
      final result = await Process.run(
        'cargo',
        [
          'build',
          '--offline',
          '--manifest-path',
          manifest.path,
          '--target-dir',
          target,
          ...extraArguments,
        ],
        workingDirectory: package.path,
        environment: environment,
      );
      expect(result.exitCode, 0, reason: result.stderr.toString());
      return File(
        path.join(target, 'debug', 'cliproot_path_probe.d'),
      ).readAsString();
    }

    final original = await build('original', [], {});
    expect(original, contains(r'\\?\'));
    final normalized = await build(
      'normalized',
      windowsCargoDependencyArguments(temporary.uri),
      {},
    );
    expect(normalized, isNot(contains(r'\\?\')));
    expect(normalized, contains('embedded.txt'));
  }, skip: !Platform.isWindows);
}
