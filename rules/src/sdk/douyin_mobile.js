import { getJson, request, randomHex, now, fallback, requireValue } from './core.js';
import { decodeAweme } from './bytedance.js';
import { mobileSign } from './douyin_mobile_sign.js';
const ua = 'com.ss.android.ugc.aweme/390500 (Linux; U; Android 13; zh_CN; Pixel 6; Build/TQ3A.230805.001; Cronet/TTNetVersion:6b6f6e6e 2024-04-10 QuicVersion:47946d2a 2024-03-28)';
const detailHosts = ['api.amemv.com', 'api3-core-c.amemv.com', 'aweme.snssdk.com', 'api5-normal-lf.amemv.com', 'api3-normal-c.amemv.com'];
const defaults = { aid: '1128', app_name: 'aweme', version_code: '390500', version_name: '39.5.0', device_platform: 'android',
  os: 'android', os_version: '13', ssmix: 'a', language: 'zh', channel: 'wandoujia_aweme', device_type: 'Pixel 6', device_brand: 'google',
  resolution: '1080*2400', dpi: '420', host_abi: 'arm64-v8a', manifest_version_code: '390500', update_version_code: '390500', ac: 'wifi', app_type: 'normal' };
async function uuid() { const h = await randomHex(16); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20)}`; }
async function params(extra = {}) {
  return {...defaults, _rticket: Date.now(), cdid: await uuid(), ts: now(), iid: String(BigInt('0x' + await randomHex(8))),
    device_id: String(BigInt('0x' + await randomHex(8))), openudid: await randomHex(8), ...extra};
}
async function headers(query, profile, deviceId, secDeviceId) {
  const t = now(), entropy = Buffer.from(await randomHex(16), 'hex');
  const trace = `${(Date.now() % 4294967295).toString(16).padStart(8,'0')}${BigInt(deviceId).toString(16)}${await randomHex(8)}`.slice(0, 30);
  return {...mobileSign(query, t, profile, entropy, secDeviceId), 'User-Agent': ua, 'x-tt-trace-id': `00-${trace}-${trace.slice(0,16)}-01`, 'sdk-version': '2', 'passport-sdk-version': '203226'};
}
async function register(secDeviceId, attempts) {
  return fallback(['log.snssdk.com', 'api.amemv.com'].map((host) => [`register-${host}`, async () => {
    const p = await params({cpu_support64: 'true'}), query = new URLSearchParams(p).toString();
    const payload = {magic_tag: 'ss_app_log', header: {display_name: '抖音', aid: 1128, channel: defaults.channel, package: 'com.ss.android.ugc.aweme',
      app_version: '39.5.0', version_code: 390500, manifest_version_code: 390500, update_version_code: 390500, sdk_version: '3.9.5', sdk_target_version: 29,
      os: 'Android', os_version: '13', os_api: 33, device_model: 'Pixel 6', device_brand: 'google', device_manufacturer: 'Google', cpu_abi: 'arm64-v8a',
      release_build: 'TQ3A.230805.001', density_dpi: 420, display_density: 'xhdpi', resolution: '1080x2400', language: 'zh', timezone: 8, region: 'CN',
      tz_name: 'Asia/Shanghai', cdid: p.cdid, openudid: p.openudid, clientudid: await uuid(), google_aid: '', req_id: await uuid()}, _gen_time: now()};
    const data = await getJson(`https://${host}/service/2/device_register/?${query}`, {json: payload, headers: await headers(query, 8404, p.device_id, secDeviceId)});
    const device_id = String(data.device_id_str || data.device_id || ''), iid = String(data.install_id_str || data.install_id || data.iid || '');
    requireValue(device_id && iid && device_id !== '0' && iid !== '0'); return {device_id, iid, cdid: p.cdid, openudid: p.openudid};
  }]), attempts);
}
export async function mobileDetail(id, options, attempts) {
  const secDeviceId = options.secDeviceId || 'AadCFwpTyztA5j9L' + (await randomHex(5)).slice(0,9);
  const configured = options.mobileDevice;
  const stages = Array.from({length: configured ? 1 : 2}, (_, index) => [`mobile-device-${index + 1}`, async () => {
    const device = configured ? {device_id: requireValue(configured.deviceId), iid: requireValue(configured.iid),
      ...(configured.cdid ? {cdid: configured.cdid} : {}), ...(configured.openudid ? {openudid: configured.openudid} : {})} : await register(secDeviceId, attempts);
    const p = await params({aweme_id: id, is_guest_mode: '0', minor_status: '0', ...device}), query = new URLSearchParams(p).toString();
    const detail = await fallback([8404,4404].flatMap((profile) => detailHosts.map((host) => [`mobile-${profile}-${host}`, async () => {
      const data = await getJson(`https://${host}/aweme/v1/aweme/detail/?${query}`, {headers: await headers(query, profile, p.device_id, secDeviceId)});
      return requireValue(data.aweme_detail, data.filter_detail ? 'contentUnavailable' : 'sourceError');
    }])), attempts);
    if (detail.is_story || detail.is_24_story) {
      const v = detail.video || {}, uri = v.play_addr?.uri || v.bit_rate?.find((r) => r.play_addr?.uri)?.play_addr.uri;
      if (uri) {
        const addresses = [];
        for (const ratio of ['default','1080p','720p','540p','480p']) {
          try {
            const r = await request(`https://aweme.snssdk.com/aweme/v1/play/?video_id=${encodeURIComponent(uri)}&ratio=${ratio}&line=0`,
              {method: 'HEAD', headers: {Referer: 'https://www.douyin.com/'}});
            addresses.push({url: r.url, size: Number(r.headers['content-length']) || 0});
          } catch (e) { if (['cancelled','timeout','closed'].includes(e.code)) throw e; }
        }
        addresses.sort((a,b) => b.size - a.size);
        if (addresses.length) v.bit_rate = [{play_addr: {url_list: addresses.map((a) => a.url), width: v.width, height: v.height}, duration: v.duration}, ...(v.bit_rate || [])];
      }
    }
    return decodeAweme(detail);
  }]);
  return fallback(stages, attempts);
}
