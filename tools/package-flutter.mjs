// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
import { access, cp, mkdir, mkdtemp, copyFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = resolve(root, 'packages/flutter');
const required = ['lib/cliproot_flutter.dart', 'lib/src/rust/api.dart', 'lib/src/rust/frb_generated.dart', 'lib/src/rust/frb_generated.io.dart', 'lib/src/native/native_library.g.dart', 'lib/src/third_party/native_library.record_use_mapping.g.dart', 'src/native_library.h', 'hook/build.dart'];
for (const name of required) await access(resolve(sdk, name));
const ignored = new Set(['.dart_tool', 'build', 'rust', '.git'].map(name => join(sdk, name)));
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
const output = await mkdtemp(join(dist, 'cliproot_flutter-'));
await cp(sdk, output, {
  recursive: true,
  filter: path => !ignored.has(path),
});
const rust = join(output, 'rust');
await mkdir(rust);
for (const name of ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml']) {
  await copyFile(resolve(root, name), join(rust, name));
}
for (const name of ['crates', 'resources']) {
  await cp(resolve(root, name), join(rust, name), { recursive: true });
}
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await copyFile(resolve(root, name), join(output, name));
}
for (const name of required) await access(resolve(output, name));
for (const name of ['Cargo.lock', 'crates/cliproot-core/Cargo.toml', 'crates/cliproot-frb/rust-toolchain.toml', 'resources/bootstrap/manifest.json']) {
  await access(resolve(rust, name));
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ path: output }));
} else {
  console.log(`Prepared self-contained Flutter source package: ${output}`);
  console.log('No binary build, package publication, or upload was performed.');
}
