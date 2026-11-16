// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'dart:convert';

import 'package:flutter/widgets.dart';

import 'verification.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final status = ValueNotifier('Cliproot 离线验证：进行中');
  runApp(
    ValueListenableBuilder(
      valueListenable: status,
      builder: (_, message, _) => ValidationView(message: message),
    ),
  );
  try {
    final report = await verifyCliprootNative();
    status.value =
        'PASS\n${report.platform}\n${report.ruleCount} 个规则\n'
        '加载、正文、JSON、取消、超时、关闭、重开均通过';
    debugPrint('CLIPROOT_VALIDATION PASS ${jsonEncode(report.toJson())}');
  } catch (error, stack) {
    status.value = 'FAIL\n$error';
    debugPrint('CLIPROOT_VALIDATION FAIL $error\n$stack');
  }
}

/// The minimal status surface for the standalone validation application.
class ValidationView extends StatelessWidget {
  const ValidationView({required this.message, super.key});
  final String message;

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.ltr,
    child: ColoredBox(
      color: const Color(0xffffffff),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            message,
            key: const ValueKey('verification-status'),
            textAlign: TextAlign.center,
            style: const TextStyle(color: Color(0xff171717), fontSize: 18),
          ),
        ),
      ),
    ),
  );
}
