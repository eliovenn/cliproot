import CryptoJS from 'crypto-js';
import { bridge, getJson, randomHex, requireValue } from './core.js';
const organization = '0yD85BjYvGFAvHaSQ1mc';
const publicKey = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCXj9exmI4nQjmT52iwr+yf7hAQ06bfSZHTAHUfRBYiagCf/whhd8es0R79wBigpiHLd28TKA8b8mGR8OiiI1hV+qfynCWihvp3mdj8MiiH6SU3lhro2hkfYzImZB0RmWr2zE4Xt1+A6Oyp6bf+W7JSxYUXHw3nNv7Td4jw4jEFKQIDAQAB';
const rules = { appId: ['xx','uy7mzc4h'], box: ['jf'], canvas: ['yk','snrn887t'], clientSize: ['zx','cpmjjgsu'], organization: ['dp','78moqjfc'], os: ['pj','je6vk6t4'], platform: ['gm','pakxhcd2'], plugins: ['kq','v51m3pzl'], pmf: ['vw','2mdeslu3'], protocol: ['protocol'], referer: ['ab','y7bmrjlc'], res: ['hf','whxqm2a7'], rtype: ['lo','x8o2h2bl'], sdkver: ['sc','9q3dcxp2'], status: ['an','2jbrxxw4'], subVersion: ['ns','eo3i2puh'], svm: ['qr','fzj3kaeh'], time: ['nb','q2t3odsk'], timezone: ['as','1uv05lj5'], tn: ['py','x9nzj1bp'], trees: ['pi','acfs0xo4'], ua: ['bj','k92crp1t'], url: ['cf','y95hjkoo'], version: ['version'], vpw: ['ca','r9924ab5'] };
const utf8 = CryptoJS.enc.Utf8.parse;
function modPow(b, e, n) { let r = 1n; for (; e > 0n; e >>= 1n, b = b * b % n) if (e & 1n) r = r * b % n; return r; }
async function encryptUid(uid) {
  const der = Buffer.from(publicKey, 'base64');
  // SPKI RSA-1024 modulus INTEGER follows the embedded RSAPublicKey sequence.
  const marker = [...der].findIndex((b,i) => b === 2 && der[i+1] === 129 && der[i+2] === 129 && der[i+3] === 0); requireValue(marker >= 0);
  const modulus = BigInt('0x' + der.subarray(marker + 4, marker + 132).toString('hex'));
  const paddingLength = 128 - Buffer.byteLength(uid) - 3, padding = [];
  while (padding.length < paddingLength) for (const b of Buffer.from(await randomHex(paddingLength), 'hex')) if (b && padding.length < paddingLength) padding.push(b);
  const block = Buffer.concat([Buffer.from([0,2,...padding,0]), Buffer.from(uid)]);
  return Buffer.from(modPow(BigInt('0x' + block.toString('hex')), 65537n, modulus).toString(16).padStart(256, '0'), 'hex').toString('base64');
}
async function uuid() { const s = await randomHex(16); return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20)}`; }
export async function deviceId() {
  const uid = await uuid(), key = CryptoJS.MD5(uid).toString().slice(0,16), now = Date.now(), d = new Date(now);
  const timestamp = [d.getFullYear(),d.getMonth()+1,d.getDate(),d.getHours(),d.getMinutes(),d.getSeconds()].map((v) => String(v).padStart(2,'0')).join('');
  const smidBase = timestamp + CryptoJS.MD5(await uuid()).toString() + '00';
  const data = { plugins: 'MicrosoftEdgePDFPluginPortableDocumentFormatinternal-pdf-viewer1,MicrosoftEdgePDFViewermhjfbmdgcfjbbpaeojofohoefgiehjai1',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
    canvas: '259ffe69', timezone: -480, platform: 'Win32', url: 'https://www.skland.com/', referer: '', res: '1920_1080_24_1.25', clientSize: '0_0_1080_1920_1920_1080_1920_1080', status: '0011',
    vpw: await uuid(), svm: now, trees: await uuid(), pmf: now, protocol: 102, organization, appId: 'heybox_website', os: 'web', version: '3.0.0', sdkver: '3.0.0', box: '', rtype: 'all',
    smid: smidBase + CryptoJS.MD5('smsk_web_' + smidBase).toString().slice(0,14) + '0', subVersion: '1.0.0', time: 0 };
  data.tn = CryptoJS.MD5(Object.keys(data).sort().map((k) => typeof data[k] === 'number' ? String(data[k] * 10000) : data[k]).join('')).toString();
  const encrypted = {};
  for (const [k,v] of Object.entries(data)) {
    const [name, secret] = rules[k] || [k];
    if (!secret) { encrypted[name] = v; continue; }
    // Upstream encryptor consumes complete blocks after appending eight zero bytes.
    const bytes = Buffer.concat([Buffer.from(String(v)), Buffer.alloc(8)]), aligned = bytes.subarray(0, bytes.length - bytes.length % 8);
    encrypted[name] = CryptoJS.TripleDES.encrypt(CryptoJS.lib.WordArray.create(aligned), utf8(secret.repeat(3)), { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding }).ciphertext.toString(CryptoJS.enc.Base64);
  }
  const compressed = await bridge('codec.gzip', { text: JSON.stringify(encrypted) });
  const bytes = Buffer.from(compressed), padded = Buffer.concat([bytes, Buffer.alloc(16 - bytes.length % 16)]);
  const cipher = CryptoJS.AES.encrypt(CryptoJS.lib.WordArray.create(padded), utf8(key), { iv: utf8('0102030405060708'), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding }).ciphertext.toString();
  const result = await getJson('https://fp-it.portal101.cn/deviceprofile/v4', { json: { appId: 'heybox_website', compress: 2, data: cipher, encode: 5, ep: await encryptUid(uid), organization, os: 'web' } });
  requireValue(result.code === 1100); return 'B' + requireValue(result.detail?.deviceId);
}
