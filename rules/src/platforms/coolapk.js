import { request, requireValue, absolute } from '../sdk/core.js';
import { article, documentOf, pageAuthor } from '../sdk/html.js';
import { authorInfo } from '../sdk/author.js';
export default async function extract({ url }) {
  const page = await request(url), doc = documentOf(page.body);
  const content = requireValue(doc.querySelector('.feed-article-message,.feed-message'), 'contentUnavailable');
  const title = doc.querySelector('.message-title')?.textContent || '';
  const user = doc.querySelector('.feed-user-name,.user-name,.feed-user-info a[href*="/u/"]');
  return { ...article(content.innerHTML, page.url, title), resolvedUrl: page.url,
    authorInfo:pageAuthor(doc,page.url) || authorInfo({displayName:user?.textContent,profileUrl:absolute(user?.getAttribute('href'),page.url),
      avatarUrl:absolute(doc.querySelector('.feed-user-avatar img,.user-avatar img,.feed-user-avatar')?.getAttribute('src'),page.url)}) };
}
