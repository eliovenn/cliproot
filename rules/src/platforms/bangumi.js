import { getJson, image, requireValue } from '../sdk/core.js';
import { authorInfo } from '../sdk/author.js';

export function bbcode(content) {
  const root = { children: [] }, stack = [root], images = [];
  const re = /\[(\/?)(img|url|b|i|s|u|mask|quote|code|user|size|color|align|left|right|center|photo)(?:=([^\]]*))?\]/gi;
  let pos = 0;
  for (const match of content.matchAll(re)) {
    stack.at(-1).children.push(content.slice(pos, match.index));
    const [, close, raw, value] = match, tag = raw.toLowerCase();
    if (close) {
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
    } else { const node = { tag, value, children: [] }; stack.at(-1).children.push(node); stack.push(node); }
    pos = match.index + match[0].length;
  }
  stack.at(-1).children.push(content.slice(pos));
  function render(node) {
    if (typeof node === 'string') return node;
    const body = node.children.map(render).join('');
    switch (node.tag) {
      case 'img': case 'photo': {
        const url = node.tag === 'photo' ? `https://lain.bgm.tv/pic/photo/l/${body.trim().replace(/^\//, '')}` : body.trim();
        images.push(url); return `![](${url})`;
      }
      case 'url': return node.value ? `[${body}](${node.value})` : body;
      case 'b': return `**${body}**`;
      case 'i': return `*${body}*`;
      case 's': return `~~${body}~~`;
      case 'quote': return body.trim().split('\n').map((v) => `> ${v}`).join('\n');
      case 'code': return `\n\`\`\`\n${body.trim()}\n\`\`\`\n`;
      case 'user': return `@${body}`;
      default: return body;
    }
  }
  return { markdown: render(root).trim(), images };
}
export default async function extract({ url }) {
  const m = requireValue(new URL(url).pathname.match(/\/(?:(subject|group)\/topic|rakuen\/topic\/(subject|group)|(blog))\/(\d+)/), 'unsupportedUrl');
  const kind = m[1] || m[2] || m[3], id = m[4], base = 'https://next.bgm.tv/p1';
  const data = await getJson(kind === 'blog' ? `${base}/blogs/${id}` : `${base}/${kind === 'subject' ? 'subjects' : 'groups'}/-/topics/${id}`);
  const result = bbcode(kind === 'blog' ? data.content || '' : data.replies?.[0]?.content || '');
  if (kind === 'blog') {
    const photos = await getJson(`${base}/blogs/${id}/photos?limit=100`);
    for (const p of photos.data || []) if (p.target) {
      const u = `https://lain.bgm.tv/pic/photo/l/${p.target.replace(/^\//, '')}`;
      if (!result.images.includes(u)) { result.images.push(u); result.markdown += `\n\n![](${u})`; }
    }
  }
  const user = data.user || data.replies?.[0]?.user || {};
  return { contentId: id, title: data.title || '', kind: 'article', text: result.markdown,
    authorInfo: authorInfo({id:user.id,username:user.username,displayName:user.nickname,avatarUrl:user.avatar?.large || user.avatar?.medium,
      profileUrl:(user.username || user.id) && `https://bgm.tv/user/${user.username || user.id}`}),
    markdown: result.markdown, media: result.images.map((u) => image(u)) };
}
