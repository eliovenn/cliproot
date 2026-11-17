// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as path;
import 'package:test/test.dart';

import '../../hook/windows_cargo.dart';

void main() {
  final packageRoot = Uri.file(r'D:\a\cliproot\sdk\', windows: true);
  const flag = r'--remap-path-prefix=\\?\D:\=D:\';

  group('Windows Cargo path configuration', () {
    test('reproduces the upstream verbatim path conversion failure', () {
      expect(
        () => path.windows.toUri(r'\\?\D:\a\cliproot\resources\manifest.json'),
        throwsFormatException,
      );
    });

    test('remaps the complete drive root without changing physical paths', () {
      final configuration = windowsCargoPathConfiguration(packageRoot, {});
      expect(configuration.arguments, [
        '--config',
        'build.rustflags=${jsonEncode([flag])}',
      ]);
      expect(configuration.environment, isEmpty);
    });

    test('supports UNC volume roots and spaces through Cargo configuration', () {
      final root = Uri.file(r'\\server\shared files\sdk\', windows: true);
      final configuration = windowsCargoPathConfiguration(root, {});
      expect(configuration.arguments, [
        '--config',
        'build.rustflags=${jsonEncode([r'--remap-path-prefix=\\?\UNC\server\shared files=\\server\shared files'])}',
      ]);
    });

    test('preserves encoded rustflags and their precedence', () {
      final inherited = {
        'CARGO_ENCODED_RUSTFLAGS':
            '-C\u001flink-arg=C:\\shared files\\library.lib',
        'RUSTFLAGS': '--cfg ignored_by_cargo',
      };
      final configuration = windowsCargoPathConfiguration(
        packageRoot,
        inherited,
      );
      expect(configuration.arguments, isEmpty);
      expect(
        configuration.environment['CARGO_ENCODED_RUSTFLAGS'],
        '-C\u001flink-arg=C:\\shared files\\library.lib\u001f$flag',
      );
      expect(inherited['RUSTFLAGS'], '--cfg ignored_by_cargo');
    });

    test('preserves whitespace-separated rustflags', () {
      final configuration = windowsCargoPathConfiguration(packageRoot, {
        'RUSTFLAGS': '  --cfg custom_build\t-C debuginfo=1 ',
      });
      expect(configuration.arguments, isEmpty);
      expect(
        configuration.environment['CARGO_ENCODED_RUSTFLAGS'],
        '--cfg\u001fcustom_build\u001f-C\u001fdebuginfo=1\u001f$flag',
      );
    });

    test('accepts intentionally empty encoded rustflags', () {
      final configuration = windowsCargoPathConfiguration(packageRoot, {
        'CARGO_ENCODED_RUSTFLAGS': '',
        'RUSTFLAGS': '--cfg ignored_by_cargo',
      });
      expect(configuration.environment['CARGO_ENCODED_RUSTFLAGS'], flag);
    });

    test('rejects paths without a Windows volume root', () {
      expect(
        () => windowsCargoPathConfiguration(
          Uri.file('/tmp/sdk', windows: false),
          {},
        ),
        throwsArgumentError,
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
    final configuration = windowsCargoPathConfiguration(package.uri, {});
    final remapped = await build(
      'remapped',
      configuration.arguments,
      configuration.environment,
    );
    expect(remapped, isNot(contains(r'\\?\')));
    expect(remapped, contains(resource.path.replaceAll(' ', r'\ ')));
  }, skip: !Platform.isWindows);
}
