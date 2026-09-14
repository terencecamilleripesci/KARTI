#!/usr/bin/env python3
"""
tilelogos.py — the eleven missing shelf emblems, drawn as vector art.

WHY THIS AND NOT A PAINTED PNG. The tiles render at 34x34 CSS pixels. At
that size the thing that carries a logo is its SILHOUETTE and its contrast,
not its brushwork — so a bold vector emblem rasterised at 512 is not a
stand-in for painted art, it IS the art, and it costs nothing to make or
to change. (CODEX-TILE-LOGOS.md stays valid if richer painting is wanted
later: same filenames, same folder, drop in and these are replaced.)

THE HOUSE STYLE, read off the twenty-seven that already exist
(art/ui/logo-bomba.png, logo-serp.png, logo-kelma.png):
  · a saturated colour disc, lit from above
  · a white "sticker" rim around the whole badge
  · the subject in thick dark outline, chunky rounded forms
  · one gloss highlight, top-left
  · nothing small: at 34px, detail becomes mud

Run:  python3 tools/tilelogos.py            # write all eleven
      python3 tools/tilelogos.py kwizz      # just one
      python3 tools/tilelogos.py --sheet    # contact sheet to /tmp for review
"""
import os, sys, io

import gi
gi.require_version('Rsvg', '2.0')
from gi.repository import Rsvg
import cairo
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT  = os.path.join(ROOT, 'art', 'ui')
SIZE = 512

INK   = '#2B1B12'      # the outline brown-black every shape shares
OW    = 13             # outline width
GOLD  = '#FFC542'
GOLD2 = '#E09B1F'

# ── the badge under everything ─────────────────────────────────────
def badge(c1, c2, rim):
    """colour disc + white sticker rim, lit from above"""
    return f'''
  <circle cx="256" cy="256" r="212" fill="#FFFFFF"/>
  <circle cx="256" cy="256" r="197" fill="url(#disc)"/>
  <circle cx="256" cy="256" r="197" fill="none" stroke="{rim}" stroke-width="10"/>
  <path d="M 92 190 A 197 197 0 0 1 420 190 A 197 120 0 0 0 92 190 Z"
        fill="#FFFFFF" opacity="0.13"/>
'''

def defs(c1, c2, extra=''):
    return f'''<defs>
  <radialGradient id="disc" cx="50%" cy="32%" r="78%">
    <stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/>
  </radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#FFE08A"/><stop offset="55%" stop-color="{GOLD}"/>
    <stop offset="100%" stop-color="{GOLD2}"/>
  </linearGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#C6D2E4"/>
  </linearGradient>
  {extra}
</defs>'''

def svg(body, c1, c2, rim, extra=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" '
            f'viewBox="0 0 512 512">{defs(c1, c2, extra)}'
            f'<g>{badge(c1, c2, rim)}</g>'
            f'<g stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round" '
            f'stroke-linecap="round">{body}</g></svg>')

# ── the eleven ─────────────────────────────────────────────────────
def kwizz():
    """trivia on the buzzer: a red dome and a gold question mark"""
    body = f'''
  <ellipse cx="256" cy="392" rx="150" ry="34" fill="#5B2233"/>
  <path d="M 116 372 h 280 v -18 a 140 96 0 0 0 -280 0 Z" fill="#C0273C"/>
  <path d="M 116 354 a 140 96 0 0 1 280 0 a 140 62 0 0 1 -280 0 Z" fill="#E8455C"/>
  <ellipse cx="200" cy="312" rx="46" ry="24" fill="#FFFFFF" opacity="0.34" stroke="none"/>
  <path d="M 214 214 a 44 44 0 1 1 60 40 q -18 10 -18 30 v 10"
        fill="none" stroke="{INK}" stroke-width="46"/>
  <circle cx="256" cy="330" r="15" fill="{INK}" stroke="none"/>
  <path d="M 214 214 a 44 44 0 1 1 60 40 q -18 10 -18 30 v 10"
        fill="none" stroke="url(#gold)" stroke-width="26"/>
  <circle cx="256" cy="330" r="9" fill="{GOLD}" stroke="none"/>
'''
    return svg(body, '#3E6BD6', '#1B3382', '#12245C')

def lewwel():
    """reaction: the light has gone green"""
    body = f'''
  <rect x="176" y="104" width="160" height="304" rx="46" fill="#3A4154"/>
  <rect x="176" y="104" width="160" height="304" rx="46" fill="url(#steel)" opacity="0.12" stroke="none"/>
  <circle cx="256" cy="176" r="42" fill="#5A2733" stroke-width="9"/>
  <circle cx="256" cy="264" r="42" fill="#6A5A26" stroke-width="9"/>
  <circle cx="256" cy="352" r="50" fill="#3DDC84"/>
  <circle cx="256" cy="352" r="50" fill="none" stroke="#8CFFC0" stroke-width="8" opacity="0.9"/>
  <ellipse cx="240" cy="336" rx="19" ry="12" fill="#FFFFFF" opacity="0.5" stroke="none"/>
  <path d="M 348 330 h 46 M 348 366 h 66" stroke="{GOLD}" stroke-width="17"/>
  <path d="M 118 330 h -46 M 118 366 h -66" stroke="{GOLD}" stroke-width="17"/>
'''
    return svg(body, '#4B5570', '#1E2334', '#141826')

def oghla():
    """higher or lower: a card between two arrows"""
    body = f'''
  <path d="M 118 150 l 60 -22 a 20 20 0 0 1 26 12 l 62 172 a 20 20 0 0 1 -12 26
           l -60 22 a 20 20 0 0 1 -26 -12 l -62 -172 a 20 20 0 0 1 12 -26 Z"
        fill="#EDE3D0"/>
  <rect x="212" y="140" width="182" height="252" rx="26" fill="#FFF8EA"/>
  <path d="M 303 196 c 34 34 56 50 56 78 a 56 56 0 0 1 -112 0 c 0 -28 22 -44 56 -78 Z"
        fill="#D22E45"/>
  <path d="M 396 128 l 44 -52 l 44 52 Z" fill="url(#gold)" stroke-width="11"/>
  <path d="M 396 396 l 44 52 l 44 -52 Z" fill="#7FA8FF" stroke-width="11"/>
'''
    return svg(body, '#2FA98C', '#12523F', '#0B3527')

def tpingija():
    """draw it: a pencil making a loop"""
    body = f'''
  <path d="M 108 386 q 46 -104 128 -104 q 62 0 62 52 q 0 44 -50 44 q -40 0 -40 -34
           q 0 -46 62 -62" fill="none" stroke="{INK}" stroke-width="30"/>
  <path d="M 108 386 q 46 -104 128 -104 q 62 0 62 52 q 0 44 -50 44 q -40 0 -40 -34
           q 0 -46 62 -62" fill="none" stroke="#FFFFFF" stroke-width="15"/>
  <g transform="rotate(38 352 214)">
    <rect x="316" y="72" width="74" height="196" rx="12" fill="{GOLD}"/>
    <rect x="316" y="72" width="30" height="196" fill="#FFE08A" stroke="none"/>
    <rect x="316" y="60" width="74" height="30" rx="10" fill="#E8455C"/>
    <path d="M 316 268 h 74 l -37 66 Z" fill="#F0D6AE"/>
    <path d="M 336 304 h 34 l -17 30 Z" fill="{INK}" stroke="none"/>
  </g>
'''
    return svg(body, '#6E8BE8', '#2C3C8C', '#1B2660')

def falz():
    """the fake artist. THE MASK IS THE WHOLE EMBLEM.

       First attempt drew a paintbrush wearing the mask, and at 512 it read
       as a totem pole — the brush was the big shape and the mask sat across
       it like a moustache. The subject of this game is the LIAR, not the
       painting, so the mask is now the silhouette and the brush is just a
       diagonal behind it saying "at art"."""
    body = f'''
  <g transform="rotate(-34 256 268)">
    <rect x="228" y="88" width="58" height="212" rx="14" fill="#B9762F"/>
    <rect x="228" y="88" width="24" height="212" fill="#D89A54" stroke="none"/>
    <rect x="222" y="292" width="70" height="40" rx="10" fill="url(#steel)"/>
    <path d="M 228 330 h 58 l -29 74 Z" fill="{INK}" stroke-width="11"/>
  </g>
  <path d="M 92 208 q 164 -66 328 0 q 6 82 -50 96 q -114 -42 -228 0 q -56 -14 -50 -96 Z"
        fill="{INK}"/>
  <path d="M 92 208 q 164 -66 328 0" fill="none" stroke="#6B4A38" stroke-width="10"/>
  <ellipse cx="182" cy="240" rx="30" ry="24" fill="#FFF8EA" stroke="none"/>
  <ellipse cx="330" cy="240" rx="30" ry="24" fill="#FFF8EA" stroke="none"/>
  <circle cx="188" cy="244" r="11" fill="{INK}" stroke="none"/>
  <circle cx="324" cy="244" r="11" fill="{INK}" stroke="none"/>
'''
    return svg(body, '#9A6BE0', '#432483', '#2A1257')

def minlaktar():
    """who is most likely: three bubbles, one pointing"""
    body = f'''
  <path d="M 96 132 h 190 a 30 30 0 0 1 30 30 v 92 a 30 30 0 0 1 -30 30 h -128
           l -44 44 v -44 h -18 a 30 30 0 0 1 -30 -30 v -92 a 30 30 0 0 1 30 -30 Z"
        fill="#7FA8FF"/>
  <path d="M 258 216 h 158 a 30 30 0 0 1 30 30 v 84 a 30 30 0 0 1 -30 30 h -18 v 40
           l -40 -40 h -100 a 30 30 0 0 1 -30 -30 v -84 a 30 30 0 0 1 30 -30 Z"
        fill="#FFF8EA"/>
  <circle cx="150" cy="208" r="15" fill="{INK}" stroke="none"/>
  <circle cx="196" cy="208" r="15" fill="{INK}" stroke="none"/>
  <circle cx="242" cy="208" r="15" fill="{INK}" stroke="none"/>
  <path d="M 322 348 v -54 a 22 22 0 0 1 44 0 v 24 l 30 6 a 18 18 0 0 1 14 20
           l -8 40 a 26 26 0 0 1 -26 20 h -34 a 26 26 0 0 1 -26 -26 Z"
        fill="{GOLD}" stroke-width="11"/>
'''
    return svg(body, '#F0894B', '#9A3A14', '#63220B')

def katina():
    """the word chain: links, and one of them is a letter tile"""
    body = f'''
  <rect x="70" y="196" width="150" height="118" rx="59" fill="none"
        stroke="{INK}" stroke-width="48"/>
  <rect x="70" y="196" width="150" height="118" rx="59" fill="none"
        stroke="url(#gold)" stroke-width="28"/>
  <rect x="292" y="196" width="150" height="118" rx="59" fill="none"
        stroke="{INK}" stroke-width="48"/>
  <rect x="292" y="196" width="150" height="118" rx="59" fill="none"
        stroke="url(#gold)" stroke-width="28"/>
  <rect x="182" y="176" width="148" height="158" rx="26" fill="#F3E2C2"/>
  <rect x="196" y="190" width="120" height="130" rx="18" fill="#FFF6E2" stroke="none"/>
  <path d="M 256 218 l 40 84 h -24 l -8 -20 h -18 l -8 20 h -22 Z" fill="#8A4B24" stroke="none"/>
'''
    return svg(body, '#4FC0C8', '#155F72', '#0C3B4A')

def pari():
    """memory pairs: one card down, one turning to a star"""
    body = f'''
  <g transform="rotate(-12 190 268)">
    <rect x="106" y="152" width="168" height="234" rx="24" fill="#3B2C6E"/>
    <rect x="126" y="172" width="128" height="194" rx="14" fill="none"
          stroke="{GOLD}" stroke-width="10"/>
    <circle cx="190" cy="269" r="34" fill="none" stroke="{GOLD}" stroke-width="10"/>
  </g>
  <g transform="rotate(10 330 262)">
    <rect x="252" y="140" width="164" height="234" rx="24" fill="#FFF8EA"/>
    <path d="M 334 190 l 26 54 60 8 -44 42 11 60 -53 -29 -53 29 11 -60 -44 -42 60 -8 Z"
          fill="url(#gold)" stroke-width="11" transform="translate(-1 12) scale(0.86) translate(52 32)"/>
  </g>
'''
    return svg(body, '#E86A9B', '#8C1C4E', '#5A0F31')

def emoji():
    """guess it from emoji: a grin under a glass"""
    body = f'''
  <circle cx="234" cy="262" r="146" fill="url(#gold)"/>
  <ellipse cx="190" cy="188" rx="52" ry="30" fill="#FFFFFF" opacity="0.34" stroke="none"/>
  <ellipse cx="184" cy="228" rx="19" ry="26" fill="{INK}" stroke="none"/>
  <ellipse cx="286" cy="228" rx="19" ry="26" fill="{INK}" stroke="none"/>
  <path d="M 160 296 q 74 84 148 0 Z" fill="{INK}" stroke-width="11"/>
  <path d="M 178 316 q 56 40 112 0 Z" fill="#E8455C" stroke="none"/>
  <circle cx="352" cy="164" r="80" fill="#BFE3FF" opacity="0.42" stroke-width="14"/>
  <path d="M 408 222 l 62 62" stroke="{INK}" stroke-width="40"/>
  <path d="M 408 222 l 62 62" stroke="#C6D2E4" stroke-width="22"/>
'''
    return svg(body, '#5AC0F0', '#155C8C', '#0C3A5C')

def ritmu():
    """keep the beat: a drum and two rings"""
    body = f'''
  <path d="M 150 250 v 92 q 0 44 106 44 t 106 -44 v -92 Z" fill="#B9762F"/>
  <ellipse cx="256" cy="250" rx="106" ry="52" fill="#F3E2C2"/>
  <ellipse cx="256" cy="250" rx="106" ry="52" fill="none" stroke="{INK}" stroke-width="13"/>
  <ellipse cx="222" cy="234" rx="34" ry="15" fill="#FFFFFF" opacity="0.5" stroke="none"/>
  <path d="M 168 288 l 22 42 M 256 300 v 46 M 344 288 l -22 42"
        stroke="#8A4B24" stroke-width="12"/>
  <path d="M 386 150 a 96 96 0 0 1 0 116" fill="none" stroke="{GOLD}" stroke-width="18"/>
  <path d="M 424 116 a 150 150 0 0 1 0 184" fill="none" stroke="{GOLD}" stroke-width="15" opacity="0.6"/>
  <path d="M 126 150 a 96 96 0 0 0 0 116" fill="none" stroke="{GOLD}" stroke-width="18"/>
  <path d="M 88 116 a 150 150 0 0 0 0 184" fill="none" stroke="{GOLD}" stroke-width="15" opacity="0.6"/>
'''
    return svg(body, '#7E63E8', '#33207F', '#1F1354')

def mimika():
    """charades: the mime's mask"""
    body = f'''
  <path d="M 256 106 q 116 0 116 106 q 0 122 -116 194 q -116 -72 -116 -194
           q 0 -106 116 -106 Z" fill="#FFF8EA"/>
  <path d="M 176 214 q 40 -34 80 0 q -40 22 -80 0 Z" fill="{INK}" stroke-width="10"/>
  <path d="M 336 214 q -40 -34 -80 0 q 40 22 80 0 Z" fill="{INK}" stroke-width="10"/>
  <path d="M 200 300 q 56 62 112 0" fill="none" stroke="{INK}" stroke-width="16"/>
  <path d="M 168 168 q 40 -30 74 -8" fill="none" stroke="{INK}" stroke-width="14"/>
  <path d="M 344 168 q -40 -30 -74 -8" fill="none" stroke="{INK}" stroke-width="14"/>
  <circle cx="216" cy="264" r="11" fill="#E8455C" stroke="none"/>
  <circle cx="296" cy="264" r="11" fill="#E8455C" stroke="none"/>
'''
    return svg(body, '#E8556B', '#8A162E', '#5A0C1D')

def muzika():
    """the music round: a record, and the note over it.

       RITMU already owns a drum, so this cannot be percussion. A vinyl
       reads as MUSIC at any size and the note in front gives it the
       silhouette — dark disc, gold centre, gold note."""
    body = f'''
  <circle cx="232" cy="256" r="146" fill="#231A2E"/>
  <circle cx="232" cy="256" r="146" fill="none" stroke="#4A3A5E" stroke-width="8"/>
  <circle cx="232" cy="256" r="112" fill="none" stroke="#4A3A5E" stroke-width="7"/>
  <circle cx="232" cy="256" r="84" fill="none" stroke="#4A3A5E" stroke-width="6"/>
  <path d="M 128 176 a 146 146 0 0 1 84 -62 a 132 132 0 0 0 -74 74 Z"
        fill="#FFFFFF" opacity="0.22" stroke="none"/>
  <circle cx="232" cy="256" r="46" fill="url(#gold)"/>
  <circle cx="232" cy="256" r="12" fill="{INK}" stroke="none"/>
  <path d="M 300 344 v -170 l 118 -30 v 170" fill="none" stroke="{INK}" stroke-width="42"/>
  <path d="M 300 344 v -170 l 118 -30 v 170" fill="none" stroke="url(#gold)" stroke-width="24"/>
  <ellipse cx="282" cy="348" rx="40" ry="31" fill="url(#gold)" transform="rotate(-18 282 348)"/>
  <ellipse cx="400" cy="318" rx="40" ry="31" fill="url(#gold)" transform="rotate(-18 400 318)"/>
'''
    return svg(body, '#F05A8C', '#7A1340', '#500A2A')

GAMES = {
    'kwizz': kwizz, 'lewwel': lewwel, 'oghla': oghla, 'tpingija': tpingija,
    'falz': falz, 'minlaktar': minlaktar, 'katina': katina, 'pari': pari,
    'emoji': emoji, 'ritmu': ritmu, 'mimika': mimika, 'muzika': muzika,
}

def render(name):
    src = GAMES[name]().encode('utf-8')
    handle = Rsvg.Handle.new_from_data(src)
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, SIZE, SIZE)
    ctx = cairo.Context(surf)
    handle.render_cairo(ctx)
    buf = io.BytesIO()
    surf.write_to_png(buf)
    im = Image.open(io.BytesIO(buf.getvalue())).convert('RGBA')
    return im

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    sheet = '--sheet' in sys.argv
    names = args or list(GAMES)
    os.makedirs(OUT, exist_ok=True)
    ims = []
    for n in names:
        if n not in GAMES:
            print('  no such game:', n); continue
        im = render(n)
        p = os.path.join(OUT, 'logo-%s.png' % n)
        im.save(p, optimize=True)
        ims.append((n, im))
        print('  %-10s %s  %.1f kB' % (n, im.size, os.path.getsize(p) / 1024))
    if sheet and ims:
        cols = 6
        rows = (len(ims) + cols - 1) // cols
        cell = 150
        sh = Image.new('RGBA', (cols * cell, rows * (cell + 34)), (26, 20, 44, 255))
        for i, (n, im) in enumerate(ims):
            x, y = (i % cols) * cell, (i // cols) * (cell + 34)
            sh.alpha_composite(im.resize((cell - 12, cell - 12), Image.LANCZOS), (x + 6, y + 6))
            # and the size it is ACTUALLY seen at
            sh.alpha_composite(im.resize((34, 34), Image.LANCZOS), (x + 8, y + cell))
        sh.save('/tmp/tilelogos-sheet.png')
        print('  sheet -> /tmp/tilelogos-sheet.png')

if __name__ == '__main__':
    main()
