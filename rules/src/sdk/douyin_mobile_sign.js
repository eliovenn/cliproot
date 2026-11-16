// Protocol port of SignerPy 0.12.0 (MIT): Gorgon, Ladon, Argus and Simon.
import CryptoJS from 'crypto-js';
import { sm3 } from './sm3.js';
const mask = (1n << 64n) - 1n;
const ror = (v, n) => (v >> BigInt(n) | v << BigInt(64 - n)) & mask;
const rol = (v, n) => ror(v, 64 - n);
const md5 = (v) => CryptoJS.MD5(typeof v === 'string' ? v : CryptoJS.lib.WordArray.create(v)).toString();
const word = (b, i) => [...b.subarray(i, i + 8)].reduceRight((v, n) => v << 8n | BigInt(n), 0n);
const le = (n, length = 8) => Buffer.from(Array.from({ length }, (_, i) => Number(BigInt(n) >> BigInt(i * 8) & 255n)));
const pad = (b) => Buffer.concat([b, Buffer.alloc(16 - b.length % 16, 16 - b.length % 16)]);

export function gorgon(query, time, version, entropy, body = '', cookies = '') {
  const bytes = [...Buffer.from(md5(query).slice(0, 8), 'hex'),
    ...(body ? Buffer.from(md5(body).slice(0, 8), 'hex') : [0,0,0,0]),
    ...(cookies ? Buffer.from(md5(cookies).slice(0, 8), 'hex') : [0,0,0,0]),
    ...(version === 8404 ? [1,1,2,4] : [0,6,11,28]), time >>> 24, time >>> 16 & 255, time >>> 8 & 255, time & 255];
  if (version === 8404) return '8404' + Buffer.from([entropy[1] & 240, entropy[0] % 255, 0, 0, ...bytes]).toString('hex');
  const key = [223,119,185,64,185,155,132,131,209,185,203,209,247,194,185,133,195,208,251,195];
  const result = bytes.map((b, i) => b ^ key[i]);
  for (let i = 0; i < 20; i++) {
    const c = (result[i] << 4 | result[i] >> 4) & 255, e = c ^ result[(i + 1) % 20];
    const reversed = [...e.toString(2).padStart(8, '0')].reverse().join('');
    result[i] = (~parseInt(reversed, 2) ^ 20) & 255;
  }
  return '0404b0d30000' + Buffer.from(result).toString('hex');
}

export function ladon(time, license, aid, entropy) {
  const seed = Buffer.from(entropy).subarray(0, 4), digest = Buffer.from(md5(Buffer.concat([seed, Buffer.from(String(aid))])));
  const keys = [word(digest, 0)], queue = [word(digest, 16), word(digest, 24)];
  let b0 = keys[0], b8 = word(digest, 8);
  for (let i = 0; i < 34; i++) {
    const x = ((ror(b8, 8) + b0) & mask) ^ BigInt(i);
    queue.push(x); b0 = x ^ ror(b0, 61); keys.push(b0); b8 = queue.shift();
  }
  const raw = Buffer.from(`${time}-${license}-${aid}`);
  const data = raw.length % 16 ? pad(raw) : raw, output = [seed];
  for (let i = 0; i < data.length; i += 16) {
    let a = word(data, i), b = word(data, i + 8);
    for (let j = 0; j < 34; j++) { b = (keys[j] ^ (a + ror(b, 8))) & mask; a = b ^ ror(a, 61); }
    output.push(le(a), le(b));
  }
  return Buffer.concat(output).toString('base64');
}

function varint(value) {
  const bytes = []; let n = BigInt(value);
  do { bytes.push(Number(n & 127n) | (n > 127n ? 128 : 0)); n >>= 7n; } while (n);
  return Buffer.from(bytes);
}
function protobuf(data) {
  const parts = [];
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number' || typeof value === 'bigint') parts.push(varint(Number(key) * 8), varint(value));
    else {
      const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.isBuffer(value) ? value : protobuf(value);
      parts.push(varint(Number(key) * 8 + 2), varint(bytes.length), bytes);
    }
  }
  return Buffer.concat(parts);
}
export function argus(query, time, random, secDeviceId, body = '', aid = 1128, license = 1611921764) {
  const params = new URLSearchParams(query);
  const bean = {1: 0x20200929 * 2, 2: 2, 3: random, 4: String(aid), 5: params.get('device_id'), 6: String(license),
    7: params.get('version_name'), 8: 'v05.01.02-alpha.7-ov-android', 9: 83952160, 10: Buffer.alloc(8), 11: 0, 12: time * 2,
    13: Buffer.from(sm3(Buffer.from(md5(body), 'hex')).slice(0, 6)), 14: Buffer.from(sm3(query).slice(0, 6)),
    15: {1: 1, 2: 1, 3: 1, 7: 3348294860}, 16: secDeviceId, 20: 'none', 21: 738, 23: {1: 'NX551J', 2: 8196, 4: 2162219008}, 25: 2};
  const data = pad(protobuf(bean)), keyBytes = Buffer.from('fc78e0a9657a0c748ce51559903ccf03510e51d3cff232d71343e88a321c5304', 'hex');
  const keys = [0,8,16,24].map((i) => word(keyBytes, i));
  for (let i = 4; i < 72; i++) {
    let t = ror(keys[i - 1], 3) ^ keys[i - 3]; t ^= ror(t, 1);
    keys.push((~keys[i - 4] & mask) ^ t ^ (0x3dc94c3a046d678bn >> BigInt((i - 4) % 62) & 1n) ^ 3n);
  }
  const encrypted = [];
  for (let i = 0; i < data.length; i += 16) {
    let a = word(data, i), b = word(data, i + 8);
    for (let j = 0; j < 72; j++) [a, b] = [b, a ^ (rol(b, 1) & rol(b, 8)) ^ rol(b, 2) ^ keys[j]];
    encrypted.push(le(a), le(b));
  }
  const prefix = Buffer.from('f2f7fcfff2f7fcff', 'hex'), mixed = Buffer.concat([prefix, ...encrypted]);
  for (let i = 8; i < mixed.length; i++) mixed[i] ^= prefix[i % 8];
  const final = Buffer.concat([Buffer.from('a66ead9f7701d00c18', 'hex'), mixed.reverse(), Buffer.from('ao')]);
  const signKey = Buffer.from('ac1adaae95a7af94a5114ab3b3a97dd80050aa0a39314c40528caec95256c28c', 'hex');
  const cipher = CryptoJS.AES.encrypt(CryptoJS.lib.WordArray.create(final), CryptoJS.enc.Hex.parse(md5(signKey.subarray(0, 16))),
    { iv: CryptoJS.enc.Hex.parse(md5(signKey.subarray(16))), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).ciphertext;
  return Buffer.concat([Buffer.from([242, 129]), Buffer.from(cipher.toString(), 'hex')]).toString('base64');
}

export function mobileSign(query, time, version, entropy, secDeviceId) {
  const bytes = Buffer.from(entropy), random = (bytes[4] | bytes[5] << 8 | bytes[6] << 16 | bytes[7] << 24) >>> 1;
  return {'x-ss-req-ticket': String(time * 1000), 'x-khronos': String(time),
    'x-gorgon': gorgon(query, time, version, bytes.subarray(8)), 'x-ss-stub': md5('').toUpperCase(),
    'x-ladon': ladon(time, 1611921764, 1128, bytes), 'x-argus': argus(query, time, random, secDeviceId)};
}
