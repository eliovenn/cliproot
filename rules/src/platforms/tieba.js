import CryptoJS from 'crypto-js';
import { getJson, requireValue, image, video } from '../sdk/core.js';
import { authorInfo } from '../sdk/author.js';
export const sign = (params) => CryptoJS.MD5(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('') + '36770b1f34c9bbf2e7d1a99d2b82fa9e').toString();
export function decodeThread(thread) {
  const origin = requireValue(thread.origin_thread_info), v = thread.video_info;
  const media = (origin.media || []).map((p) => image(p.big_pic, { width: Number(p.width), height: Number(p.height) }));
  if (v?.video_url) media.push(video(v.video_url, { width: Number(v.video_width), height: Number(v.video_height), durationMs: Number(v.video_duration || 0) * 1000 }, v.thumbnail_url));
  const u = thread.author || origin.author || {};
  return { title: origin.title || '', text: (origin.content || []).filter((p) => Number(p.type) === 0).map((p) => p.text).join('\n'), media,
    authorInfo:authorInfo({id:u.id,username:u.name,displayName:u.name_show,avatarUrl:u.portrait && (/^https?:/.test(u.portrait) ? u.portrait : `https://tb.himg.baidu.com/sys/portrait/item/${u.portrait}`),profileUrl:u.name && `https://tieba.baidu.com/home/main?un=${encodeURIComponent(u.name)}`}) };
}
export default async function extract({ url }) {
  const kz = requireValue(new URL(url).pathname.match(/\/p\/(\d+)/)?.[1], 'unsupportedUrl');
  const { tbs } = await getJson('https://tieba.baidu.com/dc/common/tbs');
  const form = { pn: '1', lz: '0', r: '2', mark_type: '0', back: '0', fr: 'personalize_page', kz,
    session_request_times: '1', tbs: requireValue(tbs), subapp_type: 'pc', _client_type: '20' };
  const data = await getJson('https://tieba.baidu.com/c/f/pb/page_pc', { form: { ...form, sign: sign(form) } });
  requireValue(Number(data.error_code) === 0);
  return { ...decodeThread(requireValue(data.thread)), contentId: kz };
}
