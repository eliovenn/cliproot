// Recover reading semantics before inline styles are discarded. This deliberately
// uses explicit markup and repeated inline layout, never a browser/CSS cascade.
const children = (node) => [...node.children];
const hasLooseText = (node) => [...node.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
const role = (node) => node.getAttribute('role')?.toLowerCase();
const content = (node) => node.textContent.trim() || node.querySelector('img,video,audio');

function styles(node) {
  return Object.fromEntries((node.getAttribute('style') || '').split(';').map((item) => {
    const colon = item.indexOf(':');
    return [item.slice(0, colon).trim().toLowerCase(), item.slice(colon + 1).trim().toLowerCase().replace(/\s*!important$/, '')];
  }).filter(([key]) => key));
}
const display = (node) => styles(node).display;
const border = (value = '') => !/\b(none|hidden)\b/.test(value) && /(?:[1-9][\d.]*|0?\.\d+)(?:px|em|rem|pt)\b|\b(thin|medium|thick)\b/.test(value);
const leftBorder = (s) => border(s['border-left']) || border(s['border-inline-start']) ||
  (border(s['border-left-width']) && /solid|dashed|dotted|double/.test(s['border-left-style'] || s['border-style'] || ''));
const background = (s) => {
  const value = s['background-color'] || s.background || '';
  return value && !/^(transparent|none|inherit|initial|unset)$/.test(value) &&
    !/(?:rgba|hsla)\([^,]+,[^,]+,[^,]+,\s*0(?:\.0+)?\s*\)$|(?:rgba?|hsla?)\([^)]*\/\s*0(?:\.0+)?%?\s*\)$/.test(value) &&
    !/url\(|gradient\(/.test(value) && !/^#(?:[\da-f]{6}00|[\da-f]{3}0)$/.test(value);
};
const padded = (s) => Object.entries(s).some(([key, value]) => /^padding(?:-|$)/.test(key) && /[1-9]/.test(value));
const bold = (node) => /^(bold|[6-9]00)$/.test(styles(node)['font-weight'] || '') ||
  ['th', 'strong', 'b'].includes(node.localName) || role(node) === 'columnheader';
const columnKey = (node) => {
  const s = styles(node);
  return ['width', 'min-width', 'flex', 'flex-basis', 'flex-grow'].map((key) => s[key] || '').join('/');
};
const rowKind = (node) => {
  if (role(node) === 'row' || display(node) === 'table-row') return 'table';
  const s = styles(node);
  if (s.display === 'flex' && !/column|reverse|\bwrap\b/.test([s['flex-direction'], s['flex-wrap'], s['flex-flow']].join(' '))) return 'flex';
  if (s.display === 'grid' && s['grid-template-columns']) return `grid:${s['grid-template-columns']}`;
  return null;
};

function tableRows(node) {
  const explicit = ['table', 'grid'].includes(role(node)) || ['table', 'inline-table'].includes(display(node));
  const rows = children(node).flatMap((child) =>
    role(child) === 'rowgroup' || /table-(header|row|footer)-group/.test(display(child) || '') ? children(child) : [child]);
  let caption;
  if (rows[0] && !rowKind(rows[0]) && (bold(rows[0]) || /^h[2-6]$/.test(rows[0].localName)) && rows[0].textContent.trim().length < 160) caption = rows.shift();
  if (hasLooseText(node) || rows.length < 2 || rows.some(hasLooseText)) return null;
  const kind = rowKind(rows[0]);
  if (!kind || rows.some((row) => rowKind(row) !== kind)) return null;
  let cells = rows.map(children);
  if (explicit || kind === 'table') return cells.every((row) => row.length) ? { cells, caption } : null;
  const width = cells[0].length;
  if (width < 2 || width > 16 || cells.some((row) => row.length !== width)) return null;
  // Empty painted swatches/circles aren't data columns. Their widths may vary
  // (e.g. a type-scale demonstration), while the textual columns still align.
  const populated = cells[0].map((_, i) => i).filter((i) => cells.some((row) => content(row[i])));
  cells = cells.map((row) => populated.map((i) => row[i]));
  // Navigation, cards and swatch/icon lists aren't tabular data. Require at
  // least two populated columns, aligned sizing and repeated row boundaries.
  if (cells.some((row) => row.filter(content).length < 2) ||
      rows.some((row) => row.querySelector('h1,h2,h3,h4,h5,h6,table,nav,article,video'))) return null;
  if (cells.every((row) => {
    const first = row[0], s = styles(first);
    return s.width && s.height && first.textContent.trim().length <= 2;
  })) return null;
  const keys = cells[0].map(columnKey);
  if (cells.some((row) => row.some((cell, i) => columnKey(cell) !== keys[i]))) return null;
  const sized = kind.startsWith('grid:') || keys.some((key) => key !== '////');
  const divided = rows.slice(0, -1).every((row) => {
    const s = styles(row);
    return border(s['border-bottom']) || border(s.border);
  });
  if (!sized || (!divided && rows.length < 3)) return null;
  // A row made entirely of links is usually navigation, not a comparison.
  if (cells.every((row) => row.every((cell) => cell.querySelector('a')?.textContent.trim() === cell.textContent.trim()))) return null;
  return { cells, caption };
}

function flatGrid(node) {
  const s = styles(node);
  if (s.display !== 'grid' || hasLooseText(node) || node.querySelector('h1,h2,h3,h4,h5,h6,article,img,table')) return null;
  const columns = s['grid-template-columns'] || '';
  const repeat = columns.match(/^repeat\(\s*(\d+)\s*,\s*(?:[\d.]+(?:fr|px|%|em|rem)|auto|minmax\([^()]+\))\s*\)$/);
  const width = repeat ? Number(repeat[1]) : /^([\d.]+(?:fr|px|%|em|rem)|auto)(\s+([\d.]+(?:fr|px|%|em|rem)|auto))+$/.test(columns) ? columns.split(/\s+/).length : 0;
  const cells = children(node);
  if (width < 2 || width > 16 || cells.length < width * 2 || cells.length % width) return null;
  if (cells.some((cell) => {
    const c = styles(cell);
    return c['grid-column'] || c['grid-row'] || c.order || (!border(c.border) && !border(c['border-bottom']));
  })) return null;
  return { cells: Array.from({ length: cells.length / width }, (_, i) => cells.slice(i * width, (i + 1) * width)) };
}

function replaceTable(node, { cells: rows, caption }) {
  const document = node.ownerDocument, table = document.createElement('table');
  if (caption) {
    const label = document.createElement('caption');
    for (const child of [...caption.childNodes]) label.appendChild(child);
    table.appendChild(label);
  }
  // Only promote a visually distinct whole row, never a bold key column.
  const header = rows[0].every((cell) => bold(cell) || bold(cell.parentElement)) &&
    rows.slice(1).some((row) => !row.every((cell) => bold(cell) || bold(cell.parentElement)));
  for (const [index, cells] of rows.entries()) {
    const row = document.createElement('tr');
    for (const source of cells) {
      const cell = document.createElement(index === 0 && header || role(source) === 'columnheader' ? 'th' : 'td');
      const alignment = styles(source)['text-align'];
      if (['left', 'center', 'right'].includes(alignment)) cell.setAttribute('align', alignment);
      for (const name of ['colspan', 'rowspan']) {
        const span = source.getAttribute(name) || source.getAttribute(`aria-${name}`);
        if (span) cell.setAttribute(name, span);
      }
      for (const child of [...source.childNodes]) cell.appendChild(child);
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  node.replaceWith(table);
}

function removeCodeLineNumbers(pre) {
  const source = pre.textContent;
  const lineCount = source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
  const markers = [];
  let line = 0, offset = 0, atLineStart = true;
  function visit(node) {
    if (node.nodeType === 3) {
      const parts = node.textContent.split('\n');
      offset += node.textContent.length;
      line += parts.length - 1;
      const trailingWhitespace = /^[\t ]*$/.test(parts.at(-1));
      atLineStart = parts.length > 1 ? trailingWhitespace : atLineStart && trailingWhitespace;
      return;
    }
    if (atLineStart && node.localName === 'span' &&
        /^[\t ]*\d+[\t ]*$/.test(node.textContent) && node.textContent.trim() === String(line + 1)) {
      const s = styles(node), padding = (s.padding || '').split(/\s+/);
      const right = s['padding-inline-end'] || s['padding-right'] || padding[1] || padding[0];
      if (parseFloat(right) > 0) {
        offset += node.textContent.length;
        markers.push({ node, end: offset });
        atLineStart = false;
        return;
      }
    }
    for (const child of node.childNodes) visit(child);
  }
  visit(pre);
  // The reported editor gives every source line a separately padded numeric
  // span. Require the complete 1..N sequence and markup, never strip raw digits.
  // A single decorated 1 must have code after it, not just a numeric literal.
  const singleCode = markers.length === 1 ? source.slice(markers[0].end).trim() : '';
  if (markers.length === lineCount &&
      (markers.length >= 2 || singleCode && !/^\d+$/.test(singleCode) && !Number.isFinite(Number(source.trim())))) {
    for (const { node } of markers) node.remove();
  }
}

export function normalizeStructures(document) {
  // Turndown reads code via textContent, which ignores HTML br elements. Restore
  // those source lines before Readability/Markdown conversion, without trimming
  // literal newlines, empty lines, tabs or repeated indentation spaces.
  for (const pre of document.querySelectorAll('pre')) {
    for (const br of pre.querySelectorAll('br')) br.replaceWith(document.createTextNode('\n'));
    for (const node of [pre, ...pre.querySelectorAll('*')]) {
      for (const child of node.childNodes) {
        // Editors encode code spaces as nbsp; regular spaces also allow wrapping.
        if (child.nodeType === 3) child.textContent = child.textContent.replace(/\u00a0/g, ' ');
      }
    }
    removeCodeLineNumbers(pre);
  }
  for (const node of [...document.querySelectorAll('div,section')].reverse()) {
    if (!node.isConnected || node.closest('table,pre,code,nav,header,footer,[role="navigation"]')) continue;
    const rows = tableRows(node) || flatGrid(node);
    if (rows) replaceTable(node, rows);
  }
  for (const node of document.querySelectorAll('td,th')) {
    const alignment = styles(node)['text-align'];
    if (['left', 'center', 'right'].includes(alignment)) node.setAttribute('align', alignment);
  }
  for (const node of document.querySelectorAll('aside,blockquote,div,section')) {
    if (!content(node) || node.closest('table,pre,code,nav,header,footer,[role="navigation"]')) continue;
    const s = styles(node), focused = leftBorder(s) || node.localName === 'blockquote';
    const semantic = node.localName === 'aside' || ['note', 'alert'].includes(role(node)) ||
      node.getAttribute('data-note-container') === 'callout' ||
      [...node.classList].some((name) => /^(callout|admonition|notice|alert)(?:-(?:note|tip|info|important|warning|caution|danger|error|success))?$/i.test(name));
    // A background alone is often a page/card/swatch. Visual callouts also
    // need an inset and an accent border, or a short emphasized lead + prose.
    const lead = node.firstElementChild;
    const titled = lead && (bold(lead) || /^h[3-6]$/.test(lead.localName)) &&
      lead.textContent.trim().length < 100 && node.textContent.trim().length > lead.textContent.trim().length + 30 &&
      !node.querySelector('table,h1,h2') && !rowKind(node) && !rowKind(node.parentElement || node);
    const visual = background(s) && (node.localName === 'blockquote' || padded(s) && (leftBorder(s) || titled));
    if (semantic || visual) {
      node.setAttribute('data-parsehub-callout', focused ? 'quote' : 'plain');
      // Readability removes every aside, including semantic article notes.
      if (node.localName === 'aside') {
        const replacement = document.createElement('div');
        for (const attr of [...node.attributes]) replacement.setAttribute(attr.name, attr.value);
        for (const child of [...node.childNodes]) replacement.appendChild(child);
        node.replaceWith(replacement);
      }
    }
  }
}
