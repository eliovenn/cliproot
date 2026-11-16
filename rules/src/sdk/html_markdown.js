import TurndownService from 'turndown';

export function markdownService() {
  const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  const inner = (node) => {
    const wrapper = node.ownerDocument.createElement('div');
    for (const child of [...node.childNodes]) wrapper.appendChild(child.cloneNode(true));
    return service.turndown(wrapper).trim();
  };
  service.addRule('callout', {
    filter: (node) => ['plain', 'quote'].includes(node.getAttribute('data-parsehub-callout')),
    replacement: (content, node) => {
      const marker = node.getAttribute('data-parsehub-callout') === 'quote' ? 'PARSEHUB-QUOTE-CALLOUT' : 'PARSEHUB-CALLOUT';
      return '\n\n' + (`[!${marker}]\n\n${content.trim()}`).split('\n').map((line) => `> ${line}`).join('\n') + '\n\n';
    },
  });
  service.addRule('table', {
    filter: 'table',
    replacement: (content, table) => {
      const elements = [...table.querySelectorAll('tr')].filter((row) => row.closest('table') === table);
      const grid = elements.map(() => []), alignments = [];
      let width = 0;
      for (const [r, row] of elements.entries()) {
        let c = 0;
        for (const cell of [...row.children].filter((child) => ['td', 'th'].includes(child.localName))) {
          const colspan = Math.max(1, Math.min(100, parseInt(cell.getAttribute('colspan')) || 1));
          const rawHeight = cell.getAttribute('rowspan');
          let remaining = 1;
          while (r + remaining < elements.length && elements[r + remaining].parentElement === row.parentElement) remaining++;
          const rowspan = rawHeight === '0' ? remaining : Math.max(1, Math.min(remaining, parseInt(rawHeight) || 1));
          while (Array.from({ length: colspan }, (_, x) => grid[r][c + x]).some((v) => v !== undefined)) c++;
          // Bound malformed expansion; retain the original reading text on fallback.
          if ((c + colspan) * elements.length > 20000) return '\n\n' + content + '\n\n';
          const value = inner(cell).replace(/\r\n?/g, '\n').replace(/ *\n+ */g, '<br>')
            .replace(/(\\*)\|/g, (match, slashes) => slashes.length % 2 ? match : `${slashes}\\|`);
          for (let y = r; y < r + rowspan; y++) {
            for (let x = c; x < c + colspan; x++) grid[y][x] = y === r && x === c ? value : '';
          }
          const align = cell.getAttribute('align');
          if (!alignments[c] && ['left', 'center', 'right'].includes(align)) alignments[c] = align;
          c += colspan;
          width = Math.max(width, c);
        }
      }
      if (!width) return '\n\n' + content + '\n\n';
      const header = elements[0].parentElement.localName === 'thead' ||
        [...elements[0].children].filter((cell) => ['th', 'td'].includes(cell.localName)).every((cell) => cell.localName === 'th');
      const line = (row) => '| ' + Array.from({ length: width }, (_, c) => row[c] || '').join(' | ') + ' |';
      const captions = [...table.children].filter((node) => node.localName === 'caption').map(inner).filter(Boolean);
      return '\n\n' + [...captions, [
        line(header ? grid[0] : []),
        line(Array.from({ length: width }, (_, c) => ({ left: ':---', center: ':---:', right: '---:' }[alignments[c]] || '---'))),
        ...grid.slice(header ? 1 : 0).map(line),
      ].join('\n')].join('\n\n') + '\n\n';
    },
  });
  return service;
}
