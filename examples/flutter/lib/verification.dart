// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'dart:async';
import 'dart:io';

import 'package:cliproot_flutter/cliproot_flutter.dart';

/// The result of the same offline native checks on every Flutter platform.
class ValidationReport {
  const ValidationReport({
    required this.platform,
    required this.ruleCount,
    required this.release,
    required this.title,
  });

  final String platform;
  final int ruleCount;
  final String release;
  final String title;

  Map<String, Object> toJson() => {
    'platform': platform,
    'rules': ruleCount,
    'release': release,
    'title': title,
    'checks': [
      'native-loading',
      'extraction',
      'json-v1',
      'cancellation',
      'timeout',
      'close',
      'reopen',
    ],
  };
}

/// Verifies native loading, extraction and lifecycle against loopback fixtures.
///
/// No remote website or user credentials are used. Private networking is only
/// enabled for the server created and owned by this validation process.
Future<ValidationReport> verifyCliprootNative() async {
  final cache = await Directory.systemTemp.createTemp('cliproot-validation-');
  HttpServer? server;
  ParseHub? hub;
  final releaseSlowResponses = Completer<void>();
  final cancellationRequestStarted = Completer<void>();
  final serverErrors = <Object>[];
  const title = 'Cliproot cross-platform validation';
  final body = List.filled(
    12,
    'This anonymous article verifies that the target platform loads its native '
    'Cliproot image and runs JavaScript extraction through Rust. '
    'The fixture is served by this application, not by an external website.',
  ).join(' ');
  final html =
      '<!doctype html><html><head><title>$title</title></head>'
      '<body><article><h1>$title</h1><p>$body</p></article></body></html>';

  Future<void> respond(HttpRequest request) async {
    final slow = request.uri.path.startsWith('/slow-');
    try {
      if (request.uri.path == '/slow-cancel' &&
          !cancellationRequestStarted.isCompleted) {
        cancellationRequestStarted.complete();
      }
      if (slow) await releaseSlowResponses.future;
      request.response.headers.contentType = ContentType.html;
      request.response.write(html);
      await request.response.close();
    } on SocketException catch (error) {
      if (!slow) serverErrors.add(error);
    } on HttpException catch (error) {
      if (!slow) serverErrors.add(error);
    } catch (error) {
      serverErrors.add(error);
    }
  }

  try {
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) => unawaited(respond(request)));
    final base = 'http://127.0.0.1:${server.port}';
    hub = await ParseHub.open(cachePath: cache.path, allowPrivateNetwork: true);
    if (hub.sources.length != 25 || hub.sourceRelease.isEmpty) {
      throw StateError('The expected built-in rule inventory was not loaded.');
    }
    final result = await hub.parse('$base/article');
    if (result.title != title ||
        !result.text.contains('anonymous article verifies')) {
      throw StateError(
        'The Rust/JavaScript extraction result did not match the fixture.',
      );
    }
    final json = result.toJson();
    final restored = ParseResult.fromJson(json);
    if (json['schemaVersion'] != 1 ||
        restored.title != result.title ||
        restored.text != result.text ||
        restored.canonicalUrl != result.canonicalUrl) {
      throw StateError('Result JSON v1 did not survive a round trip.');
    }

    final preCancelled = ParseCancellation()..cancel();
    await _requireError(
      hub.parse('$base/article', cancellation: preCancelled),
      ParseErrorCode.cancelled,
    );
    final cancellation = ParseCancellation();
    final pendingCancellation = hub.parse(
      '$base/slow-cancel',
      cancellation: cancellation,
    );
    await cancellationRequestStarted.future.timeout(
      const Duration(seconds: 15),
    );
    cancellation.cancel();
    await _requireError(pendingCancellation, ParseErrorCode.cancelled);
    await _requireError(
      hub.parse('$base/slow-timeout', timeout: const Duration(seconds: 1)),
      ParseErrorCode.timeout,
    );

    final release = hub.sourceRelease;
    final ruleCount = hub.sources.length;
    await hub.close().timeout(const Duration(seconds: 15));
    await hub.close();
    await _requireError(hub.parse('$base/article'), ParseErrorCode.closed);
    hub = null;
    hub = await ParseHub.open(cachePath: cache.path, allowPrivateNetwork: true);
    final reopened = await hub.parse('$base/article');
    if (reopened.title != title || hub.sources.length != ruleCount) {
      throw StateError(
        'A new parser could not be opened after closing the previous one.',
      );
    }
    if (serverErrors.isNotEmpty) throw StateError('The fixture server failed.');
    return ValidationReport(
      platform: Platform.operatingSystem,
      ruleCount: ruleCount,
      release: release,
      title: title,
    );
  } finally {
    if (!releaseSlowResponses.isCompleted) releaseSlowResponses.complete();
    try {
      await hub?.close().timeout(const Duration(seconds: 15));
    } finally {
      await server?.close(force: true);
      await cache.delete(recursive: true);
    }
  }
}

Future<void> _requireError(
  Future<ParseResult> result,
  ParseErrorCode code,
) async {
  try {
    await result.timeout(const Duration(seconds: 20));
  } on ParseException catch (error) {
    if (error.code == code) return;
    throw StateError('Expected $code, received ${error.code}.');
  }
  throw StateError('Expected $code, but the operation succeeded.');
}
