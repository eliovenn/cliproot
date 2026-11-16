import { getJson, request, cookie, setCookie, randomHex, now, requireValue, parseJson, image, video, SourceError } from '../sdk/core.js';
import { article } from '../sdk/html.js';
import { heyboxSign } from '../sdk/xiaoheihe_sign.js';
import { deviceId } from '../sdk/heybox_device.js';
import { authorInfo } from '../sdk/author.js';
export function decodeLink(link, url) {
  if (link.has_video) return { title: link.title || '', text: link.text || '', media: [requireValue(video(link.video_url, {}, link.video_thumb))] };
  const parts = typeof link.text === 'string' ? parseJson(link.text) : link.text;
  requireValue(Array.isArray(parts));
  const result = article(parts.filter((p) => p.type === 'html' || p.type === 'text').map((p) => p.type === 'html' ? p.text : `<p>${p.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</p>`).join('\n'), url, link.title || '');
  for (const p of parts) if (p.type === 'img' && p.url) result.media.push(image(p.url.replace(/[!?].*$/, '').replace(/\/thumb\.(\w+)$/, '.$1'), { width: Number(p.width) || null, height: Number(p.height) || null }));
  return result;
}
export default async function extract({ url }) {
  let u = new URL(url), id = u.searchParams.get('link_id') || u.pathname.match(/\/link\/([^/]+)/)?.[1];
  if (!id) { url = (await request(url)).url; u = new URL(url); id = u.searchParams.get('link_id') || u.pathname.match(/\/link\/([^/]+)/)?.[1]; }
  requireValue(id, 'unsupportedUrl');
  const base = 'https://api.xiaoheihe.cn';
  if (!await cookie('x_xhh_tokenid', base)) await setCookie('x_xhh_tokenid', await deviceId(), base);
  const query = new URLSearchParams({ os_type: 'web', app: 'heybox', client_type: 'web', version: '999.0.4', web_version: '2.5', x_client_type: 'web', x_app: 'heybox_website', heybox_id: '', x_os_type: 'Windows', device_info: 'Chrome', link_id: id, owner_only: '1', ...heyboxSign('/bbs/app/link/tree', now(), (await randomHex(16)).toUpperCase()) });
  const data = await getJson(`${base}/bbs/app/link/tree?${query}`);
  if (data.status !== 'ok') throw new SourceError(['login', 'relogin', 'lack_token'].includes(data.status) ? 'authenticationRequired' : data.status === 'show_captcha' ? 'rateLimited' : 'sourceError');
  const link = requireValue(data.result?.link), user = link.user || data.result.user || {};
  return { ...decodeLink(link, url), contentId: id, resolvedUrl: url,
    authorInfo:authorInfo({id:user.userid || user.user_id || user.id,username:user.username,displayName:user.nickname,avatarUrl:user.avatar || user.avatar_url,profileUrl:user.userid && `https://www.xiaoheihe.cn/app/user/profile/${user.userid}`}) };
}
