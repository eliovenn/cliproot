// Progressive and DASH representations ported from yt-dlp FacebookIE.
import { request, walk, requireValue, variants, balanced, dataExpression, absolute } from '../sdk/core.js';
import { jsonScripts } from '../sdk/meta.js';
import { documentOf } from '../sdk/html.js';
import { dashBaseUrls } from '../sdk/dash.js';
import { authorInfo } from '../sdk/author.js';
export function decodeVideos(data, url, wanted) {
  const all = [...walk(data)], keys = ['playable_url','browser_native_hd_url','browser_native_sd_url','sd_src','hd_src','dash_manifest','dash_manifest_xml_string','manifest_xml','dash_manifest_url'];
  const hasMedia = (n) => keys.some((k) => n[k]);
  const roots = wanted ? all.filter((n) => String(n.id || n.video_id) === String(wanted)) : all.filter(hasMedia);
  if (!wanted) requireValue(new Set(roots.map((n) => n.id || n.video_id).filter(Boolean)).size === 1, 'contentUnavailable');
  const selected = [...new Set(roots.flatMap((n) => [...walk(n)]))].filter((n) => hasMedia(n) && (!wanted || !(n.id || n.video_id) || String(n.id || n.video_id) === String(wanted)));
  const media = [], seen = new Set();
  for (const n of selected) {
    const vs = ['browser_native_hd_url', 'playable_url_quality_hd', 'hd_src', 'browser_native_sd_url', 'playable_url', 'sd_src', 'playable_url_dash', 'dash_manifest_url']
      .flatMap((k) => variants(n[k]));
    for (const key of ['dash_manifest', 'dash_manifest_xml_string', 'manifest_xml']) if (n[key]) vs.push(...dashBaseUrls(n[key], url));
    const unique = vs.filter((v) => { if (seen.has(v.url)) return false; seen.add(v.url); return true; });
    const audio = unique.filter((v) => v.hasAudio && !v.hasVideo), video = unique.filter((v) => v.hasVideo);
    if (video.length) media.push({ kind: 'video', thumbnail: absolute(n.preferred_thumbnail?.image?.uri || n.thumbnailImage?.uri || n.thumbnail), variants: video });
    if (audio.length) media.push({ kind: 'audio', variants: audio });
  }
  requireValue(media.length > 0, 'contentUnavailable');
  const target = roots[0] || {}, u = target.owner || target.video_owner || target.actors?.[0] || {};
  return { media, title: selected[0]?.name || selected[0]?.title?.text || '', text: selected[0]?.savable_description?.text || '',
    authorInfo:authorInfo({id:u.id,username:u.username,displayName:u.name,avatarUrl:u.profile_picture?.uri || u.profile_picture?.url,profileUrl:u.url || (u.id && `https://www.facebook.com/${u.id}`)}) };
}
export default async function extract({ url }) {
  const page = await request(url), u = new URL(page.url);
  const id = u.searchParams.get('v') || u.pathname.match(/\/(?:videos|reel)\/(\d+)/)?.[1];
  const data = jsonScripts(page.body);
  // Legacy pages embed escaped videoData outside application/json scripts.
  for (const match of page.body.matchAll(/"videoData"\s*:\s*(?=\[)/g)) {
    try { data.push(dataExpression(balanced(page.body, match.index + match[0].length))); } catch { /* Ignore malformed legacy data. */ }
  }
  const result = decodeVideos(data, page.url, id);
  const doc = documentOf(page.body);
  return { ...result, contentId: id || null, resolvedUrl: page.url,
    title: result.title || doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '' };
}
