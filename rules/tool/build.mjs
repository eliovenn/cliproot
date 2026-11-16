import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { catalog } from '../src/catalog.js';
import { thirdPartyNotices } from './notices.mjs';
const root = resolve(import.meta.dirname, '..'), assets = resolve(root, '../resources/bootstrap'), dist = resolve(root, 'dist');
const release = process.env.SOURCE_RELEASE || '0.1.0';
await Promise.all([mkdir(assets, { recursive: true }), mkdir(dist, { recursive: true })]);
const sources = [], bundles = [];
for (const definition of catalog) {
  const platform = { ...definition, version: release };
  const built = await build({ stdin: { contents: `import extract from './src/platforms/${platform.id}.js'; import { entry } from './src/sdk/core.js'; const platform=${JSON.stringify(platform)}; export const parse=entry(platform,extract); export function describe(){return {id:platform.id,version:platform.version,apiVersion:1};}`,
    resolveDir: root, sourcefile: `${platform.id}.entry.js` }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
    legalComments: 'inline', external: ['crypto'], define: { 'process.env.NODE_ENV': '"production"' } });
  const code = built.outputFiles[0].contents, sha256 = createHash('sha256').update(code).digest('hex');
  bundles.push({id:platform.id,sha256,code});
  sources.push({ ...platform, entry: `${sha256}.js`, sha256 });
}
const manifest = JSON.stringify({ manifestVersion: 1, hostApiVersion: 1, resultSchemaVersion: 1, release, sources }, null, 2) + '\n';
const notices = await thirdPartyNotices(root);
for (const {id,sha256,code} of bundles) await Promise.all([writeFile(resolve(assets, `${id}.js`), code), writeFile(resolve(dist, `${sha256}.js`), code)]);
await Promise.all([writeFile(resolve(assets, 'manifest.json'), manifest), writeFile(resolve(dist, 'manifest.json'), manifest)]);
await Promise.all([writeFile(resolve(assets, 'THIRD_PARTY_LICENSES.txt'), notices), writeFile(resolve(dist, 'THIRD_PARTY_LICENSES.txt'), notices)]);
console.log(`Built ${sources.length} source bundles, release ${release}. CDN directory: rules/dist/`);
