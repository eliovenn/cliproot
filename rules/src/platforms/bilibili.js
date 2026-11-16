import CryptoJS from 'crypto-js';
import { request, getJson, requireValue, variants, image, livePhoto, assigned, fallback, setCookie, now, SourceError } from '../sdk/core.js';
import { article, documentOf } from '../sdk/html.js';
import { authorInfo } from '../sdk/author.js';
const creator = (u = {}) => authorInfo({id:u.mid,displayName:u.name,avatarUrl:u.face,profileUrl:u.mid && `https://space.bilibili.com/${u.mid}`});
const headers = { Referer: 'https://www.bilibili.com/' };
export function wbiSign(params, imgKey, subKey, time = now()) {
  const table = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
  const key = table.map((i) => (imgKey + subKey)[i]).join('').slice(0,32);
  requireValue(key.length === 32);
  const fields = {...params, wts: time};
  const query = Object.keys(fields).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(fields[k]).replace(/[!'()*]/g,''))}`).join('&');
  return `${query}&w_rid=${CryptoJS.MD5(query + key)}`;
}
async function wbiPlay(params) {
  const nav = await getJson('https://api.bilibili.com/x/web-interface/nav', {headers});
  const keys = requireValue(nav.data?.wbi_img);
  const keyOf = (url) => new URL(requireValue(url)).pathname.split('/').at(-1).split('.')[0];
  const data = await getJson(`https://api.bilibili.com/x/player/wbi/playurl?${wbiSign(params,keyOf(keys.img_url),keyOf(keys.sub_url))}`, {headers});
  if (data.code !== 0) throw new SourceError(data.code === -101 ? 'authenticationRequired' : 'sourceError');
  return decodePlay(requireValue(data.data));
}
async function api(path, params = {}) {
  const json = await getJson(`https://api.bilibili.com${path}?${new URLSearchParams(params)}`, { headers });
  if (json.code !== 0) throw new SourceError([-101, -104].includes(json.code) ? 'authenticationRequired' : [-404, 62002, 4101152].includes(json.code) ? 'contentUnavailable' : [-352, -412].includes(json.code) ? 'rateLimited' : 'sourceError');
  return requireValue(json.data || json.result);
}
export function decodePlay(data) {
  const media = [], dash = data.dash;
  if (dash) {
    const make = (v, audio) => variants(v.baseUrl || v.base_url, { headers, mimeType: v.mimeType || v.mime_type, width: v.width, height: v.height,
      codecs: v.codecs, bitrate: v.bandwidth, hasVideo: !audio, hasAudio: audio, audioGroupId: 'bilibili-dash',
      durationMs: Number(dash.duration || 0) * 1000, backupUrls: v.backupUrl || v.backup_url || [] });
    const video = (dash.video || []).flatMap((v) => make(v, false));
    const audio = [...(dash.audio || []), ...(dash.dolby?.audio || []), ...(dash.flac?.audio ? [dash.flac.audio] : [])].flatMap((v) => make(v, true));
    if (video.length) media.push({ kind: 'video', variants: video });
    if (audio.length) media.push({ kind: 'audio', variants: audio });
  }
  for (const segment of data.durl || []) media.push({ kind: 'video', variants: variants(segment.url, { headers, backupUrls: segment.backup_url || [], durationMs: segment.length }) });
  requireValue(media.length > 0); return media;
}
export function decodeDynamic(item) {
  const d = requireValue(item.modules?.module_dynamic), major = d.major || {}, opus = major.opus;
  let title = '', body = d.desc?.text || '', media = [];
  if (opus) {
    title = opus.title || ''; body = opus.summary?.text || body;
    media = (opus.pics || []).map((p) => p.live_url ? livePhoto(p.url, p.live_url, { width: p.width, height: p.height, headers }) : image(p.url, { width: p.width, height: p.height, headers }));
  } else {
    const m = major.archive || major.draw || major.pgc || major.common || major.music || major.live || major.medialist || major.courses || major.ugc_season || major.upower_common || {};
    title = m.title || ''; body ||= m.desc || m.sub_title || '';
    media = (m.items || []).map((p) => image(p.src || p.url, { headers }));
    if (m.cover) media.push(image(m.cover, { headers }));
  }
  return { title, text: body, authorInfo: creator(item.modules.module_author), media };
}
export default async function extract({ url }, attempts) {
  if (!new URL(url).hostname.endsWith('bilibili.com')) url = (await request(url)).url;
  const u = new URL(url), dynamic = u.pathname.match(/\/(?:opus|dynamic)\/(\d+)/)?.[1] || (u.hostname === 't.bilibili.com' ? u.pathname.match(/\/(\d+)/)?.[1] : null);
  if (dynamic) {
    const fingerprint = await api('/x/frontend/finger/spi');
    for (const [name, value] of [['buvid3', fingerprint.b_3], ['buvid4', fingerprint.b_4]]) if (value) await setCookie(name, value, 'https://api.bilibili.com/');
    const data = await api('/x/polymer/web-dynamic/v1/detail', { id: dynamic, timezone_offset: '-480', features: 'itemOpusStyle' });
    return { ...decodeDynamic(requireValue(data.item)), resolvedUrl: url, contentId: dynamic };
  }
  if (/\/read\//.test(u.pathname)) {
    const page = await request(url), doc = documentOf(page.body);
    let user; try {user = assigned(page.body,'__INITIAL_STATE__').readInfo?.author;} catch { /* Older article DOM has no structured author. */ }
    const byline = doc.querySelector('.up-name');
    return { ...article(requireValue(doc.querySelector('.article-holder')).innerHTML, url, doc.querySelector('.title')?.textContent || ''),
      authorInfo:creator(user) || authorInfo({displayName:byline?.textContent,profileUrl:byline?.getAttribute('href'),avatarUrl:doc.querySelector('.up-face img')?.getAttribute('src')}),resolvedUrl:url };
  }
  const id = requireValue(u.pathname.match(/\/video\/((?:BV[\w]+)|(?:av\d+))/i)?.[1], 'unsupportedUrl');
  const identity = id.toLowerCase().startsWith('av') ? { aid: id.slice(2) } : { bvid: id };
  const info = await api('/x/web-interface/view', identity), index = Math.max(0, Number(u.searchParams.get('p') || 1) - 1);
  const part = requireValue(info.pages?.[index], 'contentUnavailable');
  const media = await fallback([
    ['wbi-dash-api', () => wbiPlay({ ...identity, cid: part.cid, qn: 127, fnval: 4048, fourk: 1 })],
    ['dash-api', async () => decodePlay(await api('/x/player/playurl', { ...identity, cid: part.cid, qn: 127, fnval: 4048, fourk: 1 }))],
    ['page-playinfo', async () => decodePlay(assigned((await request(url)).body, '__playinfo__').data)],
    ['progressive-api', async () => decodePlay(await api('/x/player/playurl', { ...identity, cid: part.cid, qn: 16, fnval: 1 }))],
  ], attempts);
  return { contentId: `${info.bvid}:${part.cid}`, title: info.pages.length > 1 ? `${info.title} · ${part.part}` : info.title,
    text: info.desc || '', authorInfo: creator(info.owner), cover: info.pic, resolvedUrl: url, kind: 'video', media };
}
