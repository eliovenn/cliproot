import CryptoJS from 'crypto-js';
const table = 'AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89';
const map = (s, cut = 0) => { const t = cut ? table.slice(0, cut) : table; return [...s].map((c) => t[c.charCodeAt(0) % t.length]).join(''); };
const xtime = (e) => (e & 128 ? e << 1 ^ 27 : e << 1) & 255;
const mul3 = (e) => xtime(e) ^ e, mul6 = (e) => mul3(xtime(e)), mul12 = (e) => mul6(mul3(xtime(e))), mul14 = (e) => mul12(e) ^ mul6(e) ^ mul3(e);
export function heyboxSign(path, time, nonce) {
  path = '/' + path.split('/').filter(Boolean).join('/') + '/';
  const mapped = [map(String(time + 1), -2), map(path), map(nonce)]; let interleaved = '';
  for (let i = 0; i < Math.max(...mapped.map((v) => v.length)); i++) for (const s of mapped) interleaved += s[i] || '';
  const digest = CryptoJS.MD5(interleaved.slice(0, 20)).toString(), e = [...digest.slice(-6)].map((c) => c.charCodeAt(0));
  const mixed = [mul14(e[0]) ^ mul12(e[1]) ^ mul6(e[2]) ^ mul3(e[3]), mul3(e[0]) ^ mul14(e[1]) ^ mul12(e[2]) ^ mul6(e[3]),
    mul6(e[0]) ^ mul3(e[1]) ^ mul14(e[2]) ^ mul12(e[3]), mul12(e[0]) ^ mul6(e[1]) ^ mul3(e[2]) ^ mul14(e[3]), ...e.slice(4)];
  return { hkey: map(digest.slice(0, 5), -4) + String(mixed.reduce((a, b) => a + b, 0) % 100).padStart(2, '0'), _time: time, nonce };
}
