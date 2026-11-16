import CryptoJS from 'crypto-js';
import { request, requireValue, parseJson, setCookie, SourceError } from '../sdk/core.js';
import { documentOf, scriptJson } from '../sdk/html.js';
import { decodeAweme } from '../sdk/bytedance.js';
export function solveChallenge(challenge, limit = 1000000) {
  const base = CryptoJS.algo.SHA256.create().update(CryptoJS.enc.Base64.parse(challenge.v.a));
  const target = CryptoJS.enc.Base64.parse(challenge.v.c).toString();
  for (let i = 0; i <= limit; i++) if (base.clone().finalize(String(i)).toString() === target) return { ...challenge, d: Buffer.from(String(i)).toString('base64') };
  throw new SourceError('rateLimited');
}
export default async function extract({ url }) {
  if (!/\/(?:video|photo)\/\d+/.test(url)) url = (await request(url)).url;
  const id = requireValue(new URL(url).pathname.match(/\/(?:video|photo)\/(\d+)/)?.[1], 'unsupportedUrl');
  const target = `https://www.tiktok.com/@_/video/${id}`;
  for (let retry = 0; retry < 3; retry++) {
    const page = await request(target, { headers: { Referer: 'https://www.tiktok.com/', 'Accept-Language': 'en-US,en;q=0.9' } });
    if (new URL(page.url).pathname === '/login') throw new SourceError('authenticationRequired');
    const doc = documentOf(page.body);
    if (doc.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__')) {
      const data = scriptJson(page.body, '#__UNIVERSAL_DATA_FOR_REHYDRATION__').__DEFAULT_SCOPE__?.['webapp.video-detail'];
      const item = requireValue(data?.itemInfo?.itemStruct, data?.statusCode === 10204 ? 'contentUnavailable' : 'authenticationRequired');
      requireValue(String(item.id || item.aweme_id) === id);
      return { ...decodeAweme(item), resolvedUrl: url };
    }
    const attr = (id) => doc.querySelector(`#${id}`)?.getAttribute('class');
    const encoded = attr('cs'), name = attr('wci'); requireValue(encoded && name, 'rateLimited');
    const solved = solveChallenge(parseJson(Buffer.from(encoded, 'base64').toString('utf8')));
    await setCookie(name, Buffer.from(JSON.stringify(solved)).toString('base64'), target);
    if (attr('rci') && attr('rs')) await setCookie(attr('rci'), attr('rs'), target);
  }
  throw new SourceError('rateLimited');
}
