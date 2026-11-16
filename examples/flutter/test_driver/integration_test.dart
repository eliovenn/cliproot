// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'dart:convert';
import 'dart:io';

import 'package:integration_test/integration_test_driver.dart';

Future<void> main() => integrationDriver(
  responseDataCallback: (data) async {
    if (data == null) return;
    final directory = Directory('validation-results');
    await directory.create(recursive: true);
    await File.fromUri(directory.uri.resolve('report.json'))
        .writeAsString(const JsonEncoder.withIndent('  ').convert(data));
  },
);
