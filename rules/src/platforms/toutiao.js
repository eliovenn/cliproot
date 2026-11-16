import { getJson, request, requireValue, parseJson, image, video, variants } from '../sdk/core.js';
import { article, documentOf } from '../sdk/html.js';
import { authorInfo } from '../sdk/author.js';
async function vod(token, cover) {
  const encoded = token.replaceAll('-', '+').replaceAll('_', '/');
  const data = parseJson(Buffer.from(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='), 'base64').toString('utf8'));
  const payload = await getJson(`https://vod.bytedanceapi.com/?${requireValue(data.GetPlayInfoToken)}`);
  const list = requireValue(payload.Result?.Data?.PlayInfoList);
  const vs = list.flatMap((v) => variants(v.MainPlayUrl, { width: Number(v.Width), height: Number(v.Height), durationMs: Number(v.Duration || 0) * 1000,
    backupUrls: [v.BackupPlayUrl].filter(Boolean) })).sort((a, b) => b.height - a.height);
  requireValue(vs.length > 0); return { kind: 'video', thumbnail: cover || null, variants: vs };
}
export default async function extract({ url }) {
  let id = new URL(url).pathname.match(/\/(?:(?:article|video|w|group|item)\/|a|i)(\d+)/)?.[1];
  if (!id) { url = (await request(url)).url; id = new URL(url).pathname.match(/\/(?:(?:article|video|w|group|item)\/|a|i)(\d+)/)?.[1]; }
  requireValue(id, 'unsupportedUrl');
  const { data } = await getJson(`https://m.toutiao.com/i${id}/info/v2/`); requireValue(data, 'contentUnavailable');
  let result;
  if (data.thread) {
    const base = data.thread.thread_base || {};
    result = { text: base.content || '', media: (base.large_image_list || []).map((p) => image(p.url, { width: p.width, height: p.height })) };
  } else if (data.biz_tag !== '图文' && data.play_auth_token_v2) result = { title: data.title || '', media: [await vod(data.play_auth_token_v2, data.poster_url)] };
  else {
    const doc = documentOf(`<html><body>${data.content || ''}</body></html>`), media = [];
    for (const box of doc.querySelectorAll('.tt-video-box')) { media.push(await vod(box.getAttribute('data-token'))); box.remove(); }
    result = article(doc.body.innerHTML, url, data.title || ''); result.media.push(...media);
  }
  const u = data.user_info || data.media_user || data.thread?.user || data.thread?.thread_base?.user || {};
  return { ...result, contentId: id, resolvedUrl: url,
    authorInfo:authorInfo({id:u.user_id || u.id,username:u.screen_name,displayName:u.name || data.source,avatarUrl:u.avatar_url || data.avatar_url,profileUrl:u.homepage || u.home_page || u.profile_url}) };
}
