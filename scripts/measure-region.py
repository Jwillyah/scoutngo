#!/usr/bin/env python3 -I
"""
MEAN COLOUR OF A BOX IN SCREENSHOTS, before against after (Batch F, Section 2).

Usage:  scripts/measure-region.py <out.md> <title> <x0,y0,x1,y1 in CSS px at 3x> <label=png> [label=png ...]
Writes: <out.md> with each picture's mean sRGB, luminance (0-255) and hue in
the box. PNGs are read through macOS `sips` (to BMP); no dependencies.
"""
import struct, subprocess, sys, tempfile, os, colorsys, datetime

def load(png):
    tmp = tempfile.mktemp(suffix='.bmp')
    subprocess.run(['sips', '-s', 'format', 'bmp', png, '--out', tmp], check=True, capture_output=True)
    b = open(tmp, 'rb').read(); os.unlink(tmp)
    off = struct.unpack_from('<I', b, 10)[0]; w, h = struct.unpack_from('<ii', b, 18); bpp = struct.unpack_from('<H', b, 28)[0]
    rs = ((w * bpp // 8) + 3) // 4 * 4; flip = h > 0; h = abs(h); px = bpp // 8
    def get(x, y):
        yy = h - 1 - y if flip else y
        o = off + yy * rs + x * px
        return b[o + 2], b[o + 1], b[o]
    return w, h, get

out, title, box, *pairs = sys.argv[1:]
x0, y0, x1, y1 = [int(v) * 3 for v in box.split(',')]
rows = []
for p in pairs:
    label, path = p.split('=', 1)
    w, h, get = load(path)
    acc = [0, 0, 0]; n = 0
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            c = get(x, y); acc = [a + v for a, v in zip(acc, c)]; n += 1
    r, g, b = [a / n for a in acc]
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    hue = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)[0] * 360
    rows.append(f'| {label} | #{int(r):02x}{int(g):02x}{int(b):02x} | {lum:.0f} | {hue:.0f} |')
lines = [f'# {title}', '', f'Run {datetime.datetime.utcnow().isoformat()}Z by scripts/measure-region.py, box {box} (CSS px, read at 3x).', '', '| picture | mean colour | luminance | hue |', '|---|---|---|---|', *rows, '']
with open(out, 'a') as f: f.write('\n'.join(lines) + '\n')
print('\n'.join(rows))
