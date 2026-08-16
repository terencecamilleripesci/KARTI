#!/usr/bin/env python3
"""
import_calls.py — put real recorded calls in place of the generated English ones.

The generated caller is English because ElevenLabs cannot speak Maltese (see
docs/TOMBLA_CALLER.md for the evidence). The plan is to replace it with a real
voice — an actor, in Maltese. This script is the door for those files.

Give it a folder of recordings and it works out which number each one is,
converts whatever format it arrives in, strips the silence at both ends, evens
the loudness so no single number is louder than the rest, encodes it to the
same budget as everything else, and drops it into audio/call/.

Design notes:

  * PARTIAL IS FINE. Record five numbers or ninety. Anything not recorded keeps
    its English file and the game does not care. There is no half-finished
    state to avoid, which matters when the recording is somebody else's time.
  * THE ORIGINAL IS NEVER DESTROYED. Recordings are copied into
    audio/call/_raw/ (gitignored) before anything touches them, so a re-encode
    at a different setting is always free and the actor never has to come back.
  * LOUDNESS IS MATCHED, NOT MAXIMISED. Every call lands at the same measured
    loudness. One number louder than the others is exactly what makes a caller
    feel amateur, and it is the fault a human recording is most likely to have.
  * IT TELLS YOU WHAT IT COULD NOT READ rather than skipping quietly.

Usage:
    python3 scripts/import_calls.py ~/recordings --dry-run
    python3 scripts/import_calls.py ~/recordings
    python3 scripts/import_calls.py ~/recordings --only 61,62,90
"""

import argparse
import os
import re
import shutil
import subprocess
import sys

ROOT    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR  = os.path.join(ROOT, 'audio', 'call')
RAWDIR  = os.path.join(OUTDIR, '_raw')

# Matched to the generated set so a recorded call and a generated one sound
# like the same product rather than two products.
BITRATE   = '32k'
RATE      = '22050'
LUFS      = -18.0        # integrated target; the generated calls sit here
PEAK      = -1.5         # true-peak ceiling, so nothing clips on a phone
SIL_DB    = '-40dB'      # anything below this at the ends is silence
MAX_BYTES = 12 * 1024    # per file; the whole set has a 600 KB budget

SHOUTS = ('ambo', 'terna', 'kwaterna', 'cinkwina', 'tombla', 'vers', 'fatta')
AUDIO_EXT = ('.wav', '.m4a', '.mp3', '.aac', '.flac', '.ogg', '.opus',
             '.aiff', '.aif', '.caf', '.mp4', '.3gp', '.amr', '.wma')


def die(msg):
    print('error: %s' % msg, file=sys.stderr)
    sys.exit(1)


def which(name):
    return shutil.which(name) is not None


def target_for(filename):
    """Work out which call a recording is, from a human-named file.

    People name files the way people do: 61.m4a, call-61.wav, 61 sittin u
    wiehed.mp3, tombla.m4a. Read all of those rather than making the actor
    rename ninety files.
    """
    stem = os.path.splitext(os.path.basename(filename))[0].lower()

    # A recorder's own default naming counts its files, not the game's numbers.
    # "New Recording 12" is the twelfth take, not twelve. Refuse to guess.
    if re.search(r'\b(voice ?memo|new recording|recording|audio|track|take|'
                 r'sound ?recording|rec)\b', stem) and not re.search(r'call[-_ ]?\d', stem):
        return None

    for s in SHOUTS:
        if s in stem:
            return 'shout-%s.mp3' % s
    # ċinkwina may arrive with the accent, or spelled with a c or a ch
    if 'inkwina' in stem or 'chinkw' in stem:
        return 'shout-cinkwina.mp3'

    nums = re.findall(r'\d+', stem)
    for raw in nums:
        n = int(raw)
        if 1 <= n <= 90:
            return 'call-%02d.mp3' % n
    return None


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                          'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True).stdout
    try:    return float(out.strip())
    except  ValueError: return 0.0


def convert(src, dst):
    """Silence-strip, loudness-match, encode. Returns (ok, note)."""
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', src,
           '-af', ('silenceremove=start_periods=1:start_threshold=%s:start_silence=0.02,'
                   'areverse,'
                   'silenceremove=start_periods=1:start_threshold=%s:start_silence=0.02,'
                   'areverse,'
                   'loudnorm=I=%.1f:TP=%.1f:LRA=7'
                   % (SIL_DB, SIL_DB, LUFS, PEAK)),
           '-ac', '1', '-ar', RATE,
           '-codec:a', 'libmp3lame', '-b:a', BITRATE, dst]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except subprocess.CalledProcessError as exc:
        return False, (exc.stderr or b'').decode('utf-8', 'replace')[:160]
    return True, ''


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('folder', help='folder of recordings (searched recursively)')
    ap.add_argument('--dry-run', action='store_true',
                    help='say what would happen, change nothing')
    ap.add_argument('--only', default='',
                    help='comma-separated numbers or shout names to import')
    args = ap.parse_args()

    if not which('ffmpeg') or not which('ffprobe'):
        die('ffmpeg and ffprobe are needed. sudo apt install ffmpeg')
    if not os.path.isdir(args.folder):
        die('not a folder: %s' % args.folder)

    only = {s.strip().lower() for s in args.only.split(',') if s.strip()}

    found, unknown = [], []
    for base, _dirs, files in os.walk(args.folder):
        if os.path.abspath(base).startswith(os.path.abspath(RAWDIR)):
            continue
        for f in sorted(files):
            if not f.lower().endswith(AUDIO_EXT):
                continue
            t = target_for(f)
            src = os.path.join(base, f)
            if t is None:
                unknown.append(src)
            else:
                found.append((src, t))

    if unknown:
        print('Could not tell which call these are — rename them with the '
              'number in the filename and run again:')
        for u in unknown:
            print('  %s' % u)
        print()

    if only:
        def keep(t):
            n = re.findall(r'\d+', t)
            return (n and n[0] in only) or any(s in t for s in only)
        found = [(s, t) for s, t in found if keep(t)]

    if not found:
        print('Nothing to import.')
        return

    # last one wins if the same number was recorded twice
    byt = {}
    for s, t in found:
        byt[t] = s

    print('%d recording%s to import into audio/call/\n'
          % (len(byt), '' if len(byt) == 1 else 's'))

    os.makedirs(RAWDIR, exist_ok=True)
    ok = fail = 0
    big = []
    for t in sorted(byt, key=lambda x: (len(x), x)):
        src = byt[t]
        dst = os.path.join(OUTDIR, t)
        had = os.path.exists(dst)
        print('  %-20s <- %-40s %s'
              % (t, os.path.basename(src)[:40], '(replaces English)' if had else ''))
        if args.dry_run:
            continue

        # keep the original before touching anything
        raw = os.path.join(RAWDIR, os.path.splitext(t)[0] + os.path.splitext(src)[1].lower())
        try:
            shutil.copy2(src, raw)
        except OSError as exc:
            print('      could not keep the original: %s' % exc)

        tmp = dst + '.new.mp3'
        good, note = convert(src, tmp)
        if not good:
            fail += 1
            print('      FAILED: %s' % note)
            if os.path.exists(tmp):
                os.unlink(tmp)
            continue
        size = os.path.getsize(tmp)
        if size > MAX_BYTES:
            big.append((t, size))
        os.replace(tmp, dst)
        ok += 1
        print('      %.2f s, %.1f KB' % (duration(dst), size / 1024.0))

    if args.dry_run:
        print('\n--dry-run: nothing changed.')
        return

    print('\nimported %d, failed %d' % (ok, fail))
    if big:
        print('\nOver the %d KB per-file budget — long, but kept:' % (MAX_BYTES // 1024))
        for t, s in big:
            print('  %-20s %.1f KB' % (t, s / 1024.0))
        print('  A call that runs long is usually a pause before speaking that '
              'the silence strip could not see because it was not quite silent.')

    total = sum(os.path.getsize(os.path.join(OUTDIR, f))
                for f in os.listdir(OUTDIR) if f.endswith('.mp3'))
    print('\naudio/call is now %.0f KB across %d files'
          % (total / 1024.0,
             len([f for f in os.listdir(OUTDIR) if f.endswith('.mp3')])))
    print("""
NEXT:
  * Listen to twenty in a row on the phone speaker with the game running.
    A caller that grates at twenty is unbearable at ninety.
  * Numbers you have not recorded are still in English and the game does not
    mind. Record more whenever, and run this again.
  * The originals are kept in audio/call/_raw/ (gitignored), so re-encoding at
    a different setting is free and nobody has to record anything twice.""")


if __name__ == '__main__':
    main()
