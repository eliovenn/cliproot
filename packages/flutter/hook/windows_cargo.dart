// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'dart:convert';

import 'package:path/path.dart' as path;

// native_toolchain_rust 1.1.1 passes Cargo dependencies to path.toUri, which
// treats Windows verbatim paths as UNC paths with an invalid "?" hostname.
// Remap the complete volume root, not just "\\?\": rustc matches path
// components, and the latter is not a prefix of a verbatim drive root.
({List<String> arguments, Map<String, String> environment})
windowsCargoPathConfiguration(
  Uri packageRoot,
  Map<String, String> inheritedEnvironment,
) {
  final root = path.windows.rootPrefix(path.windows.fromUri(packageRoot));
  if (packageRoot.scheme != 'file' ||
      (packageRoot.host.isEmpty && (root.length != 3 || root[1] != ':'))) {
    throw ArgumentError.value(
      packageRoot,
      'packageRoot',
      'Expected a Windows file URI.',
    );
  }
  final verbatimRoot = packageRoot.host.isNotEmpty
      ? r'\\?\UNC\' + root.substring(2)
      : r'\\?\' + root;
  final flag = '--remap-path-prefix=$verbatimRoot=$root';
  final encoded = inheritedEnvironment['CARGO_ENCODED_RUSTFLAGS'];
  final rustflags = inheritedEnvironment['RUSTFLAGS'];
  if (encoded != null || rustflags != null) {
    final flags = encoded != null
        ? encoded.split('\u001f')
        : rustflags!.split(RegExp(r'\s+'));
    return (
      arguments: const [],
      environment: {
        'CARGO_ENCODED_RUSTFLAGS': [
          ...flags.where((value) => value.isNotEmpty),
          flag,
        ].join('\u001f'),
      },
    );
  }
  // Cargo merges this array with existing build.rustflags. Explicit target
  // rustflags still take precedence; their owner must include the remap flag.
  return (
    arguments: [
      '--config',
      'build.rustflags=${jsonEncode([flag])}',
    ],
    environment: const {},
  );
}
