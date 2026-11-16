const rot = (x, n) => (x << (n % 32) | x >>> ((32 - n) % 32)) >>> 0;
const p0 = (x) => x ^ rot(x, 9) ^ rot(x, 17);
const p1 = (x) => x ^ rot(x, 15) ^ rot(x, 23);
export function sm3(input) {
  const bytes = [...(typeof input === 'string' ? Buffer.from(input, 'utf8') : input)], length = bytes.length * 8;
  bytes.push(128); while (bytes.length % 64 !== 56) bytes.push(0);
  bytes.push(0, 0, 0, 0, length >>> 24, length >>> 16 & 255, length >>> 8 & 255, length & 255);
  const state = [0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600, 0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = new Uint32Array(68);
    for (let i = 0; i < 16; i++) { const j = offset + i * 4; w[i] = bytes[j] << 24 | bytes[j + 1] << 16 | bytes[j + 2] << 8 | bytes[j + 3]; }
    for (let i = 16; i < 68; i++) w[i] = p1(w[i - 16] ^ w[i - 9] ^ rot(w[i - 3], 15)) ^ rot(w[i - 13], 7) ^ w[i - 6];
    let [a, b, c, d, e, f, g, h] = state;
    for (let j = 0; j < 64; j++) {
      const ss1 = rot((rot(a, 12) + e + rot(j < 16 ? 0x79cc4519 : 0x7a879d8a, j)) >>> 0, 7), ss2 = ss1 ^ rot(a, 12);
      const ff = j < 16 ? a ^ b ^ c : (a & b) | (a & c) | (b & c), gg = j < 16 ? e ^ f ^ g : (e & f) | (~e & g);
      const t1 = (ff + d + ss2 + (w[j] ^ w[j + 4])) >>> 0, t2 = (gg + h + ss1 + w[j]) >>> 0;
      [a, b, c, d, e, f, g, h] = [t1, a, rot(b, 9), c, p0(t2) >>> 0, e, rot(f, 19), g];
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => state[i] = (state[i] ^ v) >>> 0);
  }
  return state.flatMap((v) => [v >>> 24, v >>> 16 & 255, v >>> 8 & 255, v & 255]);
}
export function rc4(data, key) {
  const s = Array.from({ length: 256 }, (_, i) => i); let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; [s[i], s[j]] = [s[j], s[i]]; }
  let i = 0; j = 0;
  return [...data].map((b) => { i = (i + 1) & 255; j = (j + s[i]) & 255; [s[i], s[j]] = [s[j], s[i]]; return b ^ s[(s[i] + s[j]) & 255]; });
}
export function aBogus(query, start = Date.now(), end = start + 6, randoms = [Math.random() * 10000, Math.random() * 10000, Math.random() * 10000]) {
  const browser = '1536|742|1536|864|0|0|0|0|1536|864|1536|864|1536|742|24|24|MacIntel';
  const p = sm3(sm3(`${query}cus`)), m = sm3(sm3('GETcus'));
  const a = [44, end >>> 24 & 255, 0, 0, 0, 0, 24, p[21], m[21], 0, 40, end >>> 16 & 255, 0, 0, 0, 1, 0, 239, p[22], m[22], 49, end >>> 8 & 255, 0, 0, 0, 0, end & 255, 0, 0, 14, start >>> 24 & 255, start >>> 16 & 255, 0, start >>> 8 & 255, start & 255, 3, Math.floor(end / 2 ** 32), 1, Math.floor(start / 2 ** 32), 1, browser.length, 0, 0, 0];
  const check = a.reduce((n, b) => n ^ b, 0);
  const prefix = randoms.flatMap((r, i) => [(r & 255 & 170) | 1, (r & 255 & 85) | (i === 0 ? 2 : 0), (r >> 8 & 170) | (i === 1 ? 0 : 5), (r >> 8 & 85) | (i === 0 ? 40 : 0)]);
  // FJS requires byte-range values; Node Buffer silently truncates high timestamp bytes.
  const data = [...prefix, ...rc4([...a, ...Buffer.from(browser), check], [121])].map((n) => n & 255);
  const alphabet = 'Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe';
  return Buffer.from(data).toString('base64').replace(/[A-Za-z0-9+/]/g, (c) => alphabet['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(c)]);
}
