import { request, getJson, cookie, randomHex, requireValue, image, video, fallback, SourceError } from '../sdk/core.js';
import { article, documentOf } from '../sdk/html.js';
import { zhihuSign } from '../sdk/zhihu_sign.js';
import { authorInfo } from '../sdk/author.js';
async function api(url) {
  const dc0 = requireValue(await cookie('d_c0', url), 'authenticationRequired'), u = new URL(url);
  const data = await getJson(url, { headers: { Referer: 'https://zhuanlan.zhihu.com/', 'x-zse-93': '101_3_3.0',
    'x-zse-96': zhihuSign(u.pathname + u.search, dc0, Buffer.from(await randomHex(16), 'hex')) } });
  if (data.error) throw new SourceError([100, 401, 403].includes(data.error.code) ? 'authenticationRequired' : 'sourceError');
  return data;
}
export function decodePin(data, url) {
  let html = '', title = ''; const media = [];
  for (const c of data.content || []) {
    if (c.type === 'text') { title ||= c.title || ''; html += c.content || ''; }
    if (c.type === 'image') media.push(image(c.original_url || c.url, { width: c.width, height: c.height }));
    if (c.type === 'video') { const v = c.video_info || {}; media.push(video(Object.values(v.playlist || {}).map((p) => p.url), { durationMs: Number(v.duration || 0) * 1000 }, v.thumbnail)); }
  }
  const result = article(html, url, title); result.media.push(...media); return result;
}
export default async function extract({ url }, attempts) {
  const u = new URL(url), path = u.pathname;
  if (path.includes('/story/')) {
    const id = requireValue(path.match(/\/story\/(\d+)/)?.[1], 'unsupportedUrl');
    const data = await getJson(`https://daily.zhihu.com/api/7/story/${id}`);
    return { ...article(data.body || '', url, data.title || ''), contentId: id };
  }
  return fallback([
    ['signed-api', async () => {
      const q = path.match(/\/question\/(\d+)(?:\/answer\/(\d+))?/), p = path.match(/\/(p|pin)\/(\d+)/); let data, id;
      if (q) {
        id = q[2];
        if (!id) {
          const list = await api(`https://www.zhihu.com/api/v4/questions/${q[1]}/answers?offset=&limit=1&sort_by=default&include=data%5B*%5D.content`);
          id = list.data?.[0]?.id;
          if (!id) { const question = await api(`https://www.zhihu.com/api/v4/questions/${q[1]}`); return { title: question.title, contentId: q[1] }; }
        }
        data = await api(`https://www.zhihu.com/api/v4/answers/${id}?include=content`);
      } else if (p) { id = p[2]; data = await api(p[1] === 'p' ? `https://zhuanlan.zhihu.com/api/articles/${id}` : `https://www.zhihu.com/api/v4/pins/${id}`); }
      else throw new SourceError('unsupportedUrl');
      const a = data.author || {};
      return { ...(p?.[1] === 'pin' ? decodePin(data, url) : article(data.content || '', url, data.question?.title || data.title || '')), contentId: String(id),
        authorInfo:authorInfo({id:a.id,username:a.url_token,displayName:a.name,avatarUrl:a.avatar_url,profileUrl:a.url_token && `https://www.zhihu.com/people/${a.url_token}`}) };
    }],
    ['article-dom', async () => {
      const page = await request(url), doc = documentOf(page.body), node = requireValue(doc.querySelector('.Post-RichTextContainer,.AnswerItem .RichContent-inner .RichText'), 'authenticationRequired');
      return { ...article(node.innerHTML, page.url, doc.querySelector('h1')?.textContent || ''), resolvedUrl: page.url };
    }],
  ], attempts);
}
