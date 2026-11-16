/*! xhshow 0.2.0 protocol port. MIT License, Copyright (c) 2024 Cloxl.
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import CryptoJS from 'crypto-js';
import { rc4 } from './sm3.js';
import { randomHex, getJson, cookie, setCookie, requireValue, SourceError } from './core.js';
const standard = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const alphabet = 'ZmserbBoHQtNP+wOcza/LpngG8yJq42KWYj0DSfdikx3VT16IlUAFM97hECvuRX5';
const x3Alphabet = 'MfgqrsbcyzPQRStuvC7mn501HIJBo2DEFTKdeNOwxWXYZap89+/A4UVLhijkl63G';
const xorKey = '71a302257793271ddd273bcee3e4b98d9d7935e1da33f5765e2ea8afb6dc77a51a499d23b67c20660025860cbf13d4540d92497f58686c574e508f46e1956344f39139bf4faf22a3eef120b79258145b2feb5193b6478669961298e79bedca646e1a693a926154a5a7a1bd1cf0dedb742f917a747a1e388b234f2277516db7116035439730fa61e9822a0eca7bff72d8';
const md5 = (s) => CryptoJS.MD5(s).toString();
const encode = (data, chars = alphabet) => Buffer.from(data).toString('base64').replace(/[A-Za-z0-9+/]/g, (c) => chars[standard.indexOf(c)]);
const le = (n, length) => Array.from({length}, (_, i) => Number(BigInt(n) >> BigInt(i * 8) & 255n));
const rot = (x, n) => (x << n | x >>> (32 - n)) >>> 0;
const u32 = (b, i) => (b[i] | b[i+1] << 8 | b[i+2] << 16 | b[i+3] << 24) >>> 0;
export function crc32(text) {
  let n = 0xffffffff;
  for (const b of Buffer.from(text)) { n ^= b; for (let i = 0; i < 8; i++) n = n >>> 1 ^ (n & 1 ? 0xedb88320 : 0); }
  return (~n) >>> 0;
}
function customHash(b) {
  const l = b.length; let s0 = 1831565813 ^ l, s1 = 461845907 ^ l << 8, s2 = 2246822507 ^ l << 16, s3 = 3266489909 ^ l << 24;
  for (let i = 0; i < l; i += 8) {
    const v0 = u32(b, i), v1 = u32(b, i+4);
    s0 = rot((s0 + v0) ^ s2, 7); s1 = rot(((v0 ^ s1) >>> 0) + s3, 11);
    s2 = rot((s2 + v1) ^ s0, 13); s3 = rot(((s3 ^ v1) >>> 0) + s1, 17);
  }
  const t0 = s0 ^ l, t1 = s1 ^ t0, t2 = (s2 + (t1 >>> 0)) >>> 0, t3 = s3 ^ t2;
  const r0 = rot(t0,9), r1 = rot(t1,13), r2 = rot(t2,17), r3 = rot(t3,19);
  s0 = (r0 + r2) >>> 0; s1 = (r1 ^ r3) >>> 0; s2 = (r2 + s0) >>> 0; s3 = (r3 ^ s1) >>> 0;
  return [s0,s1,s2,s3].flatMap((s) => le(s,4));
}
export function xhsSign(path, payload, a1, {time = Date.now(), seed = 0, offset = 20, sequence = 20, props = 1100} = {}) {
  const content = path + JSON.stringify(payload), digest = Buffer.from(md5(content), 'hex'), pathDigest = Buffer.from(md5(path), 'hex');
  const ts = le(time,8), low = seed & 255;
  const field = (s, length) => [...Buffer.from(s).subarray(0,length), ...Array(Math.max(0,length - Buffer.byteLength(s))).fill(0)];
  const env = [115,248,83,102,103,201,181,131,99,94,4,68,250,132,21], checks = [0,1,18,1,0,0,0,0,0,0,3,0,0,0,0];
  const bytes = [121,104,96,41, ...le(seed,4), ...ts, ...le(time-offset*1000,8), ...le(sequence,4), ...le(props,4), ...le(Buffer.byteLength(content),4),
    ...[...digest.subarray(0,8)].map((b) => b ^ low), 52, ...field(a1,52), 10, ...field('xhs-pc-web',10), 1, low ^ env[0],
    ...env.slice(1).map((b,i) => b ^ checks[i+1]), 2,97,51,16, ...customHash([...ts,...pathDigest]).map((b) => b ^ low)];
  const key = Buffer.from(xorKey,'hex'), transformed = bytes.slice(0,144).map((b,i) => b ^ key[i]);
  return 'XYS_' + encode(JSON.stringify({x0:'4.3.5',x1:'xhs-pc-web',x2:'Windows',x3:'mns0301_' + encode(transformed,x3Alphabet),x4:'object'}));
}
export function xhsCommon(a1, time, count = 10) {
  const fp = {x33:'0',x34:'0',x35:'0',x36:String(count),x37:'0|0|0|0|0|0|0|0|0|1|0|0|0|0|0|0|0|0|1|0|0|0|0|0',
    x38:'0|0|1|0|1|0|0|0|0|0|1|0|1|0|1|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0',x39:0,x42:'3.4.4',x43:'742cc32c',
    x44:String(time),x45:'__SEC_CAV__1-1-1-1-1|__SEC_WSA__|',x46:'false',x48:'',x49:'{list:[],type:}',x50:'',x51:'',x52:'',x82:'_0x17a2|_0x1954'};
  const cipher = Buffer.from(rc4(Buffer.from(JSON.stringify(fp)),Buffer.from('xhswebmplfbt'))).toString('latin1');
  const encoded = encodeURIComponent(cipher), bytes = [];
  for (const chunk of encoded.split('%').slice(1)) { bytes.push(parseInt(chunk.slice(0,2),16)); for (const c of chunk.slice(2)) bytes.push(c.charCodeAt(0)); }
  const b1 = encode(bytes);
  return encode(JSON.stringify({s0:5,s1:'',x0:'1',x1:'4.3.5',x2:'Windows',x3:'xhs-pc-web',x4:'4.86.0',x5:a1,x6:'',x7:'',x8:b1,x9:crc32(b1)^0xedb88320,x10:0,x11:'normal'}));
}
export async function activateGuest() {
  const web = 'https://www.xiaohongshu.com/', api = 'https://edith.xiaohongshu.com';
  if (await cookie('web_session', web)) throw new SourceError('authenticationRequired');
  const time = Date.now(), chars = 'abcdefghijklmnopqrstuvwxyz0123456789', random = Buffer.from(await randomHex(40),'hex');
  const a = time.toString(16) + [...random.subarray(0,30)].map((b) => chars[b % chars.length]).join('') + '50000';
  const a1 = (a + crc32(a)).slice(0,52), cookies = {a1,webId:md5(a1),xsecappid:'xhs-pc-web'};
  for (const origin of [web,api]) for (const [name,value] of Object.entries(cookies)) await setCookie(name,value,origin);
  const path = '/api/sns/web/v1/login/activate', payload = {client_public_key_base64: Buffer.from(await randomHex(32),'hex').toString('base64')};
  await getJson(api + path, {json:payload,headers:{'x-s':xhsSign(path,payload,a1,{time,seed:u32(random,30)}),'x-s-common':xhsCommon(a1,time),
    'x-t':String(time),'x-b3-traceid':await randomHex(8),'x-xray-traceid':(BigInt(time)<<23n).toString(16).padStart(16,'0') + await randomHex(8),
    'x-mns':'unload','xy-direction':'50',Origin:'https://www.xiaohongshu.com',Referer:web}});
  const session = requireValue(await cookie('web_session',api),'authenticationRequired');
  await setCookie('web_session',session,web);
}
