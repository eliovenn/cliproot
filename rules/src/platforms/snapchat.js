// Spotlight fields ported from yt-dlp SnapchatSpotlightIE (2026.10.26).
import { request, requireValue, find, video } from '../sdk/core.js';
import { scriptJson } from '../sdk/html.js';
import { authorInfo } from '../sdk/author.js';
export default async function extract({ url }) {
  const id = requireValue(new URL(url).pathname.match(/\/(?:spotlight|@[\w.-]+(?:\/spotlight)?)\/([\w-]+)/)?.[1], 'unsupportedUrl');
  const page = await request(`https://www.snapchat.com/spotlight/${id}`);
  const data = scriptJson(page.body, '#__NEXT_DATA__');
  const story = find(data, (v) => v.story?.storyId?.value === id);
  const metadata = story?.metadata || find(data, (v) => v.videoMetadata?.contentUrl);
  const v = requireValue(metadata?.videoMetadata);
  const u = v.creator?.personCreator || {};
  return { contentId: id, resolvedUrl: page.url, title: v.name || '', text: metadata.description || v.description || '',
    authorInfo:authorInfo({id:u.id,username:u.username,displayName:u.name || u.displayName,avatarUrl:u.image?.url || u.image || u.avatarUrl,profileUrl:u.url || (u.username && `https://www.snapchat.com/add/${u.username}`)}), media: [requireValue(video(v.contentUrl, { width: v.width, height: v.height, durationMs: v.durationMs }, v.thumbnailUrl))] };
}
