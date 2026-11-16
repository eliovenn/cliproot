// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'dart:convert';

import 'package:cliproot_validation/main.dart';
import 'package:cliproot_validation/verification.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('packaged native asset and offline parser lifecycle', (
    tester,
  ) async {
    await tester.pumpWidget(const ValidationView(message: 'RUNNING'));
    final report = await tester.runAsync(verifyCliprootNative);
    expect(report, isNotNull);
    expect(report!.ruleCount, 25);
    expect(report.release, isNotEmpty);
    binding.reportData = report.toJson();
    debugPrint('CLIPROOT_VALIDATION PASS ${jsonEncode(report.toJson())}');
    await tester.pumpWidget(const ValidationView(message: 'PASS'));
    expect(find.byKey(const ValueKey('verification-status')), findsOneWidget);
    expect(find.text('PASS'), findsOneWidget);
  }, timeout: const Timeout(Duration(minutes: 2)));
}
