// Shared source ABI v1. Platform code never receives another platform's cookies.
import JSONBig from 'json-bigint';
import { parseScript } from 'meriyah';
import { authorInfo } from './author.js';

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const json = JSONBig({ storeAsString: true, protoAction: 'ignore', constructorAction: 'ignore' });
export const parseJson = (text) => json.parse(text);

export class SourceError extends Error {
  constructor(code = 'sourceError') { super(code); this.code = code; }
}
export function requireValue(value, code = 'sourceError') {
  if (value === undefined || value === null || value === '' || value === false) throw new SourceError(code);
  return value;
}
export function httpError(status) {
  return new SourceError(status === 401 ? 'authenticationRequired'
    : status === 404 || status === 410 ? 'contentUnavailable'
    : status === 429 || status === 418 ? 'rateLimited'
    : status === 403 ? 'authenticationRequired' : 'networkError');
}
export async function bridge(action, data = {}) {
  const response = await globalThis.fjs.bridge_call({ action, ...data });
  if (!response.ok) throw new SourceError(response.code || 'sourceError');
  return response.data;
}
export async function request(url, options = {}) {
  const response = await bridge('http.request', {
    url, method: options.method || (options.json !== undefined || options.form ? 'POST' : 'GET'),
    headers: {
      'User-Agent': UA,
      ...(options.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...options.headers,
    },
    body: options.json !== undefined ? JSON.stringify(options.json)
      : options.form ? new URLSearchParams(options.form).toString() : options.body,
    followRedirects: options.followRedirects ?? true,
  });
  if (!options.allowError && (response.status < 200 || response.status >= 400)) throw httpError(response.status);
  return response;
}
export async function getJson(url, options) {
  const response = await request(url, options);
  try { return parseJson(response.body); } catch { throw new SourceError('sourceError'); }
}
export const cookie = (name, url) => bridge('cookies.get', { name, url });
export const setCookie = (name, value, url) => bridge('cookies.set', { name, value, url });
export const randomHex = (length = 16) => bridge('random.hex', { length });
export const now = () => Math.floor(Date.now() / 1000);
export function absolute(value, base = 'https://example.invalid') {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const u = new URL(value, base); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
}
export const number = (n) => Number.isFinite(Number(n)) && n !== null && n !== '' ? Number(n) : null;
export function variants(urls, info = {}) {
  if (!Array.isArray(urls)) urls = [urls];
  info = {...info};
  for (const key of ['width','height','bitrate','durationMs']) if (key in info) info[key] = number(info[key]);
  return [...new Set(urls.map((u) => absolute(u)).filter(Boolean))].map((url) => ({
    url, protocol: /\.m3u8(?:[?#]|$)/i.test(url) ? 'hls' : /\.mpd(?:[?#]|$)/i.test(url) ? 'dash' : 'http',
    hasVideo: true, hasAudio: true, ...info,
  }));
}
export function image(url, info = {}) {
  const vs = variants(url, { hasVideo: false, hasAudio: false, ...info });
  return vs.length ? { kind: 'image', variants: vs } : null;
}
export function video(url, info = {}, thumbnail = null) {
  const vs = variants(url, info);
  return vs.length ? { kind: 'video', thumbnail: absolute(thumbnail), variants: vs } : null;
}
export function livePhoto(photo, clip, info = {}) {
  const result = image(photo, info);
  if (!result) return null;
  return { ...result, kind: 'livePhoto', companionVideo: video(clip, info) };
}
export function urlList(value) {
  if (typeof value === 'string') return [absolute(value)].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(urlList);
  if (!value || typeof value !== 'object') return [];
  return urlList(value.url_list || value.urlList || value.UrlList || value.url || []);
}
export function* walk(root, maxNodes = 50000) {
  const stack = [root]; let count = 0;
  while (stack.length) {
    if (++count > maxNodes) throw new SourceError('sourceError');
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    yield current;
    stack.push(...Object.values(current).filter((v) => v && typeof v === 'object').reverse());
  }
}
export const find = (data, predicate) => [...walk(data)].find(predicate);
export function balanced(text, start) {
  let quote = '', escaped = false, depth = 0;
  const open = text[start], close = open === '{' ? '}' : ']';
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return text.slice(start, i + 1);
  }
  throw new SourceError('sourceError');
}
// Decode data expressions, never execute scripts from fetched webpages.
function literal(node, depth = 0) {
  if (depth > 100) throw new SourceError('sourceError');
  const next = (n) => literal(n, depth + 1);
  switch (node.type) {
    case 'Literal': return node.value;
    case 'Identifier': if (node.name === 'undefined' || node.name === 'NaN') return null; break;
    case 'ArrayExpression': return node.elements.map((v) => v ? next(v) : null);
    case 'ObjectExpression': {
      const result = Object.create(null);
      for (const p of node.properties) {
        if (p.type !== 'Property' || p.computed || p.method || p.kind !== 'init') throw new SourceError();
        const key = p.key.name ?? p.key.value;
        if (key !== '__proto__' && key !== 'constructor') result[key] = next(p.value);
      }
      return result;
    }
    case 'UnaryExpression': {
      const v = next(node.argument);
      if (node.operator === '-') return -v;
      if (node.operator === '+') return +v;
      if (node.operator === '!') return !v;
      break;
    }
    case 'BinaryExpression': if (node.operator === '*') return next(node.left) * next(node.right); break;
    case 'NewExpression': if (node.callee.name === 'Set' && node.arguments.length === 1) return next(node.arguments[0]); break;
  }
  throw new SourceError('sourceError');
}
export function dataExpression(text) {
  try { return parseJson(text); } catch { /* JavaScript data literal, not strict JSON. */ }
  return literal(parseScript(`(${text})`).body[0].expression);
}
export function assigned(html, name) {
  const expression = new RegExp(`(?:window\\.|globalThis\\.)?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  const match = expression.exec(html);
  if (!match) throw new SourceError('sourceError');
  const tail = html.slice(match.index + match[0].length);
  const start = tail.search(/[\[{]/);
  return dataExpression(balanced(tail, requireValue(start >= 0) && start));
}
export async function fallback(stages, attempts = []) {
  let last;
  for (const [stage, operation] of stages) {
    try { return await operation(); } catch (error) {
      last = error instanceof SourceError ? error : new SourceError();
      attempts.push({ stage, code: last.code });
      if (['cancelled', 'timeout', 'closed'].includes(last.code)) throw last;
    }
  }
  throw last || new SourceError();
}
export function canonical(url, keep = []) {
  const result = new URL(url); result.hash = '';
  for (const key of [...result.searchParams.keys()]) if (!keep.includes(key)) result.searchParams.delete(key);
  return result.href;
}
export function entry(platform, extractor) {
  return async (input) => {
    const attempts = [];
    try {
      const result = await extractor(input, attempts);
      const media = (result.media || []).filter(Boolean);
      const creator = authorInfo(result.authorInfo || {displayName:result.author});
      return { ok: true, data: {
        schemaVersion: 1, platformId: platform.id, sourceVersion: platform.version,
        inputUrl: input.url, resolvedUrl: result.resolvedUrl || input.url,
        canonicalUrl: canonical(result.resolvedUrl || input.url, platform.keep || []),
        kind: media.length ? (new Set(media.map((m) => m.kind)).size > 1 ? 'mixed'
          : media[0].kind === 'livePhoto' || media[0].kind === 'animation' ? 'image' : media[0].kind) : 'text',
        title: '', text: '', ...result, author: result.author || creator?.displayName || creator?.username || null,
        authorInfo: creator, media, attempts,
      } };
    } catch (error) {
      return { ok: false, error: { code: error.code || 'sourceError', attempts } };
    }
  };
}
