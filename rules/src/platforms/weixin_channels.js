import { getJson, requireValue, randomHex, now, video, SourceError } from '../sdk/core.js';
import { authorInfo } from '../sdk/author.js';
export default async function extract({ url }) {
  const u = new URL(url), id = requireValue(u.pathname.match(/\/sph\/(\w+)/)?.[1] || u.searchParams.get('id'), 'unsupportedUrl');
  const response = await getJson('https://yuanbao.tencent.com/api/weixin/get_parse_result', {
    json: { type: 'video_channel_url', url: `https://weixin.qq.com/sph/${id}`, scene: 1 },
    headers: { Origin: 'https://yuanbao.tencent.com', Referer: 'https://yuanbao.tencent.com/' },
  });
  if (String(response.error?.code) === '20000') throw new SourceError('authenticationRequired');
  requireValue(response.code === 0);
  const data = requireValue(response.data), playable = new URL(requireValue(data.playable_url, 'contentUnavailable'));
  const token = requireValue(playable.searchParams.get('token')), eid = requireValue(playable.searchParams.get('eid'));
  const query = new URLSearchParams({ _rid: `${now().toString(16)}-${await randomHex(4)}`, _pageUrl: 'https://channels.weixin.qq.com/finder-preview/pages/feed' });
  const feed = await getJson(`https://channels.weixin.qq.com/finder-preview/api/feed/get_feed_info?${query}`, {
    json: { baseReq: { generalToken: token }, exportId: eid },
    headers: { Origin: 'https://channels.weixin.qq.com', Referer: playable.href },
  });
  requireValue(feed.errCode === 0);
  const info = requireValue(feed.data?.feedInfo), urls = [info.h264VideoInfo?.videoUrl, info.videoUrl, info.h265VideoInfo?.videoUrl].filter(Boolean);
  requireValue(urls.length > 0);
  return { contentId: id, title: info.description || data.desc || '', author: feed.data.authorInfo?.nickname || data.author,
    authorInfo:authorInfo({id:feed.data.authorInfo?.id,username:feed.data.authorInfo?.username,displayName:feed.data.authorInfo?.nickname || data.author,avatarUrl:feed.data.authorInfo?.headUrl || feed.data.authorInfo?.avatarUrl || data.avatar_url}),
    media: [video(urls, {}, info.coverUrl || data.cover_url)] };
}
