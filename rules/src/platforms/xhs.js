import { request, assigned, requireValue, fallback, image, variants, SourceError, MOBILE_UA } from '../sdk/core.js';
import { activateGuest } from '../sdk/xhs_sign.js';
import { authorInfo } from '../sdk/author.js';
function streams(stream = {}) {
  return ['h264', 'av1', 'h265', 'h266'].flatMap((codec) => (stream[codec] || []).flatMap((v) => variants(v.masterUrl, {
    width: v.width, height: v.height, durationMs: Number(v.duration || 0) * 1000, codecs: codec, backupUrls: v.backupUrls || [],
  })));
}
export function rawImage(url) {
  const path = new URL(url).pathname.split('!')[0];
  const trace = path.match(/\/[a-f0-9]{32}\/(.+)/)?.[1] || path.replace(/^\//, '');
  return `https://sns-img-hw.xhscdn.com/${trace}?imageView2/format/jpg`;
}
export function decodeNote(note) {
  const photos = note.imageList || [], media = [];
  if (note.video) { const vs = streams(note.video.media?.stream); requireValue(vs.length > 0); media.push({ kind: 'video', variants: vs, thumbnail: photos[0]?.urlDefault || photos[0]?.url || null }); }
  else for (const p of photos) {
    const url = requireValue(p.urlDefault || p.url), result = image([rawImage(url), url], { width: p.width, height: p.height });
    const vs = streams(p.stream);
    if (p.livePhoto && vs.length) { result.kind = 'livePhoto'; result.companionVideo = { kind: 'video', variants: vs }; }
    media.push(result);
  }
  const u = note.user || {};
  return { contentId: note.noteId || note.note_id, title: note.title || '', text: note.desc || '', media,
    authorInfo:authorInfo({id:u.userId || u.user_id,username:u.redId || u.red_id,displayName:u.nickname || u.nickName,avatarUrl:u.avatar || u.image || u.images,profileUrl:(u.userId || u.user_id) && `https://www.xiaohongshu.com/user/profile/${u.userId || u.user_id}`}) };
}
export default async function extract({ url }, attempts) {
  async function page(headers) {
    const p = await request(url, { headers });
    if (p.url.includes('/login')) throw new SourceError('authenticationRequired');
    if (p.url.includes('/404/sec')) throw new SourceError('rateLimited');
    if (p.url.includes('/404')) throw new SourceError('contentUnavailable');
    const state = assigned(p.body, '__INITIAL_STATE__');
    const id = new URL(p.url).pathname.match(/\/(?:explore|discovery\/item)\/([\w]+)/)?.[1];
    const note = state.noteData?.data?.noteData || state.note?.noteDetailMap?.[id || state.note?.firstNoteId]?.note;
    return { ...decodeNote(requireValue(note, 'authenticationRequired')), resolvedUrl: p.url };
  }
  return fallback([['desktop-page', () => page({ Accept: 'text/html,application/xhtml+xml' })],
    ['mobile-page', () => page({ 'User-Agent': MOBILE_UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' })],
    ['guest-session', async () => { await activateGuest(); return page({ Accept: 'text/html,application/xhtml+xml' }); }]], attempts);
}
