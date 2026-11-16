// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import 'models.dart';

/// The versioned metadata of an available extraction rule.
class SourceInfo {
  SourceInfo.fromJson(Map<String, dynamic> json)
    : id = json['id'] as String,
      version = json['version'] as String,
      names = Map.unmodifiable(Map<String, String>.from(json['name'] as Map)),
      hosts = List.unmodifiable((json['hosts'] as List).cast<String>()),
      cookieDomain = json['cookieDomain'] as String?,
      priority = json['priority'] as int? ?? 0,
      entry = json['entry'] as String,
      digest = json['sha256'] as String;

  final String id;
  final String version;
  final Map<String, String> names;
  final List<String> hosts;
  final String? cookieDomain;
  final int priority;
  final String entry;
  final String digest;

  String displayName(String language) => names[language] ?? names['en'] ?? id;
}

/// The outcome of an explicit rule update.
enum SourceUpdateStatus { updated, unchanged, notConfigured, failed }

/// The release and optional failure code of a rule update.
class SourceUpdateReport {
  const SourceUpdateReport(this.status, this.release, {this.errorCode});
  final SourceUpdateStatus status;
  final String release;
  final ParseErrorCode? errorCode;

  factory SourceUpdateReport.fromJson(Map<String, dynamic> value) =>
      SourceUpdateReport(
        SourceUpdateStatus.values.byName(value['status'] as String),
        value['release'] as String,
        errorCode: value['errorCode'] == null
            ? null
            : ParseErrorCode.values.byName(value['errorCode'] as String),
      );
}
