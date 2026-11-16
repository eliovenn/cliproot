import CryptoJS from 'crypto-js';
import { request, getJson, assigned, parseJson, cookie, requireValue, fallback, find, MOBILE_UA } from '../sdk/core.js';
import { documentOf } from '../sdk/html.js';
import { decodeAweme } from '../sdk/bytedance.js';
import { aBogus } from '../sdk/sm3.js';
import { mobileDetail } from '../sdk/douyin_mobile.js';
const base = 'https://www.douyin.com/';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0';
async function detail(id) {
  const params = { device_platform: 'webapp', aid: '6383', channel: 'channel_pc_web', pc_client_type: '1', version_code: '290100', version_name: '29.1.0',
    cookie_enabled: 'true', screen_width: '1920', screen_height: '1080', browser_language: 'zh-CN', browser_platform: 'Win32', browser_name: 'Chrome', browser_version: '130.0.0.0', browser_online: 'true', engine_name: 'Blink', engine_version: '130.0.0.0', os_name: 'Windows', os_version: '10', cpu_core_num: '12', device_memory: '8', platform: 'PC', downlink: '10', effective_type: '4g', aweme_id: id };
  params.a_bogus = aBogus(new URLSearchParams(params).toString());
  const fp = await cookie('s_v_web_id', base); if (fp) { params.verifyFp = fp; params.fp = fp; }
  let uifid;
  for (const key of ['uifid', 'uifid_temp', 'uifidtemp', 'UIFID', 'UIFID_TEMP', 'UIFIDTEMP']) { uifid = await cookie(key, base); if (uifid) break; }
  const headers = { Referer: base, 'User-Agent': ua };
  const encode = (s) => encodeURIComponent(s).replace(/[!'()~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  if (uifid) { params.uifid = uifid; params.timestamp = String(Math.floor(Date.now() / 1000)); }
  let query = Object.entries(params).map(([k, v]) => `${encode(k)}=${encode(v)}`).join('&');
  if (uifid) {
    const sig = CryptoJS.MD5(`${uifid}_${params.timestamp}_A96D855A08C0A9707F8BEF0D9A527E4E_${query}`).toString();
    Object.assign(headers, { uifid, 'x-secsdk-web-signature': sig, 'x-secsdk-web-expire': params.timestamp }); query += `&x-secsdk-web-signature=${sig}`;
  }
  const data = await getJson(`${base}aweme/v1/web/aweme/detail/?${query}`, { headers });
  return decodeAweme(requireValue(data.aweme_detail, 'authenticationRequired'));
}
export default async function extract({ url, options }, attempts) {
  let page;
  if (!/\/(?:video|note)\/\d+|[?&](?:modal_id|vid)=\d+/.test(url)) { page = await request(url); url = page.url; }
  const u = new URL(url), id = requireValue(u.pathname.match(/\/(?:video|note)\/(\d+)/)?.[1] || u.searchParams.get('modal_id') || u.searchParams.get('vid'), 'unsupportedUrl');
  function decode(html) {
    const doc = documentOf(html), render = doc.querySelector('#RENDER_DATA');
    const state = render ? parseJson(decodeURIComponent(render.textContent)) : assigned(html, html.includes('_ROUTER_DATA') ? '_ROUTER_DATA' : '__INITIAL_STATE__');
    const item = requireValue(find(state, (v) => String(v.aweme_id || v.awemeId || v.id) === id && (v.video || v.images)));
    return decodeAweme(item);
  }
  return { ...await fallback([
    ['web-api', () => detail(id)],
    ['share-page', async () => decode((await request(`https://www.iesdouyin.com/share/video/${id}/`, { headers: { 'User-Agent': MOBILE_UA } })).body)],
    ['desktop-state', async () => decode((page || await request(url, { headers: { 'User-Agent': ua } })).body)],
    ['mobile-story', () => mobileDetail(id, options, attempts)],
  ], attempts), resolvedUrl: url };
}
