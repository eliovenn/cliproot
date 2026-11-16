import { cookie, request, getJson, requireValue, image, video, variants, parseJson } from './core.js';
import { documentOf } from './html.js';
import { metaAuthor } from './author.js';
export function shortcodeId(code) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let n = 0n;
  for (const ch of code) { const v = alphabet.indexOf(ch); requireValue(v >= 0, 'unsupportedUrl'); n = n * 64n + BigInt(v); }
  return n.toString();
}
export async function graphql(base, appId, docId, variables) {
  if (!await cookie('csrftoken', base)) await request(base);
  const csrf = await cookie('csrftoken', base);
  return getJson(`${base}graphql/query`, { followRedirects: false, headers: { Referer: base, 'X-IG-App-ID': appId, ...(csrf ? { 'X-CSRFToken': csrf } : {}) },
    form: { doc_id: docId, variables: JSON.stringify(variables), server_timestamps: 'true' } });
}
export function metaMedia(node) {
  if (node.carousel_media) return node.carousel_media.flatMap(metaMedia);
  if (node.edge_sidecar_to_children) return node.edge_sidecar_to_children.edges.flatMap((e) => metaMedia(e.node));
  if (node.text_post_app_info?.linked_inline_media) return metaMedia(node.text_post_app_info.linked_inline_media);
  const candidates = node.image_versions2?.candidates || [], cover = node.display_url || candidates[0]?.url;
  const videos = node.video_versions || (node.video_url ? [{ url: node.video_url, ...node.dimensions }] : []);
  if (videos.length) return [{ kind: 'video', thumbnail: cover || null, variants: videos.flatMap((v) => variants(v.url, {
    width: v.width || node.original_width, height: v.height || node.original_height, durationMs: Number(node.video_duration || 0) * 1000 })) }];
  return cover ? [image(cover, node.dimensions || { width: candidates[0]?.width, height: candidates[0]?.height })] : [];
}
export function metaPost(node, base = 'https://www.instagram.com/') {
  return { contentId: String(node.pk || node.id || node.code || ''), title: node.title || '',
    text: node.caption?.text || (typeof node.caption === 'string' ? node.caption : '') || node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
    author: node.user?.full_name || node.user?.username || node.owner?.username,
    authorInfo: metaAuthor(node.user || node.owner || {}, base),
    media: metaMedia(node).filter(Boolean) };
}
export function jsonScripts(html) {
  const data = [];
  for (const node of documentOf(html).querySelectorAll('script[type="application/json"],script[type="application/ld+json"]')) {
    try { data.push(parseJson(node.textContent)); } catch { /* Non-data script. */ }
  }
  return data;
}
