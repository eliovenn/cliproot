// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
// Adapted from Folinel parsehub_dart; preserves result JSON v1.
/// Stable codes for consumers to localize. No credentials or raw HTTP errors.
enum ParseErrorCode {
  unsupportedUrl,
  authenticationRequired,
  contentUnavailable,
  rateLimited,
  networkError,
  timeout,
  sourceError,
  incompatibleSource,
  cancelled,
  closed,
}

class ParseException implements Exception {
  const ParseException(this.code, {this.attempts = const []});
  final ParseErrorCode code;
  final List<ParseAttempt> attempts;

  factory ParseException.fromJson(Map<String, dynamic> data) => ParseException(
    ParseErrorCode.values.firstWhere(
      (code) => code.name == data['code'],
      orElse: () => ParseErrorCode.sourceError,
    ),
    attempts: _attempts(data['attempts']),
  );

  @override
  String toString() => 'ParseException(${code.name})';
}

class ParseAttempt {
  const ParseAttempt(this.stage, this.code);
  final String stage;
  final String code;
  Map<String, dynamic> toJson() => {'stage': stage, 'code': code};
}

List<ParseAttempt> _attempts(dynamic value) => List.unmodifiable(
  (value as List? ?? []).map(
    (item) => ParseAttempt(item['stage'] as String, item['code'] as String),
  ),
);

String _url(dynamic value) {
  final uri = Uri.tryParse(value as String? ?? '');
  if (uri == null ||
      !['http', 'https'].contains(uri.scheme) ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty) {
    throw const FormatException('Expected an HTTP resource URL');
  }
  return uri.toString();
}

class MediaVariant {
  MediaVariant.fromJson(Map<String, dynamic> json)
    : url = _url(json['url']),
      protocol = json['protocol'] as String? ?? 'http',
      mimeType = json['mimeType'] as String?,
      width = (json['width'] as num?)?.toInt(),
      height = (json['height'] as num?)?.toInt(),
      durationMs = (json['durationMs'] as num?)?.toInt(),
      bitrate = (json['bitrate'] as num?)?.toInt(),
      codecs = json['codecs'] as String?,
      hasVideo = json['hasVideo'] as bool? ?? true,
      hasAudio = json['hasAudio'] as bool? ?? true,
      audioGroupId = json['audioGroupId'] as String?,
      headers = Map.unmodifiable(
        Map<String, String>.from(json['headers'] as Map? ?? {}),
      ),
      backupUrls = List.unmodifiable(
        (json['backupUrls'] as List? ?? []).map(_url),
      ),
      expiresAt = json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String) {
    if (!['http', 'hls', 'dash'].contains(protocol)) {
      throw const FormatException('Unsupported media protocol');
    }
    if (headers.keys.any(
      (key) => ['cookie', 'authorization'].contains(key.toLowerCase()),
    )) {
      throw const FormatException(
        'Credentials must not be embedded in a result',
      );
    }
  }
  final String url;
  final String protocol;
  final String? mimeType;
  final int? width;
  final int? height;
  final int? durationMs;
  final int? bitrate;
  final String? codecs;
  final bool hasVideo;
  final bool hasAudio;
  final String? audioGroupId;
  final Map<String, String> headers;
  final List<String> backupUrls;
  final DateTime? expiresAt;

  Map<String, dynamic> toJson() => {
    'url': url,
    'protocol': protocol,
    'mimeType': mimeType,
    'width': width,
    'height': height,
    'durationMs': durationMs,
    'bitrate': bitrate,
    'codecs': codecs,
    'hasVideo': hasVideo,
    'hasAudio': hasAudio,
    'audioGroupId': audioGroupId,
    'headers': headers,
    'backupUrls': backupUrls,
    'expiresAt': expiresAt?.toUtc().toIso8601String(),
  };
}

class MediaResource {
  MediaResource.fromJson(Map<String, dynamic> json)
    : kind = json['kind'] as String,
      thumbnail = json['thumbnail'] == null ? null : _url(json['thumbnail']),
      variants = List.unmodifiable(
        (json['variants'] as List).map(
          (v) => MediaVariant.fromJson(Map<String, dynamic>.from(v as Map)),
        ),
      ),
      companionVideo = json['companionVideo'] == null
          ? null
          : MediaResource.fromJson(
              Map<String, dynamic>.from(json['companionVideo'] as Map),
            ) {
    if (!['image', 'video', 'audio', 'animation', 'livePhoto'].contains(kind) ||
        variants.isEmpty) {
      throw const FormatException('Invalid media resource');
    }
  }
  final String kind;
  final String? thumbnail;
  final List<MediaVariant> variants;
  final MediaResource? companionVideo;
  Map<String, dynamic> toJson() => {
    'kind': kind,
    'thumbnail': thumbnail,
    'variants': variants.map((v) => v.toJson()).toList(),
    if (companionVideo != null) 'companionVideo': companionVideo!.toJson(),
  };
}

/// Public author identity. Handles and display names are distinct and optional.
class ParseAuthor {
  ParseAuthor.fromJson(Map<String, dynamic> json)
    : id = json['id'] as String?,
      username = json['username'] as String?,
      displayName = json['displayName'] as String?,
      avatarUrl = json['avatarUrl'] == null ? null : _url(json['avatarUrl']),
      profileUrl = json['profileUrl'] == null ? null : _url(json['profileUrl']);

  final String? id;
  final String? username;
  final String? displayName;
  final String? avatarUrl;
  final String? profileUrl;

  Map<String, dynamic> toJson() => {
    'id': id,
    'username': username,
    'displayName': displayName,
    'avatarUrl': avatarUrl,
    'profileUrl': profileUrl,
  };
}

class ParseResult {
  ParseResult.fromJson(Map<String, dynamic> json)
    : platformId = json['platformId'] as String,
      contentId = json['contentId'] as String?,
      sourceVersion = json['sourceVersion'] as String,
      inputUrl = _url(json['inputUrl']),
      resolvedUrl = _url(json['resolvedUrl']),
      canonicalUrl = _url(json['canonicalUrl']),
      kind = json['kind'] as String,
      title = json['title'] as String? ?? '',
      text = json['text'] as String? ?? '',
      html = json['html'] as String?,
      markdown = json['markdown'] as String?,
      author = json['author'] as String?,
      authorInfo = json['authorInfo'] == null
          ? null
          : ParseAuthor.fromJson(
              Map<String, dynamic>.from(json['authorInfo'] as Map),
            ),
      publishedAt = json['publishedAt'] == null
          ? null
          : DateTime.parse(json['publishedAt'] as String),
      cover = json['cover'] == null ? null : _url(json['cover']),
      media = List.unmodifiable(
        (json['media'] as List? ?? []).map(
          (m) => MediaResource.fromJson(Map<String, dynamic>.from(m as Map)),
        ),
      ),
      attempts = _attempts(json['attempts']) {
    if (json['schemaVersion'] != 1 ||
        ![
          'article',
          'image',
          'video',
          'audio',
          'mixed',
          'text',
        ].contains(kind)) {
      throw const FormatException('Unsupported result schema');
    }
    if (title.isEmpty && text.isEmpty && media.isEmpty) {
      throw const FormatException('Empty extraction result');
    }
  }
  final String platformId;
  final String? contentId;
  final String sourceVersion;
  final String inputUrl;
  final String resolvedUrl;
  final String canonicalUrl;
  final String kind;
  final String title;
  final String text;
  final String? html;
  final String? markdown;
  final String? author;
  final ParseAuthor? authorInfo;
  final DateTime? publishedAt;
  final String? cover;
  final List<MediaResource> media;
  final List<ParseAttempt> attempts;

  Map<String, dynamic> toJson() => {
    'schemaVersion': 1,
    'platformId': platformId,
    'contentId': contentId,
    'sourceVersion': sourceVersion,
    'inputUrl': inputUrl,
    'resolvedUrl': resolvedUrl,
    'canonicalUrl': canonicalUrl,
    'kind': kind,
    'title': title,
    'text': text,
    'html': html,
    'markdown': markdown,
    'author': author,
    'authorInfo': authorInfo?.toJson(),
    'publishedAt': publishedAt?.toUtc().toIso8601String(),
    'cover': cover,
    'media': media.map((m) => m.toJson()).toList(),
    'attempts': attempts.map((a) => a.toJson()).toList(),
  };
}
