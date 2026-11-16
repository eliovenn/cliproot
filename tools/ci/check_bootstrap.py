# Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
"""Check checked-in generated resources without contacting source websites."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2] / 'resources/bootstrap'
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf8'))
if manifest['manifestVersion'] != 1 or manifest['hostApiVersion'] != 1:
    raise RuntimeError('Unsupported manifest protocol.')
for source in manifest['sources']:
    code = (root / f'{source["id"]}.js').read_bytes()
    if hashlib.sha256(code).hexdigest() != source['sha256']:
        raise RuntimeError(f'Resource hash mismatch: {source["id"]}')
print(f'Embedded resources verified: {len(manifest["sources"])} rules.')
