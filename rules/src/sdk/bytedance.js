import { image, video, livePhoto, variants, urlList, requireValue } from './core.js';
import { authorInfo } from './author.js';
export function decodeAweme(item) {
  const media = [], photos = item.images || item.image_post_info?.images || item.imagePost?.images || [];
  for (const p of photos) {
    const urls = urlList(p.display_image || p.imageURL || p), clip = urlList(p.video?.play_addr || p.video?.playAddr);
    media.push(clip.length ? livePhoto(urls, clip, { width: p.width, height: p.height }) : image(urls, { width: p.width, height: p.height }));
  }
  const v = item.video;
  if (v && !photos.length) {
    const rates = v.bit_rate || v.bitrateInfo || [], vs = rates.flatMap((r) => variants(urlList(r.play_addr || r.PlayAddr), {
      width: r.play_addr?.width || v.width, height: r.play_addr?.height || v.height, bitrate: r.bit_rate || r.Bitrate, durationMs: v.duration,
    }));
    if (!vs.length) vs.push(...variants(urlList(v.play_addr || v.playAddr || v.downloadAddr), { width: v.width, height: v.height, durationMs: item.aweme_id ? v.duration : Number(v.duration || 0) * 1000 }));
    if (vs.length) media.push({ kind: 'video', variants: vs, thumbnail: urlList(v.cover || v.origin_cover)[0] || null });
  }
  requireValue(media.filter(Boolean).length || item.desc);
  const user = item.author || {}, handle = user.unique_id || user.uniqueId || user.short_id;
  return { contentId: String(item.aweme_id || item.id || ''), text: item.desc || '', media,
    authorInfo: authorInfo({id:user.uid || user.id,username:handle,displayName:user.nickname,
      avatarUrl:urlList(user.avatar_larger || user.avatar_medium || user.avatar_thumb || user.avatarLarger || user.avatarMedium || user.avatarThumb)[0],
      profileUrl:item.aweme_id ? user.sec_uid && `https://www.douyin.com/user/${user.sec_uid}` : handle && `https://www.tiktok.com/@${encodeURIComponent(handle)}`}) };
}
