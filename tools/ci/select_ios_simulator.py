# Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
"""Select an available iPhone runtime without hardcoding a device UUID."""
import json
import os
from pathlib import Path
import re
import subprocess

result = subprocess.run(['xcrun', 'simctl', 'list', 'devices', 'available', '--json'],
                        capture_output=True, text=True, check=True)
devices = json.loads(result.stdout)['devices']
runtimes = sorted((key for key in devices if '.iOS-' in key),
                  key=lambda key: tuple(int(part) for part in re.findall(r'\d+', key)),
                  reverse=True)
selected = None
for runtime in runtimes:
    selected = next((device for device in devices[runtime]
                     if device.get('isAvailable', True) and device['name'].startswith('iPhone')), None)
    if selected:
        break
if not selected:
    raise RuntimeError('No available iPhone simulator runtime is installed.')
device = selected['udid']
if selected['state'] != 'Booted':
    subprocess.run(['xcrun', 'simctl', 'boot', device], check=True)
subprocess.run(['xcrun', 'simctl', 'bootstatus', device, '-b'], check=True)
if not os.environ.get('GITHUB_ENV'):
    raise RuntimeError('This selector must run in GitHub Actions.')
with Path(os.environ['GITHUB_ENV']).open('a', encoding='utf8') as environment:
    environment.write(f'CLIPROOT_IOS_DEVICE={device}\n')
print(f'Selected simulator: {selected["name"]} ({device})')
