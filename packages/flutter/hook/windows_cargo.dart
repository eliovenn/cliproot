// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'dart:convert';

import 'package:flutter_rust_bridge_hooks/flutter_rust_bridge_hooks.dart';
import 'package:path/path.dart' as path;

// native_toolchain_rust 1.1.1 passes Cargo dependencies to path.toUri, which
// treats Windows verbatim paths as UNC paths with an invalid "?" hostname.
// Cargo's public dep-info-basedir setting makes workspace verbatim paths
// relative before that conversion. Resolve them back after the builder runs.
// Unlike rustflags, this only changes dep-info text, not compiler input paths.
List<String> windowsCargoDependencyArguments(Uri workspaceRoot) {
  final workspace = path.windows.fromUri(workspaceRoot);
  final root = path.windows.rootPrefix(workspace);
  if (workspaceRoot.scheme != 'file' ||
      (workspaceRoot.host.isEmpty && (root.length != 3 || root[1] != ':'))) {
    throw ArgumentError.value(
      workspaceRoot,
      'workspaceRoot',
      'Expected a Windows file URI.',
    );
  }
  final verbatimWorkspace = workspaceRoot.host.isNotEmpty
      ? r'\\?\UNC\' + workspace.substring(2)
      : r'\\?\' + workspace;
  return [
    '--config',
    'build.dep-info-basedir=${jsonEncode(verbatimWorkspace)}',
  ];
}

void copyWindowsCargoOutput(
  BuildOutput nativeOutput,
  BuildOutputBuilder output,
  Uri workspaceRoot,
) {
  output.dependencies.addAll(
    nativeOutput.dependencies.map(workspaceRoot.resolveUri),
  );
  output.assets.addEncodedAssets(nativeOutput.assets.encodedAssets);
  output.assets.addEncodedAssets(
    nativeOutput.assets.encodedAssetsForBuild,
    routing: const ToBuildHooks(),
  );
  for (final entry in nativeOutput.assets.encodedAssetsForLinking.entries) {
    output.assets.addEncodedAssets(entry.value, routing: ToLinkHook(entry.key));
  }
}
