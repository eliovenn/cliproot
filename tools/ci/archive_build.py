# Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
"""Preserve executable permissions and symlinks before uploading artifacts."""
import argparse
from pathlib import Path
import re
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument('--name', required=True)
parser.add_argument('--source', required=True)
args = parser.parse_args()
if not re.fullmatch(r'[a-zA-Z0-9_-]+', args.name):
    parser.error('Invalid artifact name.')
root = Path(__file__).resolve().parents[2]
source = (root / args.source).resolve()
if not source.is_relative_to(root / 'examples/flutter/build') or not source.exists():
    parser.error('The artifact source must be an existing validation build.')
output = root / 'examples/flutter/validation-results'
output.mkdir(exist_ok=True)
archive = output / f'{args.name}.tar.gz'
with tarfile.open(archive, 'w:gz', dereference=False) as bundle:
    bundle.add(source, arcname=source.name)
print(f'Archived validation build: {archive}')
