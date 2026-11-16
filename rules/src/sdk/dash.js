import { DOMParser } from 'linkedom';
import { absolute, variants } from './core.js';
// SegmentBase representations point at complete byte-addressable resources.
export function dashBaseUrls(xml, base) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml'), result = [];
  const named = (node, name) => node.localName?.split(':').at(-1) === name;
  for (const r of [...doc.querySelectorAll('*')].filter((n) => named(n,'Representation'))) {
    const chain = []; for (let n = r; n?.nodeType === 1; n = n.parentNode) chain.unshift(n);
    if (chain.some((n) => [...n.children].some((c) => named(c,'SegmentTemplate') || named(c,'SegmentList')))) continue;
    const attr = (name) => [...chain].reverse().map((n) => n.getAttribute(name)).find(Boolean);
    let urls = [base], found = false;
    for (const node of chain) {
      const bases = [...node.children].filter((n) => named(n,'BaseURL'));
      if (bases.length) { found = true; urls = urls.flatMap((url) => bases.map((n) => absolute(n.textContent.trim(),url))).filter(Boolean); }
    }
    if (!found) continue;
    const mime = attr('mimeType') || '', audio = mime.startsWith('audio/') || attr('contentType') === 'audio';
    const period = chain.find((n) => named(n,'Period'));
    result.push(...variants(urls, { mimeType: mime, width: Number(attr('width')) || null, height: Number(attr('height')) || null,
      codecs: attr('codecs'), bitrate: Number(attr('bandwidth')) || null,
      hasVideo: !audio, hasAudio: audio, audioGroupId: `dash-${period?.getAttribute('id') || '0'}` }));
  }
  return result;
}
