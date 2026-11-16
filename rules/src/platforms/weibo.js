import { getJson, request, requireValue, image, video, livePhoto, variants, absolute } from '../sdk/core.js';
import { text, genericArticle } from '../sdk/html.js';
import { authorInfo } from '../sdk/author.js';
function picture(p) {
  const large = p.largest || p.large || p.original || p, info = { width: large.width, height: large.height, headers: { Referer: 'https://weibo.com/' } };
  if (p.type === 'livephoto' && p.video) return livePhoto(large.url, p.video, info);
  if (p.type === 'gif' && p.video) return { ...video(p.video, info, large.url), kind: 'animation' };
  return image(large.url, info);
}
function clip(p) {
  const m = p.media_info || {}, vs = (m.playback_list || []).flatMap(({ play_info: v }) => variants(v?.url, {
    width: v?.width, height: v?.height, durationMs: Number(v?.duration || m.duration || 0) * 1000, bitrate: v?.bitrate }));
  if (!vs.length) vs.push(...variants([m.mp4_hd_url, m.mp4_sd_url, m.stream_url_hd, m.stream_url]));
  return vs.length ? { kind: 'video', thumbnail: absolute(typeof p.page_pic === 'string' ? p.page_pic : p.page_pic?.url), variants: vs } : null;
}
export function decodeStatus(data, depth = 0) {
  requireValue(depth < 8);
  let media = data.mix_media_info?.items?.map((p) => p.type === 'video' ? clip(p.data) : picture(p.data)) || Object.values(data.pic_infos || {}).map(picture);
  if (!data.mix_media_info && data.page_info?.object_type !== 'article') media.push(clip(data.page_info || {}));
  let body = data.longText?.longTextContent || data.text_raw || text(data.text || '');
  if (data.retweeted_status) { const repost = decodeStatus(data.retweeted_status, depth + 1); body += `\n\n${repost.text}`; media.push(...repost.media); }
  const u = data.user || {};
  return { text: body.trim(), authorInfo:authorInfo({id:u.idstr || u.id,username:u.domain || null,displayName:u.screen_name,avatarUrl:u.avatar_hd || u.avatar_large || u.profile_image_url,profileUrl:u.profile_url ? absolute(u.profile_url,'https://weibo.com/') : u.id && `https://weibo.com/u/${u.id}`}),media: media.filter(Boolean), contentId: String(data.idstr || data.id || '') };
}
export default async function extract({ url }) {
  let u = new URL(url);
  if (u.hostname === 'mapp.api.weibo.cn' || u.hostname === 'video.weibo.com') { url = (await request(url)).url; u = new URL(url); }
  if (u.pathname.startsWith('/ttarticle/')) { const p = await request(url); return { ...genericArticle(p.body, p.url), resolvedUrl: p.url }; }
  const id = requireValue(u.pathname.match(/\/tv\/show\/([^/]+)/)?.[1] || u.searchParams.get('fid') || u.pathname.split('/').filter(Boolean).at(-1), 'unsupportedUrl');
  if (u.pathname.includes('/tv/show') || u.searchParams.has('fid')) {
    const data = await getJson(`https://weibo.com/tv/api/component?page=${encodeURIComponent(`/tv/show/${id}`)}`, {
      form: { data: JSON.stringify({ Component_Play_Playinfo: { oid: id } }) }, headers: { Referer: 'https://weibo.com/tv/home' },
    });
    const p = requireValue(data.data?.Component_Play_Playinfo, 'authenticationRequired');
    return { contentId: id, text: text(p.text || ''),authorInfo:authorInfo({id:p.user_id,displayName:p.user_name,avatarUrl:p.avatar,profileUrl:p.user_id && `https://weibo.com/u/${p.user_id}`}),media: [requireValue(video(Object.values(p.urls || {}), { durationMs: Number(p.duration_time || 0) * 1000 }, p.cover_image))] };
  }
  const data = await getJson(`https://weibo.com/ajax/statuses/show?id=${encodeURIComponent(id)}&isGetLongText=true`, { headers: { Referer: 'https://weibo.com/' } });
  requireValue(data.id || data.idstr, 'authenticationRequired');
  return { ...decodeStatus(data), resolvedUrl: url };
}
