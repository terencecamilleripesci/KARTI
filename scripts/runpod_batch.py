#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
KARTI — RUNPOD BATCH GENERATOR                    (runs ON THE POD, not the Pi)
═══════════════════════════════════════════════════════════════════════════════

Reads art/prompts.jsonl (built on the Pi by scripts/make_prompts.js) and
generates every image with an SDXL-class model via diffusers.

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  WE GENERATE THE ART-WINDOW IMAGE ONLY. NEVER A WHOLE CARD.             │
  │  No frame, no border, no nameplate, no stat box, no text. The game      │
  │  draws the card around the art in HTML/CSS, so stats and jokes can be   │
  │  rebalanced forever without regenerating one pixel.                     │
  └─────────────────────────────────────────────────────────────────────────┘

Behaviour
  · RESUME-SAFE  — any output that already exists is skipped. A dropped SSH
                   session or a dead pod costs you nothing but the current image.
  · PRIORITY     — all P1 assets finish before any P2 starts, so a run that gets
                   cut short still leaves a complete-looking game.
  · DETERMINISTIC— seed comes from the card id, recorded in prompts.jsonl and
                   written into the PNG. Same card → same picture, forever.
  · BATCHED      — prompts are grouped by resolution and run --batch at a time.
  · FORGIVING    — an image that fails is retried once, then logged and skipped.
                   The run never aborts.

Typical use on the pod
  python3 runpod_batch.py                          # everything, P1 first
  python3 runpod_batch.py --limit 5                # the 5-image style check
  python3 runpod_batch.py --priority P1            # P1 only
  python3 runpod_batch.py --only petard,kunjata    # re-run specific rejects
  python3 runpod_batch.py --only-file rejects.txt  # re-run a list of rejects
  python3 runpod_batch.py --variants 2             # 2 takes per card, pick later

Install on the pod: see docs/RUNPOD_RUNBOOK.md §4.
═══════════════════════════════════════════════════════════════════════════════
"""

import argparse
import json
import os
import sys
import time
import traceback
from datetime import timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

DEFAULT_MODEL = "RunDiffusion/Juggernaut-XL-v9"
FALLBACK_MODEL = "stabilityai/stable-diffusion-xl-base-1.0"

# Locked render settings — docs/ART_STYLE_BIBLE.md §2. Changing any of these
# mid-project means every previously generated image is a different style.
STEPS = 30
CFG = 6.0


# ─────────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────────
def hms(seconds):
    if seconds is None or seconds != seconds or seconds < 0:
        return "--:--:--"
    return str(timedelta(seconds=int(seconds)))


def log(msg):
    print(msg, flush=True)


def load_jobs(path):
    jobs = []
    with open(path, "r", encoding="utf-8") as fh:
        for n, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                jobs.append(json.loads(line))
            except json.JSONDecodeError as e:
                log(f"  ! prompts.jsonl line {n} is not valid JSON, skipped ({e})")
    return jobs


def out_path(outdir, job, variant):
    """variant 0 = the canonical take; 1+ = alternates for later selection."""
    suffix = "" if variant == 0 else f"__v{variant + 1}"
    return os.path.join(outdir, f"{job['id']}{suffix}.png")


# ─────────────────────────────────────────────────────────────────────────────
# pipeline
# ─────────────────────────────────────────────────────────────────────────────
def build_pipeline(model, dtype_str):
    import torch
    from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler

    if not torch.cuda.is_available():
        log("!! No CUDA device visible. This script is meant to run on the pod.")
        sys.exit(2)

    dtype = {"fp16": torch.float16, "bf16": torch.bfloat16, "fp32": torch.float32}[dtype_str]
    log(f"  loading {model}  ({dtype_str}) …")
    t0 = time.time()

    def _load(mid):
        # not every checkpoint publishes fp16 `variant` files — try, then don't
        for kwargs in ({"variant": "fp16"} if dtype_str == "fp16" else {}, {}):
            try:
                return StableDiffusionXLPipeline.from_pretrained(
                    mid, torch_dtype=dtype, use_safetensors=True,
                    add_watermarker=False, **kwargs,
                )
            except Exception as e:
                last = e
        raise last

    try:
        pipe = _load(model)
    except Exception as e:
        log(f"  !! could not load {model}: {e}")
        if model == FALLBACK_MODEL:
            raise
        log(f"  -> falling back to {FALLBACK_MODEL}")
        pipe = _load(FALLBACK_MODEL)

    # DPM++ 2M Karras — the locked sampler (ART_STYLE_BIBLE §2)
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(
        pipe.scheduler.config, use_karras_sigmas=True, algorithm_type="dpmsolver++"
    )
    pipe.to("cuda")
    pipe.set_progress_bar_config(disable=True)
    if hasattr(pipe, "watermark"):
        pipe.watermark = None
    try:
        pipe.enable_vae_slicing()
    except Exception:
        pass

    log(f"  model ready in {time.time() - t0:.1f}s")
    return pipe


def generate_batch(pipe, batch, outdir, variant, steps, cfg):
    """Generate one same-resolution batch. Returns list of (job, ok, error)."""
    import torch
    from PIL import PngImagePlugin

    gens = [torch.Generator(device="cuda").manual_seed(int(j["seed"]) + variant * 100003)
            for j in batch]

    images = pipe(
        prompt=[j["prompt"] for j in batch],
        negative_prompt=[j["negative"] for j in batch],
        width=batch[0]["width"], height=batch[0]["height"],
        num_inference_steps=steps, guidance_scale=cfg,
        generator=gens,
    ).images

    results = []
    for job, img in zip(batch, images):
        try:
            # stamp provenance so a stray PNG can always be traced back
            meta = PngImagePlugin.PngInfo()
            meta.add_text("karti_id", str(job["id"]))
            meta.add_text("karti_seed", str(int(job["seed"]) + variant * 100003))
            meta.add_text("karti_variant", str(variant + 1))
            meta.add_text("karti_steps", str(steps))
            meta.add_text("karti_cfg", str(cfg))
            p = out_path(outdir, job, variant)
            img.save(p, "PNG", pnginfo=meta)
            results.append((job, True, None))
        except Exception as e:
            results.append((job, False, str(e)))
    return results


# ─────────────────────────────────────────────────────────────────────────────
# main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="KARTI batch art generator (RunPod)")
    ap.add_argument("--prompts", default=os.path.join(ROOT, "art", "prompts.jsonl"))
    ap.add_argument("--outdir", default=os.path.join(ROOT, "art", "raw"),
                    help="raw PNGs land here; postprocess.py turns them into art/<id>.jpg")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--dtype", default="fp16", choices=["fp16", "bf16", "fp32"])
    ap.add_argument("--batch", type=int, default=4, help="images per forward pass")
    ap.add_argument("--steps", type=int, default=STEPS)
    ap.add_argument("--cfg", type=float, default=CFG)
    ap.add_argument("--variants", type=int, default=1, help="takes per prompt (pick the best later)")
    ap.add_argument("--priority", choices=["P1", "P2", "all"], default="all")
    ap.add_argument("--only", default="", help="comma-separated ids to (re)generate")
    ap.add_argument("--only-file", default="", help="file with one id per line")
    ap.add_argument("--limit", type=int, default=0, help="stop after N images (style check)")
    ap.add_argument("--force", action="store_true", help="regenerate even if the file exists")
    ap.add_argument("--dry-run", action="store_true", help="plan the run, load nothing")
    args = ap.parse_args()

    if not os.path.exists(args.prompts):
        log(f"!! {args.prompts} not found. Run `node scripts/make_prompts.js` on the Pi "
            f"and upload art/prompts.jsonl.")
        sys.exit(1)

    jobs = load_jobs(args.prompts)
    log("═" * 74)
    log("  KARTI — BATCH ART GENERATION")
    log("  ART-WINDOW IMAGES ONLY — no frames, no borders, no text.")
    log("═" * 74)
    log(f"  prompts file : {args.prompts}  ({len(jobs)} entries)")

    # ── filter ───────────────────────────────────────────────────────────────
    only = set()
    if args.only:
        only |= {s.strip() for s in args.only.split(",") if s.strip()}
    if args.only_file and os.path.exists(args.only_file):
        with open(args.only_file, encoding="utf-8") as fh:
            only |= {ln.strip() for ln in fh if ln.strip() and not ln.startswith("#")}
    if only:
        jobs = [j for j in jobs if j["id"] in only]
        missing = only - {j["id"] for j in jobs}
        if missing:
            log(f"  ! not found in prompts.jsonl: {', '.join(sorted(missing))}")
    if args.priority != "all":
        jobs = [j for j in jobs if j.get("priority", "P1") == args.priority]

    # ── P1 before P2, then stable by id ──────────────────────────────────────
    jobs.sort(key=lambda j: (0 if j.get("priority", "P1") == "P1" else 1, j["id"]))

    os.makedirs(args.outdir, exist_ok=True)

    # ── expand variants and drop anything already on disk (RESUME) ───────────
    todo, skipped = [], 0
    for v in range(args.variants):
        for j in jobs:
            if not args.force and os.path.exists(out_path(args.outdir, j, v)):
                skipped += 1
                continue
            todo.append((j, v))
    # keep P1-first ordering across the variant expansion
    todo.sort(key=lambda t: (t[1], 0 if t[0].get("priority", "P1") == "P1" else 1, t[0]["id"]))
    if args.limit:
        todo = todo[: args.limit]

    n_p1 = sum(1 for j, _ in todo if j.get("priority", "P1") == "P1")
    log(f"  output dir   : {args.outdir}")
    log(f"  model        : {args.model}   {args.dtype}  steps={args.steps} cfg={args.cfg}")
    log(f"  variants     : {args.variants}   batch={args.batch}")
    log(f"  already done : {skipped}  (skipped — resume-safe)")
    log(f"  TO GENERATE  : {len(todo)}   (P1 {n_p1} / P2 {len(todo) - n_p1})")
    log("═" * 74)

    if not todo:
        log("  Nothing to do. Everything already exists. (--force to redo)")
        return
    if args.dry_run:
        for j, v in todo[:20]:
            log(f"   would generate {out_path(args.outdir, j, v)}  seed={j['seed']} "
                f"{j['width']}x{j['height']} [{j.get('priority')}]")
        if len(todo) > 20:
            log(f"   … and {len(todo) - 20} more")
        return

    pipe = build_pipeline(args.model, args.dtype)

    # ── group into same-resolution batches, preserving priority order ────────
    batches, cur, cur_key = [], [], None
    for j, v in todo:
        key = (j["width"], j["height"], v, j.get("priority", "P1"))
        if key != cur_key or len(cur) >= args.batch:
            if cur:
                batches.append((cur_key, cur))
            cur, cur_key = [], key
        cur.append(j)
    if cur:
        batches.append((cur_key, cur))

    done = 0
    failed = []
    total = len(todo)
    t_start = time.time()
    per_image = []

    for key, batch in batches:
        w, h, v, pri = key
        t0 = time.time()
        try:
            results = generate_batch(pipe, batch, args.outdir, v, args.steps, args.cfg)
        except Exception as e:
            # whole batch blew up (usually OOM) — retry one at a time
            log(f"  !! batch of {len(batch)} failed ({type(e).__name__}: {e}) — retrying singly")
            try:
                import torch
                torch.cuda.empty_cache()
            except Exception:
                pass
            results = []
            for j in batch:
                try:
                    results += generate_batch(pipe, [j], args.outdir, v, args.steps, args.cfg)
                except Exception as e2:
                    results.append((j, False, f"{type(e2).__name__}: {e2}"))

        # retry each individual failure exactly once, then give up on it
        retry = [j for j, ok, _ in results if not ok]
        if retry:
            log(f"  .. retrying {len(retry)} failed image(s) once")
            kept = [(j, ok, err) for j, ok, err in results if ok]
            for j in retry:
                try:
                    kept += generate_batch(pipe, [j], args.outdir, v, args.steps, args.cfg)
                except Exception as e:
                    kept.append((j, False, f"{type(e).__name__}: {e}"))
            results = kept

        dt = time.time() - t0
        per_image.append(dt / max(1, len(batch)))
        recent = per_image[-12:]
        avg = sum(recent) / len(recent)

        for j, ok, err in results:
            done += 1
            if not ok:
                failed.append((j["id"], err))
                log(f"  [{done:>4}/{total}] FAIL {j['id']}  {err}")

        remaining = total - done
        eta = remaining * avg
        pct = 100.0 * done / total
        last = batch[-1]["id"]
        log(f"  [{done:>4}/{total}] {pct:5.1f}%  {pri} {w}x{h} x{len(batch)}  "
            f"{dt:5.1f}s ({dt / max(1, len(batch)):4.1f}s/img)  "
            f"elapsed {hms(time.time() - t_start)}  ETA {hms(eta)}   …{last}")

    # ── summary ──────────────────────────────────────────────────────────────
    elapsed = time.time() - t_start
    log("═" * 74)
    log(f"  DONE   {done - len(failed)}/{total} images in {hms(elapsed)}"
        f"   ({elapsed / max(1, done):.2f}s per image)")
    if failed:
        log(f"  FAILED {len(failed)}:")
        for cid, err in failed:
            log(f"    - {cid}: {err}")
        rej = os.path.join(args.outdir, "_failed.txt")
        with open(rej, "w", encoding="utf-8") as fh:
            fh.write("\n".join(cid for cid, _ in failed) + "\n")
        log(f"  wrote {rej}  —  re-run with:  --only-file {rej}")
    else:
        log("  no failures.")
    log("")
    log("  NEXT: download the whole raw folder to the Pi, then KILL THE POD.")
    log("        (docs/RUNPOD_RUNBOOK.md §7-§8)")
    log("═" * 74)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("\n  interrupted — everything already written is kept, just re-run to resume.")
        sys.exit(130)
    except Exception:
        traceback.print_exc()
        sys.exit(1)
