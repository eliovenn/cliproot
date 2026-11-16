// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'package:ffi/ffi.dart';
import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart'
    show ExternalLibrary;

import 'native_library.g.dart';

/// Opens the exact code asset resolved by Dart, or an explicit development image.
ExternalLibrary loadCliprootLibrary({String? nativeLibraryPath}) {
  if (nativeLibraryPath != null) {
    return ExternalLibrary.open(nativeLibraryPath);
  }
  final path = cliprootNativeLibraryPath();
  if (path.address == 0) {
    throw StateError(
      'Cliproot Native Assets image path could not be resolved.',
    );
  }
  return ExternalLibrary.open(path.cast<Utf8>().toDartString());
}
