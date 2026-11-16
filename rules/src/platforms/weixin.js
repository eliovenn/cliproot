import { request, assigned, image, fallback, requireValue, dataExpression, absolute } from '../sdk/core.js';
import { article, documentOf, text, pageAuthor } from '../sdk/html.js';
import { authorInfo } from '../sdk/author.js';
export function decodeMessage(data, url) {
  const type = Number(data.item_show_type), title = text(data.title || '');
  if (type === 0) return article(data.content_noencode || '', url, title);
  if (type === 10) return { title, text: text(data.text_page_info?.content_noencode || '') };
  requireValue(type === 8);
  return { title, text: text(data.content_noencode || ''), media: (data.picture_page_info_list || [])
    .map((p) => image(p.watermark_info?.cdn_url || p.cdn_url)) };
}
export default async function extract({ url }, attempts) {
  const page = await request(url);
  const result = await fallback([
    ['cgiDataNew', () => decodeMessage(assigned(page.body, 'cgiDataNew'), page.url)],
    ['article-dom', () => { const doc = documentOf(page.body); return article(requireValue(doc.querySelector('#js_content')).innerHTML, page.url, doc.querySelector('#activity-name')?.textContent || ''); }],
  ], attempts);
  const doc = documentOf(page.body);
  const literal = (name) => {try {const raw=page.body.match(new RegExp(`(?:var\\s+)?${name}\\s*=\\s*("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`))?.[1];return raw ? dataExpression(raw) : null;}catch{return null;}};
  return { ...result, resolvedUrl: page.url,
    authorInfo:pageAuthor(doc,page.url) || authorInfo({id:literal('user_name'),username:literal('alias'),displayName:doc.querySelector('#js_name,.profile_nickname')?.textContent || literal('nickname'),
      avatarUrl:absolute(literal('head_img') || doc.querySelector('#js_profile_head_img')?.getAttribute('src'),page.url)}) };
}
