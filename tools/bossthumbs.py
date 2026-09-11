#!/usr/bin/env python3
"""Story Mode's portraits, at the size they are actually drawn.

MEASURED, not guessed. Opening Story Mode on a 4x-throttled phone took 1356ms,
and only 24ms of that was building the DOM. The rest was fetching fourteen
620x900 PNGs — 6 MB of art — to draw them at 74px on the road and 54px on a
card. About thirty-five times more pixels than any screen ever uses.

The thumbnails bake in the SAME crop the CSS does. `.sn-face img` is
object-fit:cover with object-position:50% 18%, so for a 620x900 portrait in a
square box the visible window is 620 tall, offset (900-620)*0.18 = 50px from
the top. Cropping anywhere else would move every face a little, which is the
kind of change nobody can name and everybody notices.

256px because the largest draw is 74px and a 3x phone wants 222. Generous on
purpose: the file is small either way and being short of pixels is visible
while having spare is not.

The full-size originals stay. They are the source, and something may want a
big portrait later.

  python3 tools/bossthumbs.py
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, 'art', 'ui')
OUT = os.path.join(SRC, 'thumb')

SIDE = 256
OBJECT_POSITION_Y = 0.18          # must match .snode .sn-face img in extra.css


def crop_like_css(im):
    w, h = im.size
    if w >= h:                      # already wide: centre it
        side = h
        x = (w - side) // 2
        y = 0
    else:
        side = w
        x = 0
        y = int((h - side) * OBJECT_POSITION_Y)
    return im.crop((x, y, x + side, y + side))


def main():
    os.makedirs(OUT, exist_ok=True)
    names = sorted(f for f in os.listdir(SRC)
                   if f.startswith('boss-') and f.endswith('.png'))
    if not names:
        sys.exit('no boss-*.png in ' + SRC)
    before = after = 0
    for n in names:
        p = os.path.join(SRC, n)
        before += os.path.getsize(p)
        im = Image.open(p).convert('RGB')
        th = crop_like_css(im).resize((SIDE, SIDE), Image.LANCZOS)
        dst = os.path.join(OUT, n.replace('.png', '.webp'))
        th.save(dst, 'WEBP', quality=82, method=6)
        after += os.path.getsize(dst)
    print('%d portraits: %.1f MB -> %.0f KB  (%.0fx smaller)'
          % (len(names), before / 1048576.0, after / 1024.0,
             before / float(after)))
    print('wrote', os.path.relpath(OUT, HERE))


if __name__ == '__main__':
    main()
