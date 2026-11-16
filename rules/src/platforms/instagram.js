import { graphql, metaPost } from '../sdk/meta.js';
import { requireValue } from '../sdk/core.js';
export default async function extract({ url, options }) {
  const code = requireValue(new URL(url).pathname.match(/\/(?:p|reel|reels|tv)\/([\w-]+)/)?.[1], 'unsupportedUrl');
  const data = await graphql('https://www.instagram.com/', '936619743392459', options.docId || '27128499623469141', {
    shortcode: code, __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
  });
  const node = data.data?.xdt_shortcode_media || data.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];
  return metaPost(requireValue(node, 'authenticationRequired'));
}
