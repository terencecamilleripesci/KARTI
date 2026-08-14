#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
KARTI — POSTPROCESS                                    (runs ON THE PI, after)
═══════════════════════════════════════════════════════════════════════════════

Turns the raw 1024px PNGs that came off the pod into game-ready assets:
crop to the aspect the game actually needs, resize, compress, strip metadata,
and report the total weight so the repo stays GitHub-Pages friendly.

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  These are ART-WINDOW IMAGES ONLY.                                      │
  │  This script must never add a frame, a border, a caption or a badge.    │
  │  css/cards.css draws the entire card around the art in HTML, which is   │
  │  what lets stats, jokes and effects be rebalanced without re-rendering. │
  └─────────────────────────────────────────────────────────────────────────┘

WHY CARD ART IS SQUARE
  .card__art is `flex:1`, so its aspect ratio changes with the length of the
  joke text and the card size. Measured in Chromium against css/cards.css:
      .card--sm   0.87 – 1.00      .card--md   1.32 – 1.41      .card--lg  1.31 – 1.39
  The image is drawn with `object-fit: cover`, so one file is centre-cropped
  three different ways. A 1:1 master is the only shape that survives all three:
      worst landscape window (1.412) keeps the middle 70.8% of the height
      worst portrait  window (0.872) keeps the middle 87.2% of the width
  → prompts reserve a safe zone of the central 70% height x 85% width, and this
  script ships a square so the browser can take whichever crop it needs.

BUDGET
      card art   768 x 768 JPEG   target <= 120 KB   hard cap 160 KB
  Quality starts at 82 and steps down (78, 74, 70, 66) until the cap is met, so
  no single image can ever blow the budget. At 200 cards that is <= 24 MB for
  the whole set, ~32 MB including every UI asset — comfortably inside the
  100 MB GitHub Pages soft limit with room for several more sets.

Usage
  python3 scripts/postprocess.py                 # process everything found
  python3 scripts/postprocess.py --only petard   # just these ids
  python3 scripts/postprocess.py --report        # weigh what exists, change nothing
  python3 scripts/postprocess.py --force         # redo even if the output exists
  python3 scripts/postprocess.py --pick petard=2 # promote variant __v2 to canonical
═══════════════════════════════════════════════════════════════════════════════
"""

import argparse
import json
import os
import shutil
import sys

try:
    from PIL import Image, ImageFilter
except ImportError:
    sys.exit("!! Pillow is required:  pip3 install --user Pillow")

try:
    import numpy as np
except ImportError:
    np = None

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ART = os.path.join(ROOT, "art")

JPEG_QUALITY_LADDER = [82, 78, 74, 70, 66]
CARD_TARGET_KB = 120          # what we aim for
CARD_MAX_KB = 160             # hard cap — quality drops until we're under it
UI_MAX_KB = 400               # backgrounds and packs are allowed to be heavier

# effects composited additively -> alpha from luminance.
# everything else with alpha is a solid object -> background cut out from the edges.
GLOW_IDS = {"burst", "glow-rare", "glow-epic", "glow-legendary"}


# ─────────────────────────────────────────────────────────────────────────────
def kb(path):
    return os.path.getsize(path) / 1024.0


def human_mb(total_bytes):
    return f"{total_bytes / 1048576.0:.2f} MB"


def load_jobs(path):
    jobs = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                jobs.append(json.loads(line))
    return jobs


# ─────────────────────────────────────────────────────────────────────────────
# geometry
# ─────────────────────────────────────────────────────────────────────────────
def fit_cover(img, tw, th):
    """Centre-crop to the target aspect, then resize. No letterboxing, no squash."""
    sw, sh = img.size
    want = tw / th
    have = sw / sh
    if have > want:                       # too wide -> trim the sides
        nw = int(round(sh * want))
        x = (sw - nw) // 2
        img = img.crop((x, 0, x + nw, sh))
    elif have < want:                     # too tall -> trim top and bottom
        nh = int(round(sw / want))
        y = (sh - nh) // 2
        img = img.crop((0, y, sw, y + nh))
    return img.resize((tw, th), Image.LANCZOS)


def fit_contain(img, tw, th):
    """Fit the whole subject inside the box and pad. Used for cut-out objects."""
    sw, sh = img.size
    scale = min(tw / sw, th / sh)
    nw, nh = max(1, int(round(sw * scale))), max(1, int(round(sh * scale)))
    img = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    canvas.paste(img, ((tw - nw) // 2, (th - nh) // 2))
    return canvas


# ─────────────────────────────────────────────────────────────────────────────
# alpha extraction (assets were generated on a pure flat black background)
# ─────────────────────────────────────────────────────────────────────────────
def alpha_from_glow(img):
    """Additive effect: brightness IS opacity."""
    rgb = img.convert("RGB")
    a = rgb.convert("L").filter(ImageFilter.GaussianBlur(0.6))
    out = rgb.convert("RGBA")
    out.putalpha(a)
    return out


def alpha_from_cutout(img, threshold=26):
    """
    Solid object on black: make transparent only the dark pixels that are
    CONNECTED TO THE EDGE. Dark areas inside the object (outlines, shadows)
    are kept, which is exactly what a bold-outline cartoon needs.
    """
    rgb = img.convert("RGB")
    if np is None:                        # graceful fallback, slightly cruder
        a = rgb.convert("L").point(lambda v: 0 if v < threshold else 255)
        out = rgb.convert("RGBA")
        out.putalpha(a)
        return out

    arr = np.asarray(rgb, dtype=np.uint8)
    dark = arr.max(axis=2) < threshold    # candidate background pixels
    h, w = dark.shape

    # iterative edge-connected flood: seed from the border, grow into dark pixels
    bg = np.zeros_like(dark)
    bg[0, :] |= dark[0, :]
    bg[-1, :] |= dark[-1, :]
    bg[:, 0] |= dark[:, 0]
    bg[:, -1] |= dark[:, -1]
    while True:
        grown = bg.copy()
        grown[1:, :] |= bg[:-1, :]
        grown[:-1, :] |= bg[1:, :]
        grown[:, 1:] |= bg[:, :-1]
        grown[:, :-1] |= bg[:, 1:]
        grown &= dark
        if grown.sum() == bg.sum():
            break
        bg = grown

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    out = rgb.convert("RGBA")
    a_img = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(0.7))
    out.putalpha(a_img)

    # trim to the subject so `contain` framing is tight and predictable
    bbox = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        out = out.crop(bbox)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# save
# ─────────────────────────────────────────────────────────────────────────────
def save_jpg(img, path, max_kb):
    """Step the quality down until we're inside budget. Metadata is never written."""
    if img.mode != "RGB":
        bgm = Image.new("RGB", img.size, (14, 11, 20))     # --karti-bg
        bgm.paste(img, mask=img.getchannel("A") if img.mode == "RGBA" else None)
        img = bgm
    used = JPEG_QUALITY_LADDER[-1]
    for q in JPEG_QUALITY_LADDER:
        img.save(path, "JPEG", quality=q, optimize=True,
                 progressive=True, subsampling="4:2:0")
        used = q
        if kb(path) <= max_kb:
            break
    return used


def save_png(img, path):
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    # quantise to a palette when we can — bold flat art compresses enormously
    try:
        q = img.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.NONE)
        q.save(path, "PNG", optimize=True)
        if os.path.getsize(path) < 4_000_000:
            return "pal256"
    except Exception:
        pass
    img.save(path, "PNG", optimize=True)
    return "rgba"


# ─────────────────────────────────────────────────────────────────────────────
def process(job, rawdir, force):
    """Returns (status, out_path, note)."""
    out_rel = job["file"]                                   # e.g. art/petard.jpg
    out_abs = os.path.join(ROOT, out_rel)
    raw_abs = os.path.join(rawdir, job["id"] + ".png")

    if not os.path.exists(raw_abs):
        return ("missing", out_abs, "no raw PNG")
    if os.path.exists(out_abs) and not force:
        return ("skip", out_abs, "")

    os.makedirs(os.path.dirname(out_abs), exist_ok=True)
    spec = job.get("out", {})
    tw = int(spec.get("w", 768))
    th = int(spec.get("h", 768))
    fmt = spec.get("fmt", "jpg").lower()
    fit = spec.get("fit", "cover")
    wants_alpha = bool(spec.get("alpha")) and fmt == "png"

    with Image.open(raw_abs) as src:
        src.load()
        img = src.copy()

    if wants_alpha:
        img = alpha_from_glow(img) if job["id"] in GLOW_IDS else alpha_from_cutout(img)
        img = fit_contain(img, tw, th) if fit == "contain" else fit_cover(img, tw, th)
        note = save_png(img, out_abs)
    else:
        img = fit_cover(img, tw, th)
        cap = CARD_MAX_KB if job.get("kind") == "card" else UI_MAX_KB
        if fmt == "png":
            note = save_png(img, out_abs)
        else:
            note = f"q{save_jpg(img, out_abs, cap)}"

    return ("ok", out_abs, note)


def derive_icons():
    """App icons, favicon and the OG image are cropped from ui/emblem.png — no GPU."""
    made = []
    emblem = os.path.join(ART, "ui", "emblem.png")
    if not os.path.exists(emblem):
        return made
    with Image.open(emblem) as src:
        src.load()
        em = src.convert("RGBA")
    # NOTE: written into art/ui/, NOT into icons/. The PWA icons in icons/ are
    # owned by the app side of the project — we never silently overwrite them.
    # If you want the generated emblem as the launcher icon, copy them across:
    #   cp art/ui/appicon-192.png icons/icon-192.png
    icons_dir = os.path.join(ART, "ui")
    os.makedirs(icons_dir, exist_ok=True)
    for size in (192, 512):
        canvas = Image.new("RGB", (size, size), (14, 11, 20))
        pad = int(size * 0.08)
        fitted = fit_contain(em, size - 2 * pad, size - 2 * pad)
        canvas.paste(fitted, (pad, pad), fitted)
        p = os.path.join(icons_dir, f"appicon-{size}.png")
        canvas.save(p, "PNG", optimize=True)
        made.append(p)

    # social / OG card: 1200x630, emblem centred on the home background if we have it
    home = os.path.join(ART, "ui", "home-bg.jpg")
    og = Image.new("RGB", (1200, 630), (14, 11, 20))
    if os.path.exists(home):
        with Image.open(home) as hb:
            hb.load()
            og = fit_cover(hb.convert("RGB"), 1200, 630)
    badge = fit_contain(em, 380, 380)
    og.paste(badge, ((1200 - 380) // 2, (630 - 380) // 2), badge)
    p = os.path.join(ART, "ui", "og.jpg")
    save_jpg(og, p, UI_MAX_KB)
    made.append(p)
    return made


def pick_variant(rawdir, spec):
    """--pick petard=2 : promote art/raw/petard__v2.png to art/raw/petard.png"""
    cid, _, n = spec.partition("=")
    n = int(n or 2)
    src = os.path.join(rawdir, f"{cid}__v{n}.png" if n > 1 else f"{cid}.png")
    dst = os.path.join(rawdir, f"{cid}.png")
    if not os.path.exists(src):
        return f"  ! {src} not found"
    shutil.copyfile(src, dst)
    return f"  promoted {os.path.basename(src)} -> {os.path.basename(dst)}"


# ─────────────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="KARTI raw -> game-ready assets")
    ap.add_argument("--prompts", default=os.path.join(ART, "prompts.jsonl"))
    ap.add_argument("--rawdir", default=os.path.join(ART, "raw"))
    ap.add_argument("--only", default="", help="comma-separated ids")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--report", action="store_true", help="weigh existing output, change nothing")
    ap.add_argument("--pick", action="append", default=[], help="id=N  promote variant N")
    ap.add_argument("--no-icons", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.prompts):
        sys.exit(f"!! {args.prompts} not found — run `node scripts/make_prompts.js` first.")
    jobs = load_jobs(args.prompts)

    for spec in args.pick:
        print(pick_variant(args.rawdir, spec))

    if args.only:
        want = {s.strip() for s in args.only.split(",") if s.strip()}
        jobs = [j for j in jobs if j["id"] in want]

    print("═" * 74)
    print("  KARTI — POSTPROCESS   (art-window images only: no frames, no text)")
    print("═" * 74)
    print(f"  raw dir : {args.rawdir}")
    print(f"  jobs    : {len(jobs)}")
    print()

    counts = {"ok": 0, "skip": 0, "missing": 0}
    biggest = []
    if args.report:
        counts["skip"] = len(jobs)
    else:
        for i, job in enumerate(jobs, 1):
            status, out_abs, note = process(job, args.rawdir, args.force)
            counts[status] += 1
            if status == "ok":
                size = kb(out_abs)
                biggest.append((size, job["file"]))
                flag = ""
                if job.get("kind") == "card" and size > CARD_TARGET_KB:
                    flag = "  <- over target"
                print(f"  [{i:>4}/{len(jobs)}] {job['file']:<34} "
                      f"{job['out']['w']}x{job['out']['h']} {note:<7} {size:7.1f} KB{flag}")

    # ── icons / OG derived on the Pi, no GPU needed ──────────────────────────
    if not args.report and not args.no_icons and not args.only:
        made = derive_icons()
        for p in made:
            print(f"  derived  {os.path.relpath(p, ROOT):<34} {kb(p):7.1f} KB")

    # ── weigh everything that exists ─────────────────────────────────────────
    tot_card = tot_card_n = 0
    tot_ui = tot_ui_n = 0
    for job in jobs:
        p = os.path.join(ROOT, job["file"])
        if not os.path.exists(p):
            continue
        s = os.path.getsize(p)
        if job.get("kind") == "card":
            tot_card += s
            tot_card_n += 1
        else:
            tot_ui += s
            tot_ui_n += 1

    print()
    print("═" * 74)
    print(f"  processed {counts['ok']}   skipped {counts['skip']}   "
          f"missing raw {counts['missing']}")
    print()
    print(f"  CARD ART : {tot_card_n:>4} files   {human_mb(tot_card):>10}"
          f"   avg {tot_card / max(1, tot_card_n) / 1024:.0f} KB")
    print(f"  UI ART   : {tot_ui_n:>4} files   {human_mb(tot_ui):>10}"
          f"   avg {tot_ui / max(1, tot_ui_n) / 1024:.0f} KB")
    print(f"  TOTAL    : {tot_card_n + tot_ui_n:>4} files   {human_mb(tot_card + tot_ui):>10}")
    print()
    budget = 100 * 1048576
    used = tot_card + tot_ui
    print(f"  GitHub Pages soft limit 100 MB — using {100.0 * used / budget:.1f}% of it.")
    if tot_card_n:
        at200 = tot_card / tot_card_n * 200
        print(f"  extrapolated to 200 cards: {human_mb(at200)} of card art.")
    if biggest:
        biggest.sort(reverse=True)
        print()
        print("  heaviest files:")
        for s, f in biggest[:8]:
            print(f"    {s:7.1f} KB  {f}")
    if counts["missing"]:
        print()
        print(f"  ! {counts['missing']} raw PNGs are missing — those cards were never "
              f"generated, or the download from the pod was incomplete.")
    print("═" * 74)


if __name__ == "__main__":
    main()
