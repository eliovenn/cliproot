import { getJson, cookie, requireValue, image, variants, fallback, SourceError } from '../sdk/core.js';
import { markup } from './medium.js';
import { authorInfo } from '../sdk/author.js';
const bearer = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const enabled = 'creator_subscriptions_tweet_preview_api_enabled communities_web_enable_tweet_community_results_fetch c9s_tweet_anatomy_moderator_badge_enabled tweetypie_unmention_optimization_enabled responsive_web_edit_tweet_api_enabled graphql_is_translatable_rweb_tweet_is_translatable_enabled view_counts_everywhere_api_enabled longform_notetweets_consumption_enabled responsive_web_twitter_article_tweet_consumption_enabled freedom_of_speech_not_reach_fetch_enabled standardized_nudges_misinfo tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled rweb_video_timestamps_enabled longform_notetweets_rich_text_read_enabled longform_notetweets_inline_media_enabled rweb_tipjar_consumption_enabled responsive_web_graphql_exclude_directive_enabled responsive_web_graphql_timeline_navigation_enabled'.split(' ');
const disabled = 'tweet_awards_web_tipping_enabled creator_subscriptions_quote_tweet_preview_enabled tweet_with_visibility_results_prefer_gql_media_interstitial_enabled verified_phone_label_enabled responsive_web_graphql_skip_user_profile_image_extensions_enabled responsive_web_enhance_cards_enabled'.split(' ');
function mediaOf(m) {
  const v = m.video_info || m, cover = m.media_url_https || m.preview_image?.original_img_url;
  if (v.variants?.length) return { kind: m.type === 'animated_gif' ? 'animation' : 'video', thumbnail: cover || null,
    variants: v.variants.flatMap((v) => variants(v.url, { mimeType: v.content_type, bitrate: v.bitrate || v.bit_rate,
      durationMs: m.video_info?.duration_millis || m.duration_millis })).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0)) };
  const url = m.original_img_url || cover; if (!url) return null;
  const u = new URL(url); u.searchParams.set('name', 'orig');
  return image(u.href, { width: m.original_info?.width || m.original_img_width, height: m.original_info?.height || m.original_img_height });
}
export function decodeArticle(data) {
  const content = data.content_state || {}, entities = Object.fromEntries((content.entityMap || []).map((e) => [String(e.key), e.value]));
  const mediaMap = new Map((data.media_entities || []).map((m) => [String(m.media_id), mediaOf(m.media_info || {})]));
  const blocks = content.blocks || [];
  const markdown = blocks.map((b) => {
    const marks = (b.inlineStyleRanges || []).map((m) => ({ type: { Bold: 'STRONG', Italic: 'EM', Code: 'CODE' }[m.style], start: m.offset, end: m.offset + m.length }));
    const extra = [];
    for (const range of b.entityRanges || []) {
      const e = entities[String(range.key)];
      if (e?.type === 'LINK') marks.push({ type: 'A', href: e.data?.url, start: range.offset, end: range.offset + range.length });
      if (e?.type === 'DIVIDER') extra.push('---');
      if (e?.type === 'MEDIA') for (const item of e.data?.mediaItems || []) {
        const m = mediaMap.get(String(item.mediaId)); if (m) extra.push(m.kind === 'image' ? `![](${m.variants[0].url})` : `[Video](${m.variants[0].url})`);
      }
    }
    const body = markup(b.text || '', marks), prefix = { 'header-one': '# ', 'header-two': '## ', 'header-three': '### ', 'unordered-list-item': '- ', 'ordered-list-item': '1. ', blockquote: '> ' }[b.type] || '';
    return [prefix + body, ...extra].join('\n\n');
  }).join('\n\n');
  return { title: data.title || '', kind: 'article', text: blocks.map((b) => b.text || '').join('\n\n'), markdown,
    cover: data.cover_media?.media_info?.original_img_url, media: [...mediaMap.values()].filter(Boolean) };
}
export function decodeTweet(node) {
  node = node.tweet || node;
  if (['Suspended', 'BounceDeleted'].includes(node.reason)) throw new SourceError('contentUnavailable');
  const legacy = requireValue(node.legacy || (node.text ? node : null), 'authenticationRequired');
  const user = node.core?.user_results?.result || node.user || {}, u = user.legacy || user;
  const creator = authorInfo({id:user.rest_id || u.id_str,username:u.screen_name || user.core?.screen_name,displayName:u.name || user.core?.name,
    avatarUrl:user.avatar?.image_url || u.profile_image_url_https || u.profile_image_url,profileUrl:(u.screen_name || user.core?.screen_name) && `https://x.com/${u.screen_name || user.core?.screen_name}`});
  if (node.article?.article_results?.result) return {...decodeArticle(node.article.article_results.result),authorInfo:creator};
  const media = (legacy.extended_entities?.media || legacy.entities?.media || node.mediaDetails || []).map(mediaOf).filter(Boolean);
  return { contentId: String(node.rest_id || node.id_str || ''), text: node.note_tweet?.note_tweet_results?.result?.text || legacy.full_text || legacy.text || '',
    authorInfo:creator, media };
}
export default async function extract({ url, options }, attempts) {
  const id = requireValue(new URL(url).pathname.match(/\/status\/(\d+)/)?.[1], 'unsupportedUrl');
  return fallback([
    ['graphql', async () => {
      const csrf = await cookie('ct0', 'https://x.com/'), headers = { Authorization: bearer, 'x-twitter-active-user': 'yes', 'x-twitter-client-language': 'en' };
      if (csrf) headers['x-csrf-token'] = csrf;
      else { const guest = await getJson('https://api.x.com/1.1/guest/activate.json', { method: 'POST', headers }); headers['x-guest-token'] = requireValue(guest.guest_token); }
      const query = new URLSearchParams({ variables: JSON.stringify({ tweetId: id, withCommunity: false, includePromotedContent: false, withVoice: false }),
        features: JSON.stringify(Object.fromEntries([...enabled.map((k) => [k, true]), ...disabled.map((k) => [k, false])])),
        fieldToggles: JSON.stringify({ withArticleRichContentState: true, withArticlePlainText: false }) });
      const data = await getJson(`https://api.x.com/graphql/${options.queryId || 'kPLTRmMnzbPTv70___D06w'}/TweetResultByRestId?${query}`, { headers });
      return decodeTweet(requireValue(data.data?.tweetResult?.result, data.errors ? 'authenticationRequired' : 'contentUnavailable'));
    }],
    ['syndication', async () => {
      const token = (Number(id) / 1e15 * Math.PI).toString(36).replace(/(0+|\.)/g, '');
      const data = await getJson(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token}`);
      requireValue(data.id_str || data.text, 'authenticationRequired'); return { ...decodeTweet(data), contentId: id };
    }],
  ], attempts);
}
