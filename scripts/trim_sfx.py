#!/usr/bin/env python3
"""
trim_sfx.py — apply the trim_to column of docs/SOUND_ELEVENLABS.md.

The sheet has always carried a trim target per sound and nothing ever applied
it, so every one-shot was playing its full generated length. ui.back was
specified at 0.10 s and shipping at 0.52 s — five times too long, which is
exactly what "the back notice is long" describes.

Trims to the target and applies a short fade at the tail so cutting mid-decay
cannot click. Idempotent: a file already at or under its target is left alone,
so this can be run after every generation without degrading anything.
"""
import io, os, re, subprocess, sys

SHEET = 'docs/SOUND_ELEVENLABS.md'
FADE  = 0.012          # 12 ms — long enough to kill a click, short enough not to soften the hit

def rows():
    for line in io.open(SHEET, encoding='utf-8'):
        if not line.startswith('| '):
            continue
        c = [x.strip() for x in line.strip().strip('|').split('|')]
        if len(c) != 7 or c[0] == 'id' or set(c[0]) <= set('-: '):
            continue
        if c[5] in ('-', ''):
            continue
        try:
            yield c[0], c[1], float(c[5])
        except ValueError:
            continue

def dur(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                          '-of', 'csv=p=0', path], capture_output=True, text=True).stdout
    try:    return float(out.strip())
    except  ValueError: return 0.0

def main():
    dry = '--dry-run' in sys.argv
    done = skipped = 0
    for sid, fname, target in rows():
        path = os.path.join('audio', fname)
        if not os.path.exists(path):
            continue
        have = dur(path)
        if have <= target + 0.02:
            skipped += 1
            continue
        fade = min(FADE, target * 0.25)
        print('  %-16s %.2f -> %.2f s' % (sid, have, target))
        if dry:
            continue
        tmp = path + '.trim.mp3'
        cmd = ['ffmpeg', '-v', 'error', '-y', '-i', path,
               '-af', 'atrim=0:%.3f,afade=t=out:st=%.3f:d=%.3f' % (target, target - fade, fade),
               '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', tmp]
        subprocess.run(cmd, check=True)
        os.replace(tmp, path)
        done += 1
    print('\ntrimmed %d, already short enough %d' % (done, skipped))

if __name__ == '__main__':
    main()
