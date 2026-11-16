// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'package:cliproot_validation/verification.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('native code asset and offline parser lifecycle', () async {
    final report = await verifyCliprootNative();
    expect(report.ruleCount, 25);
    expect(report.release, isNotEmpty);
    expect(report.title, 'Cliproot cross-platform validation');
  }, timeout: const Timeout(Duration(minutes: 2)));
}
