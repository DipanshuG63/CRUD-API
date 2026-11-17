#!/usr/bin/env python3
"""Render actual PostgreSQL psql query output into PNG (not a direct UI screenshot)."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

lines = [
    'Live PostgreSQL query from CI: SELECT id, title, done FROM tasks ORDER BY id;',
    '',
] + Path(sys.argv[1]).read_text(encoding='utf-8').splitlines()
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 17)
except OSError:
    font = ImageFont.load_default()
width = max(1050, min(1800, max(len(s) for s in lines) * 11 + 55))
height = max(330, len(lines) * 26 + 80)
canvas = Image.new('RGB', (width, height), (17, 22, 30))
draw = ImageDraw.Draw(canvas)
draw.rectangle((0, 0, width, 39), fill=(45, 52, 66))
draw.text((20, 9), 'PostgreSQL - actual psql output (CI-rendered)', fill='white', font=font)
for index, line in enumerate(lines):
    draw.text((22, 58 + 26 * index), line[:160], fill=(219, 228, 236), font=font)
Path(sys.argv[2]).parent.mkdir(parents=True, exist_ok=True)
canvas.save(sys.argv[2])
