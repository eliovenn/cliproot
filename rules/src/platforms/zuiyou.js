import { getJson, requireValue, image, video } from '../sdk/core.js';
import { authorInfo } from '../sdk/author.js';
export function decodePost(post) {
  const u = post.member || post.user || {};
  return { text: post.content || '',authorInfo:authorInfo({id:u.id || u.mid,username:u.username,displayName:u.name || u.nick,avatarUrl:u.avatar || u.avatar_urls?.origin?.urls?.[0]}),media: (post.imgs || []).map((p) => {
    const u = Object.values(p.urls || {}).at(-1)?.urls?.at(-1);
    return p.video ? video(post.videos?.[String(p.id)]?.url, {}, u) : image(u);
  }) };
}
export default async function extract({ url }) {
  const pid = requireValue(new URL(url).searchParams.get('pid'), 'unsupportedUrl');
  requireValue(/^\d+$/.test(pid), 'unsupportedUrl');
  const data = await getJson('https://share.xiaochuankeji.cn/planck/share/post/detail_h5', { json: { pid: Number(pid) } });
  return { ...decodePost(requireValue(data.data?.post, 'contentUnavailable')), contentId: pid };
}
