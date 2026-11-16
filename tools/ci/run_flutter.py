# Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
"""Run one Flutter validation command, retaining its real exit code and log."""
import argparse
import os
from pathlib import Path
import re
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--name', required=True)
parser.add_argument('command', nargs=argparse.REMAINDER)
args = parser.parse_args()
command = args.command[1:] if args.command[:1] == ['--'] else args.command
if not command or not re.fullmatch(r'[a-zA-Z0-9_-]+', args.name):
    parser.error('A safe log name and Flutter arguments are required.')
root = Path(__file__).resolve().parents[2]
example = root / 'examples/flutter'
logs = example / 'validation-results'
logs.mkdir(exist_ok=True)
# Windows Flutter is a .bat launcher. shell=True is only used there, with
# arguments supplied by this workflow, not by external request data.
with (logs / f'{args.name}.log').open('w', encoding='utf8') as output:
    process = subprocess.Popen(['flutter', *command], cwd=example,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, encoding='utf8', errors='replace',
                               shell=os.name == 'nt')
    for line in process.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
        output.write(line)
        output.flush()
    sys.exit(process.wait())
