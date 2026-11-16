import { request } from '../sdk/core.js';
import { genericArticle } from '../sdk/html.js';
export default async function extract({ url }) {
  const page = await request(url);
  return { ...genericArticle(page.body, page.url), resolvedUrl: page.url };
}
