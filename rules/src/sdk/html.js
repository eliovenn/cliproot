import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { absolute, image, parseJson, requireValue, walk, SourceError } from './core.js';
import { authorInfo } from './author.js';
import { normalizeStructures } from './html_structure.js';
import { markdownService } from './html_markdown.js';

export const documentOf = (html) => parseHTML(html).document;
export function pageAuthor(doc, url) {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      for (const node of walk(parseJson(script.textContent))) {
        const user = Array.isArray(node.author) ? node.author[0] : node.author;
        if (!user) continue;
        const info = typeof user === 'string' ? {displayName:user} : {id:user.identifier,displayName:user.name,username:user.alternateName,
          avatarUrl:absolute(typeof user.image === 'string' ? user.image : user.image?.url,url),profileUrl:absolute(user.url || user['@id'],url)};
        const result = authorInfo(info); if (result) return result;
      }
    } catch { /* Ignore malformed metadata. */ }
  }
  const byline = doc.querySelector('[rel="author"]');
  return authorInfo({displayName:doc.querySelector('meta[name="author"]')?.getAttribute('content') || byline?.textContent,
    profileUrl:absolute(byline?.getAttribute('href'),url)});
}
export function text(html = '') { return documentOf(`<html><body>${html}</body></html>`).body.textContent.trim(); }
export function scriptJson(html, selector) {
  const node = requireValue(documentOf(html).querySelector(selector));
  return parseJson(node.textContent);
}
export function cleanDocument(html, url) {
  const document = documentOf(html);
  for (const tag of document.querySelectorAll('script,style,iframe,object,embed,form,button,input,noscript')) tag.remove();
  normalizeStructures(document);
  for (const node of document.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || ['style', 'srcdoc'].includes(attr.name)) node.removeAttribute(attr.name);
    }
    if (node.localName === 'img') {
      const src = absolute(node.getAttribute('data-src') || node.getAttribute('data-original') || node.getAttribute('src'), url);
      if (src) node.setAttribute('src', src); else node.remove();
    }
    if (node.hasAttribute('href')) {
      const href = absolute(node.getAttribute('href'), url);
      if (href) node.setAttribute('href', href); else node.removeAttribute('href');
    }
  }
  return document;
}
export function article(html, url, title = '') {
  const document = cleanDocument(`<html><body>${html}</body></html>`, url);
  const service = markdownService();
  return {
    title: text(title), kind: 'article', html: document.body.innerHTML,
    text: document.body.textContent.trim(), markdown: service.turndown(document.body),
    media: [...new Set([...document.querySelectorAll('img')].map((i) => i.getAttribute('src')))].map((u) => image(u)),
  };
}
export function genericArticle(html, url) {
  const creator = pageAuthor(documentOf(html),url);
  const document = cleanDocument(html, url);
  const metadata = (name) => document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.getAttribute('content');
  const title = metadata('og:title') || document.title || '';
  const cover = absolute(metadata('og:image'), url);
  const description = metadata('description') || metadata('og:description') || '';
  const author = metadata('author');
  let extracted;
  try { extracted = new Readability(document.cloneNode(true), { charThreshold: 80 }).parse(); } catch { /* Try semantic content below. */ }
  const semantic = document.querySelector('article,main,[role="main"]');
  const content = extracted?.content || semantic?.innerHTML;
  if (content) return { ...article(content, url, extracted?.title || title), author: creator?.displayName || extracted?.byline || author, authorInfo:creator, cover };
  if (!title && !description) throw new SourceError('sourceError');
  return { title: text(title), text: text(description), kind: 'text', cover, author,authorInfo:creator, media: [] };
}
