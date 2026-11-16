import { request, parseJson, requireValue, image, video, urlList } from '../sdk/core.js';
import { documentOf } from '../sdk/html.js';
import { authorInfo } from '../sdk/author.js';
export function decodeItem(item) {
  let media = [];
  if (Number(item.item_type) === 1) media = (item.cover?.download_list || []).map((p) => image(p.url));
  if (Number(item.item_type) === 2) {
    const v = requireValue(item.video?.video_download);
    media = [video(urlList(v), { width: v.width, height: v.height, durationMs: Number(v.duration || 0) * 1000 }, v.cover_image?.download_list?.[0]?.url)];
  }
  const u = item.author || item.user || {};
  return { text: item.content || '', contentId: String(item.item_id || item.id || ''), media,
    authorInfo:authorInfo({id:u.id || u.user_id,username:u.unique_id,displayName:u.name || u.nickname,avatarUrl:urlList(u.avatar || u.avatar_url || u.avatar_larger)[0]}) };
}
export default async function extract({ url }) {
  const page = await request(url);
  const data = parseJson(decodeURIComponent(requireValue(documentOf(page.body).querySelector('#RENDER_DATA')).textContent));
  return { ...decodeItem(requireValue(data.ppxItemDetail?.item)), resolvedUrl: page.url };
}
