import CryptoJS from 'crypto-js';
import solve from '../vendor/yt_solver.js';
import { request, getJson, assigned, requireValue, cookie, variants, fallback, SourceError, absolute, find } from '../sdk/core.js';
import { authorInfo } from '../sdk/author.js';
export async function decodePlayer(player, playerCode, options = {}) {
  if (player.playabilityStatus?.status !== 'OK') throw new SourceError(player.playabilityStatus?.status === 'LOGIN_REQUIRED' ? 'authenticationRequired' : 'contentUnavailable');
  const streaming = requireValue(player.streamingData), formats = [...(streaming.formats || []), ...(streaming.adaptiveFormats || [])];
  const sigs = [], ns = [];
  for (const f of formats) {
    const cipher = new URLSearchParams(f.signatureCipher || f.cipher || '');
    if (cipher.has('s')) sigs.push(cipher.get('s'));
    const url = f.url || cipher.get('url'); if (url) { const n = new URL(url).searchParams.get('n'); if (n) ns.push(n); }
  }
  let solutions = {};
  if (sigs.length || ns.length) {
    requireValue(playerCode);
    const requests = [{ type: 'sig', challenges: [...new Set(sigs)] }, { type: 'n', challenges: [...new Set(ns)] }].filter((r) => r.challenges.length);
    const output = solve({ type: 'player', player: playerCode, requests });
    for (let i = 0; i < requests.length; i++) { const r = output.responses?.[i]; requireValue(r?.type === 'result'); solutions[requests[i].type] = r.data; }
  }
  const vs = formats.flatMap((f) => {
    if (f.drmFamilies?.length || f.type === 'FORMAT_STREAM_TYPE_OTF') return [];
    const cipher = new URLSearchParams(f.signatureCipher || f.cipher || ''), raw = f.url || cipher.get('url'); if (!raw) return [];
    const u = new URL(raw), n = u.searchParams.get('n'), s = cipher.get('s');
    if (s) u.searchParams.set(cipher.get('sp') || 'signature', requireValue(solutions.sig?.[s]));
    if (n) u.searchParams.set('n', requireValue(solutions.n?.[n]));
    if (options.poToken) u.searchParams.set('pot', options.poToken);
    const mime = f.mimeType || '', audio = mime.startsWith('audio/');
    const expires = Number(u.searchParams.get('expire'));
    return variants(u.href, { mimeType: mime.split(';')[0], codecs: mime.match(/codecs="([^"]+)"/)?.[1], width: f.width, height: f.height,
      bitrate: f.bitrate, durationMs: Number(f.approxDurationMs) || null, hasVideo: !audio, hasAudio: audio || !!f.audioQuality,
      audioGroupId: f.audioQuality && !audio ? null : 'youtube-adaptive', ...(expires ? { expiresAt: new Date(expires * 1000).toISOString() } : {}) });
  });
  vs.push(...variants([streaming.hlsManifestUrl, streaming.dashManifestUrl]));
  requireValue(vs.length > 0);
  const details = player.videoDetails || {}, media = [];
  const video = vs.filter((v) => v.hasVideo), audio = vs.filter((v) => !v.hasVideo);
  if (video.length) media.push({ kind: 'video', variants: video });
  if (audio.length) media.push({ kind: 'audio', variants: audio });
  return { contentId: details.videoId, kind: 'video', title: details.title || '', text: details.shortDescription || '', author: details.author,
    authorInfo:authorInfo({id:details.channelId,displayName:details.author,profileUrl:player.microformat?.playerMicroformatRenderer?.ownerProfileUrl || (details.channelId && `https://www.youtube.com/channel/${details.channelId}`)}),
    cover: details.thumbnail?.thumbnails?.at(-1)?.url, media };
}
export default async function extract({ url, options }, attempts) {
  const u = new URL(url), id = requireValue(u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/)?.[1], 'unsupportedUrl');
  requireValue(/^[\w-]{11}$/.test(id), 'unsupportedUrl');
  const page = await request(`https://www.youtube.com/watch?v=${id}&hl=en`);
  let initial, config = {}, js;
  try { initial = assigned(page.body, 'ytInitialPlayerResponse'); } catch { /* Player endpoint fallback below. */ }
  // ytcfg uses set({...}), not assignment; extract only its data literal.
  const configText = page.body.replace(/ytcfg\.set\s*\(/, '__YTCFG__=');
  try { config = assigned(configText, '__YTCFG__'); } catch { /* Use public client defaults. */ }
  async function decode(player) {
    requireValue(player.videoDetails?.videoId === id);
    const needsCode = [...(player.streamingData?.formats || []), ...(player.streamingData?.adaptiveFormats || [])].some((f) => f.signatureCipher || f.cipher || /[?&]n=/.test(f.url || ''));
    if (needsCode && !js) {
      const raw = config.PLAYER_JS_URL || page.body.match(/"jsUrl"\s*:\s*"([^"]+)"/)?.[1] || page.body.match(/"(\/s\/player\/[^" ]+\/base\.js)"/)?.[1];
      js = (await request(requireValue(absolute(raw?.replaceAll('\\/', '/'), 'https://www.youtube.com')))).body;
    }
    return decodePlayer(player, js, options);
  }
  async function player(client) {
    const headers = { Origin: 'https://www.youtube.com', Referer: page.url };
    const sapisid = await cookie('SAPISID', 'https://www.youtube.com/') || await cookie('__Secure-3PAPISID', 'https://www.youtube.com/');
    if (sapisid) { const t = Math.floor(Date.now() / 1000); headers.Authorization = `SAPISIDHASH ${t}_${CryptoJS.SHA1(`${t} ${sapisid} https://www.youtube.com`).toString()}`; }
    const body = { context: { client: { hl: 'en', gl: 'US', ...client, ...(config.VISITOR_DATA ? { visitorData: config.VISITOR_DATA } : {}) } }, videoId: id,
      contentCheckOk: true, racyCheckOk: true, ...(options.poToken ? { serviceIntegrityDimensions: { poToken: options.poToken } } : {}) };
    return decode(await getJson(`https://www.youtube.com/youtubei/v1/player?prettyPrint=false${config.INNERTUBE_API_KEY ? `&key=${config.INNERTUBE_API_KEY}` : ''}`, { json: body, headers }));
  }
  const result = await fallback([
    ['watch-player', () => decode(requireValue(initial))],
    ['web-player', () => player(config.INNERTUBE_CONTEXT?.client || { clientName: 'WEB', clientVersion: '2.20260708.00.00' })],
    ['android-vr-player', () => player({ clientName: 'ANDROID_VR', clientVersion: '1.65.10', deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, osName: 'Android', osVersion: '12L' })],
  ], attempts);
  let owner;
  try {owner = find(assigned(page.body,'ytInitialData'), (n) => n.videoOwnerRenderer)?.videoOwnerRenderer;} catch { /* Player still carries the channel name and ID. */ }
  const profile = absolute(owner?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || result.authorInfo?.profileUrl,'https://www.youtube.com');
  const username = profile && new URL(profile).pathname.match(/^\/@([^/]+)/)?.[1];
  return { ...result,authorInfo:authorInfo({...result.authorInfo,username,profileUrl:profile,avatarUrl:owner?.thumbnail?.thumbnails?.at(-1)?.url}),resolvedUrl:page.url,canonicalUrl:`https://www.youtube.com/watch?v=${id}` };
}
