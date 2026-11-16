import { getJson, request, image, requireValue, fallback } from '../sdk/core.js';
import { genericArticle } from '../sdk/html.js';
import { authorInfo } from '../sdk/author.js';
const query = `query P($id: ID!) { post(id: $id) { title isLocked creator { id username name imageId } content { bodyModel { paragraphs { type text href markups { type start end href } metadata { id originalWidth originalHeight } codeBlockMetadata { lang } iframe { mediaResource { href iframeSrc title } } mixtapeMetadata { href } } } } } }`;
export function markup(text, markups = []) {
  const open = new Map(), close = new Map();
  for (const [index, m] of markups.entries()) {
    const pair = { STRONG: ['**', '**'], EM: ['*', '*'], CODE: ['`', '`'], A: ['[', `](${m.href})`] }[m.type];
    if (!pair || m.type === 'A' && !m.href) continue;
    let start = Math.max(0, Math.min(m.start || 0, text.length)), end = Math.max(0, Math.min(m.end || 0, text.length));
    const selected = text.slice(start, end); start += selected.length - selected.trimStart().length; end -= selected.length - selected.trimEnd().length;
    if (start >= end) continue;
    if (!open.has(start)) open.set(start, []); if (!close.has(end)) close.set(end, []);
    open.get(start).push([end, index, pair[0]]); close.get(end).push([start, index, pair[1]]);
  }
  let result = '', position = 0;
  for (const b of [...new Set([...open.keys(), ...close.keys()])].sort((a, b) => a - b)) {
    result += text.slice(position, b) + (close.get(b) || []).sort((a, b) => b[0] - a[0] || b[1] - a[1]).map((v) => v[2]).join('')
      + (open.get(b) || []).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((v) => v[2]).join('');
    position = b;
  }
  return result + text.slice(position);
}
export function decodePost(post) {
  const paragraphs = requireValue(post.content?.bodyModel?.paragraphs), media = [], parts = [];
  let ordered = 0;
  for (const [index, p] of paragraphs.entries()) {
    let body = markup(p.text || '', p.markups), type = p.type;
    if (index === 0 && /^H[234]$/.test(type) && p.text?.trim() === post.title?.trim()) continue;
    if (type === 'IMG' && p.metadata?.id) {
      const url = `https://miro.medium.com/v2/${p.metadata.id}`;
      media.push(image(url, { width: p.metadata.originalWidth, height: p.metadata.originalHeight })); body = `![](${url})${body ? `\n*${body}*` : ''}`;
    } else if (type === 'PRE') body = `\`\`\`${p.codeBlockMetadata?.lang || ''}\n${p.text || ''}\n\`\`\``;
    else if (type === 'IFRAME') { const m = p.iframe?.mediaResource; body = m ? `[${m.title || m.href}](${m.href || m.iframeSrc})` : ''; }
    else if (type === 'MIXTAPE_EMBED' && p.mixtapeMetadata?.href) body = `[${body}](${p.mixtapeMetadata.href})`;
    else if (/^H[234]$/.test(type)) body = `${'#'.repeat(Number(type[1]))} ${body}`;
    else if (['BQ', 'PQ'].includes(type)) body = body.split('\n').map((v) => `> ${v}`).join('\n');
    if (type === 'OLI') body = `${++ordered}. ${body}`; else { ordered = 0; if (type === 'ULI') body = `- ${body}`; }
    if (body) parts.push(body);
  }
  requireValue(parts.length > 0, post.isLocked ? 'authenticationRequired' : 'sourceError');
  const u = post.creator || {};
  return { title: post.title || '', kind: 'article', text: paragraphs.map((p) => p.text || '').join('\n\n'), markdown: parts.join('\n\n'), media,
    authorInfo:authorInfo({id:u.id,username:u.username,displayName:u.name,avatarUrl:u.imageId && `https://miro.medium.com/v2/${u.imageId}`,profileUrl:u.username && `https://medium.com/@${u.username}`}) };
}
export default async function extract({ url }, attempts) {
  const id = requireValue(new URL(url).pathname.replace(/\/$/, '').match(/(?:^|-|\/)([0-9a-f]{8,12})$/)?.[1], 'unsupportedUrl');
  return fallback([
    ['graphql', async () => { const data = await getJson('https://medium.com/_/graphql', { json: [{ operationName: 'P', variables: { id }, query }] }); return { ...decodePost(requireValue(data[0]?.data?.post)), contentId: id }; }],
    ['article-dom', async () => { const page = await request(url); return { ...genericArticle(page.body, page.url), contentId: id, resolvedUrl: page.url }; }],
  ], attempts);
}
