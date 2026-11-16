import { request, getJson, assigned, find, walk, parseJson, requireValue, fallback, image, video, variants, urlList, absolute } from '../sdk/core.js';
import { authorInfo } from '../sdk/author.js';
export function decodeState(data, id) {
  const client = data.defaultClient || data;
  const payload = find(data, (v) => v.photo && (v.photo.caption || v.atlas)) || {};
  const photo = client[`VisionVideoDetailPhoto:${id}`] || payload.photo || find(data, (v) => v.caption && (v.manifest || v.photoUrl)) || {};
  const atlas = photo.ext_params?.atlas || payload.atlas, media = [];
  if (atlas?.list?.length) {
    let cdn = (typeof atlas.cdn === 'string' ? atlas.cdn : atlas.cdn?.[0]) || atlas.cdnList?.[0]?.cdn;
    if (cdn && !/^https?:/.test(cdn)) cdn = `https://${cdn.replace(/^\/\//, '')}`;
    for (const [i, path] of atlas.list.entries()) media.push(image(absolute(path, `${cdn}/`), { width: atlas.size?.[i]?.w, height: atlas.size?.[i]?.h }));
  }
  const vs = [], seen = new Set();
  const roots = [photo.manifest, photo.manifestH265, photo.videoResource, client];
  for (let root of roots) {
    if (typeof root === 'string') { try { root = parseJson(root); } catch { continue; } }
    for (const r of walk(root)) if (r.url && (r.codecs || r.qualityType || r.avgBitrate || r.__typename?.includes('Representation'))) {
      if (!seen.has(r.url)) { seen.add(r.url); vs.push(...variants(r.url, { width: r.width, height: r.height, codecs: r.codecs, bitrate: r.avgBitrate, backupUrls: urlList(r.backupUrl) })); }
    }
  }
  if (!vs.length) vs.push(...variants([photo.photoUrl, photo.photoH265Url, ...urlList(photo.mainMvUrls), ...urlList(photo.photoUrls)]));
  const cover = photo.coverUrl || urlList(photo.coverUrls)[0];
  if (vs.length) media.push({ kind: 'video', thumbnail: cover || null, variants: vs });
  requireValue(media.filter(Boolean).length > 0);
  const ref = photo.author?.__ref || payload.author?.__ref;
  const user = client[ref] || payload.author || photo.author || find(client, (v) => v.__typename === 'VisionVideoDetailAuthor') || {};
  return { title: photo.caption || '', contentId: id, media,
    authorInfo:authorInfo({id:user.id || user.userId,username:user.kwaiId,displayName:user.name || user.userName,
      avatarUrl:user.headerUrl || user.avatar || user.headurl,profileUrl:(user.id || user.userId) && `https://www.kuaishou.com/profile/${user.id || user.userId}`}) };
}
export default async function extract({ url }, attempts) {
  const initial = await request(url), u = new URL(initial.url);
  const id = ['vid', 'id', 'modal_id', 'v', 's', 'pid'].map((k) => u.searchParams.get(k)).find(Boolean) || u.pathname.split('/').filter(Boolean).at(-1)?.replace(/\.html$/, '');
  requireValue(id, 'unsupportedUrl');
  const parse = (page) => decodeState(assigned(page.body, page.body.includes('__APOLLO_STATE__') ? '__APOLLO_STATE__' : 'INIT_STATE'), id);
  return { ...await fallback([
    ['page-state', () => parse(initial)],
    ['mobile-page', async () => parse(await request(`https://v.m.chenzhongtech.com/fw/photo/${id}`, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.kuaishou.com/' } }))],
    ['graphql', async () => {
      const data = await getJson('https://www.kuaishou.com/graphql', { json: {
        operationName: 'visionVideoDetail', variables: { photoId: id, page: 'search' },
        query: 'query visionVideoDetail($photoId: String, $page: String) { visionVideoDetail(photoId: $photoId, page: $page) { status author { id name headerUrl } photo { id caption coverUrl photoUrl duration manifestH265 videoResource } } }',
      } });
      return decodeState(requireValue(data.data?.visionVideoDetail, 'authenticationRequired'), id);
    }],
  ], attempts), resolvedUrl: initial.url };
}
