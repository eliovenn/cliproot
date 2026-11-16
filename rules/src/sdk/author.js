import { absolute } from './core.js';
const value = (v) => (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim() : null;
// Username/handle and display name are separate; IDs are never used as names.
export function authorInfo({id, username, displayName, avatarUrl, profileUrl} = {}) {
  const result = {id:value(id),username:value(username),displayName:value(displayName),avatarUrl:absolute(avatarUrl),profileUrl:absolute(profileUrl)};
  return Object.values(result).some(Boolean) ? result : null;
}
export function metaAuthor(user = {}, base) {
  return authorInfo({id:user.pk || user.id,username:user.username,displayName:user.full_name || user.name,
    avatarUrl:user.profile_pic_url_hd || user.profile_pic_url || user.hd_profile_pic_url_info?.url,
    profileUrl:user.username && `${base}${encodeURIComponent(user.username)}/`});
}
