import { getJson, request, requireValue, image, video, MOBILE_UA } from '../sdk/core.js';
import { article } from '../sdk/html.js';
import { authorInfo } from '../sdk/author.js';
export function decodeTopic(data, url) {
  const result = article(data.content || '', url, data.title || '');
  const user = data.author || {};
  result.authorInfo = authorInfo({id:user.id,username:user.uid,displayName:user.name,avatarUrl:user.large_avatar || user.avatar,profileUrl:user.url || (user.uid && `https://www.douban.com/people/${user.uid}/`)});
  const headers = { Referer: 'https://www.douban.com/' };
  const photos = (data.photos || []).map((p) => {
    const i = p.image || {}, source = i.large || i.normal || {};
    if (i.is_animated && i.video?.url) return { ...video(i.video.url, { headers, width: i.video.width, height: i.video.height }, i.normal?.url), kind: 'animation' };
    return image(source.url, { headers, width: source.width, height: source.height });
  });
  const v = data.video_info;
  if (v?.video_url) photos.push(video(v.video_url, { headers, width: v.video_width, height: v.video_height,
    durationMs: String(v.duration || '0').split(':').reduce((n, p) => n * 60 + Number(p), 0) * 1000 }, v.cover_url));
  result.media = [...result.media, ...photos].filter(Boolean);
  for (const m of result.media) for (const v of m.variants) v.headers = headers;
  return result;
}
export default async function extract({ url }) {
  if (new URL(url).hostname === 'douc.cc') url = (await request(url)).url;
  const id = requireValue(new URL(url).pathname.match(/^\/(?:group\/)?topic\/(\d+)/)?.[1], 'unsupportedUrl');
  const data = await getJson(`https://m.douban.com/rexxar/api/v2/group/topic/${id}`, { headers: { 'User-Agent': MOBILE_UA, Referer: 'https://m.douban.com/' } });
  return { ...decodeTopic(data, url), resolvedUrl: url, contentId: id };
}
