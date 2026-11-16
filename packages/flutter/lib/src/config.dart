// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
// Adapted from Folinel parsehub_dart; preserves config JSON v1.
import 'dart:convert';

/// A domain-scoped credential. Values never appear in [toString].
class ParserCookie {
  const ParserCookie({
    required this.name,
    required this.value,
    required this.domain,
    this.path = '/',
    this.secure = true,
    this.hostOnly = false,
    this.expires,
  });

  final String name;
  final String value;
  final String domain;
  final String path;
  final bool secure;
  final bool hostOnly;
  final DateTime? expires;

  factory ParserCookie.fromJson(Map<String, dynamic> json) {
    final result = ParserCookie(
      name: json['name'] as String,
      value: json['value'] as String,
      domain: json['domain'] as String,
      path: json['path'] as String? ?? '/',
      secure: json['secure'] as bool? ?? true,
      hostOnly: json['hostOnly'] as bool? ?? false,
      expires: json['expires'] == null
          ? null
          : DateTime.parse(json['expires'] as String),
    );
    result.validate();
    return result;
  }

  void validate() {
    if (!RegExp(r'^[!#$%&\x27*+.^_`|~0-9A-Za-z-]+$').hasMatch(name) ||
        RegExp(r'[\x00-\x20\x7f;,]').hasMatch(value) ||
        !RegExp(r'^\.?[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$').hasMatch(domain) ||
        !path.startsWith('/') ||
        RegExp(r'[\r\n;]').hasMatch(path)) {
      throw const FormatException('Invalid cookie syntax or scope');
    }
  }

  Uri get origin => Uri.https(domain.replaceFirst(RegExp(r'^\.'), ''), path);

  Map<String, dynamic> toJson() => {
    'name': name,
    'value': value,
    'domain': domain,
    'path': path,
    'secure': secure,
    'hostOnly': hostOnly,
    if (expires != null) 'expires': expires!.toUtc().toIso8601String(),
  };

  @override
  String toString() => 'ParserCookie($name, $domain, [redacted])';
}

class PlatformConfig {
  PlatformConfig({
    List<ParserCookie> cookies = const [],
    Map<String, dynamic> options = const {},
  }) : cookies = List.unmodifiable(cookies),
       options = Map.unmodifiable(options) {
    for (final cookie in cookies) {
      cookie.validate();
    }
    // Verify the bridge payload is JSON-compatible before accepting it.
    jsonEncode(options);
  }

  final List<ParserCookie> cookies;
  final Map<String, dynamic> options;

  /// Import a browser's Cookie request header. Empty input clears credentials.
  factory PlatformConfig.fromCookieHeader(
    String header, {
    required String domain,
  }) {
    var value = header.trim();
    if (value.toLowerCase().startsWith('cookie:')) {
      value = value.substring(7).trim();
    }
    if (value.contains('\r') || value.contains('\n')) {
      throw const FormatException('Paste only the Cookie header value');
    }
    final cookies = <ParserCookie>[];
    final names = <String>{};
    for (final part in value.split(';')) {
      if (part.trim().isEmpty) continue;
      final separator = part.indexOf('=');
      if (separator <= 0) throw const FormatException('Expected name=value');
      final name = part.substring(0, separator).trim();
      if (!names.add(name)) {
        throw const FormatException('Duplicate cookie name');
      }
      cookies.add(
        ParserCookie(
          name: name,
          value: part.substring(separator + 1).trim(),
          domain: domain,
        ),
      );
    }
    return PlatformConfig(cookies: cookies);
  }

  factory PlatformConfig.fromJson(Map<String, dynamic> json) => PlatformConfig(
    cookies: (json['cookies'] as List? ?? [])
        .map(
          (item) =>
              ParserCookie.fromJson(Map<String, dynamic>.from(item as Map)),
        )
        .toList(),
    options: Map<String, dynamic>.from(json['options'] as Map? ?? {}),
  );

  Map<String, dynamic> toJson() => {
    'cookies': cookies.map((cookie) => cookie.toJson()).toList(),
    'options': options,
  };

  @override
  String toString() => 'PlatformConfig(${cookies.length} cookies, [redacted])';
}

class ParseHubConfig {
  ParseHubConfig({Map<String, PlatformConfig> platforms = const {}})
    : platforms = Map.unmodifiable(platforms);

  final Map<String, PlatformConfig> platforms;

  factory ParseHubConfig.fromJsonString(String text) {
    final json = jsonDecode(text) as Map<String, dynamic>;
    if (json['schemaVersion'] != 1) {
      throw const FormatException('Unsupported configuration version');
    }
    return ParseHubConfig(
      platforms: {
        for (final entry in (json['platforms'] as Map<String, dynamic>).entries)
          entry.key: PlatformConfig.fromJson(
            Map<String, dynamic>.from(entry.value as Map),
          ),
      },
    );
  }

  Map<String, dynamic> toJson() => {
    'schemaVersion': 1,
    'platforms': platforms.map((id, config) => MapEntry(id, config.toJson())),
  };

  @override
  String toString() =>
      'ParseHubConfig(${platforms.length} platforms, [redacted])';
}
