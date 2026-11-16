import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function thirdPartyNotices(root) {
  const upstream = await readFile(resolve(root, '../THIRD_PARTY_NOTICES.md'), 'utf8');
  const paths = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], {cwd: root, encoding: 'utf8'})
    .trim().split('\n').filter((path) => path !== root).sort();
  const sections = [upstream];
  for (const path of [...new Set(paths)]) {
    const pkg = JSON.parse(await readFile(resolve(path, 'package.json'), 'utf8'));
    const files = (await readdir(path)).filter((name) => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name)).sort();
    sections.push(`\n## ${pkg.name}@${pkg.version} (${pkg.license})\n`);
    if (!files.length) {
      // Explicitly reviewed upstream texts for packages that omit them in npm.
      sections.push(await readFile(resolve(root, 'licenses', `${pkg.name.replace('/', '__')}-${pkg.version}.txt`), 'utf8'));
    } else {
      for (const name of files) sections.push(await readFile(resolve(path, name), 'utf8'));
    }
  }
  return sections.join('\n') + '\n';
}
