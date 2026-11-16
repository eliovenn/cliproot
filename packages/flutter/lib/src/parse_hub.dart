// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'config.dart';
import 'models.dart';
import 'native/library_loader.dart';
import 'rule_info.dart';
import 'rust/api.dart' as native;
import 'rust/frb_generated.dart';

/// A local cancellation signal for an extraction request.
class ParseCancellation {
  final Completer<void> _cancelled = Completer<void>();

  /// Whether cancellation has been requested.
  bool get isCancelled => _cancelled.isCompleted;

  /// Requests cancellation without waiting for native resources to close.
  void cancel() {
    if (!isCancelled) _cancelled.complete();
  }
}

/// A reusable session backed by the Cliproot Rust parser.
class ParseHub {
  ParseHub._(
    this._native,
    this._sources,
    this._release,
    this.recoveredSourceCache,
  );

  static Future<void>? _initialization;
  static int _nextTask = 0;
  final native.NativeParser _native;
  List<SourceInfo> _sources;
  String _release;
  bool _closed = false;
  Future<void>? _closing;

  /// The metadata of available rules.
  List<SourceInfo> get sources => _sources;

  /// The active rule release.
  String get sourceRelease => _release;

  /// Whether startup recovered from an invalid or previous cache.
  final bool recoveredSourceCache;

  /// Initializes the generated native bridge once per Dart isolate.
  ///
  /// [nativeLibraryPath] can select a development build explicitly. Otherwise
  /// Dart resolves the bundled code asset before FRB opens its actual image.
  static Future<void> initialize({String? nativeLibraryPath}) =>
      _initialization ??=
          Future<void>.sync(
            () => RustLib.init(
              externalLibrary: loadCliprootLibrary(
                nativeLibraryPath: nativeLibraryPath,
              ),
            ),
          ).catchError((Object error, StackTrace stack) {
            _initialization = null;
            Error.throwWithStackTrace(error, stack);
          });

  /// Opens a session using application-owned cache storage.
  ///
  /// Credentials are optional. [allowPrivateNetwork] is only for trusted local
  /// callers and must not be controlled by public HTTP requests.
  static Future<ParseHub> open({
    required String cachePath,
    ParseHubConfig? config,
    int concurrency = 1,
    Uri? sourceManifestUri,
    bool allowPrivateNetwork = false,
    String? nativeLibraryPath,
  }) async {
    if (cachePath.isEmpty || concurrency < 1 || concurrency > 8) {
      throw ArgumentError('Invalid cache path or concurrency');
    }
    await initialize(nativeLibraryPath: nativeLibraryPath);
    final parser = await _translate(
      () => native.NativeParser.open(
        configJson: jsonEncode({
          'cachePath': cachePath,
          'concurrency': concurrency,
          'networkPolicy': allowPrivateNetwork ? 'allowPrivate' : 'publicOnly',
          'sourceManifestUrl': sourceManifestUri?.toString(),
          'platforms': (config ?? ParseHubConfig()).toJson()['platforms'],
        }),
      ),
    );
    try {
      return ParseHub._(
        parser,
        _decodeSources(await _translate(parser.rulesJson)),
        await parser.sourceRelease(),
        await parser.recoveredSourceCache(),
      );
    } catch (_) {
      try {
        await parser.close();
      } finally {
        parser.dispose();
      }
      rethrow;
    }
  }

  /// Extracts a link, shared text, or Bilibili BV identifier.
  ///
  /// Timeout includes queue time. Cancellation before native task creation is
  /// checked again after receiving the task handle.
  Future<ParseResult> parse(
    String input, {
    ParseCancellation? cancellation,
    Duration timeout = const Duration(seconds: 60),
  }) async {
    _checkOpen();
    if (timeout <= Duration.zero || timeout > const Duration(minutes: 10)) {
      throw ArgumentError.value(timeout, 'timeout');
    }
    if (cancellation?.isCancelled ?? false) {
      throw const ParseException(ParseErrorCode.cancelled);
    }
    final task = await _translate(
      () => _native.start(
        input: input,
        taskId: 'flutter-${++_nextTask}',
        timeoutMs: timeout.inMilliseconds,
      ),
    );
    final finished = Completer<void>();
    var completed = false;
    try {
      if (cancellation != null) {
        if (cancellation.isCancelled) await task.cancel();
        unawaited(
          Future.any([cancellation._cancelled.future, finished.future])
              .then((_) async {
                if (!completed && cancellation.isCancelled) await task.cancel();
              })
              .catchError((Object _) {}),
        );
      }
      final json = await _translate(task.resultJson);
      final result = await compute(_decodeResult, json);
      if (cancellation?.isCancelled ?? false) {
        throw const ParseException(ParseErrorCode.cancelled);
      }
      _checkOpen();
      return result;
    } on FormatException {
      throw const ParseException(ParseErrorCode.sourceError);
    } finally {
      completed = true;
      finished.complete();
      task.dispose();
    }
  }

  /// Replaces the configuration used by subsequent tasks.
  Future<void> updateConfig(ParseHubConfig config) async {
    _checkOpen();
    await _translate(
      () => _native.updatePlatforms(
        platformsJson: jsonEncode(config.toJson()['platforms']),
      ),
    );
  }

  /// Checks the configured CDN without discarding the current rules on failure.
  Future<SourceUpdateReport> updateSources() async {
    _checkOpen();
    final report = SourceUpdateReport.fromJson(
      _decodeMap(await _translate(_native.updateRulesJson)),
    );
    if (report.status == SourceUpdateStatus.updated) {
      _sources = _decodeSources(await _translate(_native.rulesJson));
      _release = report.release;
    }
    return report;
  }

  /// Changes the manifest URL used by subsequent update requests.
  Future<void> setSourceManifestUri(Uri? uri) async {
    _checkOpen();
    await _translate(() => _native.setSourceManifestUrl(url: uri?.toString()));
  }

  /// Cancels outstanding work and waits for native workers to release resources.
  Future<void> close() => _closing ??= _close();

  Future<void> _close() async {
    _closed = true;
    try {
      await _translate(_native.close);
    } finally {
      _native.dispose();
    }
  }

  void _checkOpen() {
    if (_closed) throw const ParseException(ParseErrorCode.closed);
  }
}

Future<T> _translate<T>(Future<T> Function() action) async {
  try {
    return await action();
  } on native.CliprootFailure catch (error) {
    throw ParseException.fromJson(_decodeMap(error.detailsJson));
  }
}

Map<String, dynamic> _decodeMap(String text) =>
    Map<String, dynamic>.from(jsonDecode(text) as Map);

ParseResult _decodeResult(String text) =>
    ParseResult.fromJson(_decodeMap(text));

List<SourceInfo> _decodeSources(String text) => List.unmodifiable(
  (jsonDecode(text) as List).map(
    (value) => SourceInfo.fromJson(Map<String, dynamic>.from(value as Map)),
  ),
);
