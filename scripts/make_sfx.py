#!/usr/bin/env python3
"""
make_sfx.py — generate KARTI's sound set from docs/SOUND_ELEVENLABS.md.

The markdown sheet is the single source of truth. This script parses its prompt
tables, calls the ElevenLabs sound-generation endpoint once per row, and writes
the result into ./audio/ where js/sfx.js expects it.

Design notes, each one paid for by a documented failure mode:

  * RESUMABLE. A row whose output file already exists is skipped. Credits are
    spent once. Use --force to deliberately regenerate.
  * COST FIRST. Nothing is spent until the estimate has been printed and
    confirmed. --yes skips the prompt for unattended runs.
  * DURATION IS ALWAYS EXPLICIT. 40 credits/second when set, a flat 200 when
    omitted — and the auto-duration predictor is unreliable. The sheet carries
    a duration for every row and this script refuses a row without one.
  * LOOPS COME BACK AS PCM. MP3 is not a gapless format; the encoder pads the
    file with silence, which is what makes generated loops audibly seam. Rows
    with loop=true are requested as pcm_44100 and converted locally.
  * THE KEY IS NEVER PRINTED, never logged, never written into the repo.

Usage:
    python3 scripts/make_sfx.py --dry-run          # parse + cost, spend nothing
    python3 scripts/make_sfx.py                    # generate what is missing
    python3 scripts/make_sfx.py --only card.throw,dice.roll --force
    python3 scripts/make_sfx.py --skip-ambience    # drop the two 12s loops
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET    = os.path.join(ROOT, 'docs', 'SOUND_ELEVENLABS.md')
OUTDIR   = os.path.join(ROOT, 'audio')
KEYFILE  = os.path.expanduser('~/.elevenlabs_key')
ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation'

# 40 credits per second when duration_seconds is set explicitly.
CREDITS_PER_SECOND = 40
# The free tier allowance, for context in the estimate.
ASSUMED_ALLOWANCE = 10000

HEADER = ['id', 'file', 'duration_seconds', 'prompt_influence', 'loop',
          'trim_to', 'prompt']

# Words ElevenLabs takes literally, returning a near-silent file. The sheet
# bans them; this is the backstop in case a row is hand-edited later.
LITERAL_SILENCE_WORDS = ('soft', 'quiet', 'subtle', 'unobtrusive')


def die(msg):
    print('error: %s' % msg, file=sys.stderr)
    sys.exit(1)


def parse_sheet(path):
    """Pull every prompt row out of the markdown tables.

    A row is only accepted when the table above it carries the exact expected
    header, so prose tables elsewhere in the document cannot be mistaken for
    prompt rows.
    """
    if not os.path.exists(path):
        die('sheet not found: %s' % path)

    rows, in_table, seen = [], False, {}
    with open(path, encoding='utf-8') as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.rstrip('\n')
            if not line.lstrip().startswith('|'):
                in_table = False
                continue

            cells = [c.strip() for c in line.strip().strip('|').split('|')]

            if [c.lower() for c in cells] == HEADER:
                in_table = True
                continue
            if not in_table:
                continue
            if all(set(c) <= set('-: ') for c in cells):   # separator row
                continue
            if len(cells) != len(HEADER):
                die('line %d: expected %d columns, found %d'
                    % (lineno, len(HEADER), len(cells)))

            row = dict(zip(HEADER, cells))
            row['line'] = lineno

            if row['id'] in seen:
                die('line %d: duplicate id %r (first seen line %d)'
                    % (lineno, row['id'], seen[row['id']]))
            seen[row['id']] = lineno

            try:
                row['duration_seconds'] = float(row['duration_seconds'])
            except ValueError:
                die('line %d: %s has no usable duration_seconds (%r). '
                    'Auto-duration is unreliable and costs 200 flat — set it.'
                    % (lineno, row['id'], row['duration_seconds']))
            if not 0.5 <= row['duration_seconds'] <= 30:
                die('line %d: %s duration %.2f outside the API range 0.5-30'
                    % (lineno, row['id'], row['duration_seconds']))

            try:
                row['prompt_influence'] = float(row['prompt_influence'])
            except ValueError:
                die('line %d: %s has a bad prompt_influence (%r)'
                    % (lineno, row['id'], row['prompt_influence']))

            row['loop'] = row['loop'].lower() == 'true'

            if not row['prompt']:
                die('line %d: %s has an empty prompt' % (lineno, row['id']))

            lowered = row['prompt'].lower()
            hits = [w for w in LITERAL_SILENCE_WORDS
                    if re.search(r'\b%s\b' % w, lowered)]
            if hits:
                print('  WARNING  %-14s prompt contains %s — ElevenLabs reads '
                      'these literally and returns a near-silent file. '
                      'Softness belongs in the gain column, not the prompt.'
                      % (row['id'], '/'.join(hits)))

            rows.append(row)

    if not rows:
        die('no prompt rows found in %s — has the table format changed?' % path)
    return rows


def credits_for(row):
    return int(round(row['duration_seconds'] * CREDITS_PER_SECOND))


def read_key():
    key = os.environ.get('ELEVENLABS_API_KEY')
    if key:
        return key.strip()
    if os.path.exists(KEYFILE):
        with open(KEYFILE, encoding='utf-8') as fh:
            return fh.read().strip()
    die('no API key. Set ELEVENLABS_API_KEY or write it to %s' % KEYFILE)


def check_subscription(key):
    """Report the remaining allowance. Never fatal — the run can proceed."""
    req = urllib.request.Request(
        'https://api.elevenlabs.io/v1/user/subscription',
        headers={'xi-api-key': key})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            d = json.load(resp)
    except Exception as exc:                       # noqa: BLE001 - advisory only
        print('  (could not read the account allowance: %s)' % exc)
        return None
    used, limit = d.get('character_count'), d.get('character_limit')
    if isinstance(used, int) and isinstance(limit, int):
        print('  account   : %s tier, %d of %d credits remaining'
              % (d.get('tier', '?'), limit - used, limit))
        return limit - used
    return None


def generate(key, row, outpath, retries=3):
    """One API call. Loop rows come back as PCM and are converted locally."""
    want_pcm = row['loop']
    body = {
        'text': row['prompt'],
        'duration_seconds': row['duration_seconds'],
        'prompt_influence': row['prompt_influence'],
        'output_format': 'pcm_44100' if want_pcm else 'mp3_44100_64',
    }
    if row['loop']:
        body['loop'] = True
        body['model_id'] = 'eleven_text_to_sound_v2'   # loop is v2-only

    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body).encode('utf-8'),
        headers={'xi-api-key': key,
                 'Content-Type': 'application/json',
                 'Accept': 'audio/mpeg'},
        method='POST')

    last = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                audio = resp.read()
            break
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', 'replace')[:300]
            # 4xx other than rate-limit will not fix itself; stop burning calls.
            if exc.code != 429 and 400 <= exc.code < 500:
                return False, 'HTTP %d %s' % (exc.code, detail)
            last = 'HTTP %d %s' % (exc.code, detail)
        except Exception as exc:                   # noqa: BLE001
            last = str(exc)
        if attempt < retries:
            wait = 2 ** attempt
            print('      retry %d/%d in %ds (%s)' % (attempt, retries, wait, last))
            time.sleep(wait)
    else:
        return False, last or 'unknown error'

    if not audio:
        return False, 'empty response body'

    tmp = outpath + ('.pcm' if want_pcm else '.part')
    with open(tmp, 'wb') as fh:
        fh.write(audio)

    if want_pcm:
        # Raw 16-bit mono PCM at 44.1k -> mp3, no encoder padding at the seam.
        cmd = ['ffmpeg', '-loglevel', 'error', '-y',
               '-f', 's16le', '-ar', '44100', '-ac', '1', '-i', tmp,
               '-codec:a', 'libmp3lame', '-b:a', '64k', outpath]
        try:
            subprocess.run(cmd, check=True)
        except (OSError, subprocess.CalledProcessError) as exc:
            return False, 'ffmpeg conversion failed: %s' % exc
        finally:
            os.unlink(tmp)
    else:
        os.replace(tmp, outpath)

    return True, os.path.getsize(outpath)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dry-run', action='store_true',
                    help='parse the sheet and print the cost; spend nothing')
    ap.add_argument('--force', action='store_true',
                    help='regenerate rows whose file already exists')
    ap.add_argument('--only', default='',
                    help='comma-separated ids to generate')
    ap.add_argument('--skip-ambience', action='store_true',
                    help='drop loop rows — they are the most expensive by far')
    ap.add_argument('--yes', action='store_true',
                    help='do not ask before spending credits')
    args = ap.parse_args()

    print('sheet     : %s' % os.path.relpath(SHEET, ROOT))
    rows = parse_sheet(SHEET)
    print('parsed    : %d rows' % len(rows))

    if args.only:
        want = {s.strip() for s in args.only.split(',') if s.strip()}
        unknown = want - {r['id'] for r in rows}
        if unknown:
            die('unknown id(s): %s' % ', '.join(sorted(unknown)))
        rows = [r for r in rows if r['id'] in want]
    if args.skip_ambience:
        dropped = [r['id'] for r in rows if r['loop']]
        rows = [r for r in rows if not r['loop']]
        if dropped:
            print('skipping  : %s (--skip-ambience)' % ', '.join(dropped))

    os.makedirs(OUTDIR, exist_ok=True)

    todo, have = [], []
    for row in rows:
        dest = os.path.join(OUTDIR, row['file'])
        (have if (os.path.exists(dest) and not args.force) else todo).append(row)

    if have:
        print('existing  : %d already generated, skipping (use --force to redo)'
              % len(have))
    if not todo:
        print('\nNothing to do — every requested sound already exists.')
        return

    cost = sum(credits_for(r) for r in todo)
    secs = sum(r['duration_seconds'] for r in todo)
    print('\nto generate: %d files, %.1f s of audio' % (len(todo), secs))
    print('cost       : %d credits (%d/s x %.1fs) — about %.0f%% of a %d allowance'
          % (cost, CREDITS_PER_SECOND, secs,
             100.0 * cost / ASSUMED_ALLOWANCE, ASSUMED_ALLOWANCE))
    loops = [r for r in todo if r['loop']]
    if loops:
        lc = sum(credits_for(r) for r in loops)
        print('             of which %d credits (%.0f%%) is just %d ambience '
              'loop(s) — --skip-ambience drops them'
              % (lc, 100.0 * lc / cost, len(loops)))

    if args.dry_run:
        print('\n--dry-run: nothing spent.')
        for r in todo:
            print('  %-14s %-22s %4.1fs  infl %.2f  %s'
                  % (r['id'], r['file'], r['duration_seconds'],
                     r['prompt_influence'], 'LOOP' if r['loop'] else ''))
        return

    key = read_key()
    remaining = check_subscription(key)
    if remaining is not None and cost > remaining:
        die('this run needs %d credits but only %d remain. Use --only or '
            '--skip-ambience to trim it.' % (cost, remaining))

    if not args.yes:
        try:
            if input('\nProceed and spend %d credits? [y/N] ' % cost).strip().lower() \
                    not in ('y', 'yes'):
                print('aborted, nothing spent.')
                return
        except EOFError:
            die('no tty to confirm on — re-run with --yes if you meant to spend')

    print()
    ok = fail = 0
    failures = []
    for i, row in enumerate(todo, 1):
        dest = os.path.join(OUTDIR, row['file'])
        print('  [%2d/%2d] %-14s %-22s %4.1fs %s'
              % (i, len(todo), row['id'], row['file'],
                 row['duration_seconds'], 'LOOP' if row['loop'] else ''), end=' ')
        sys.stdout.flush()
        good, info = generate(key, row, dest)
        if good:
            ok += 1
            print('-> %.1f KB' % (info / 1024.0))
        else:
            fail += 1
            failures.append((row['id'], info))
            print('-> FAILED: %s' % info)

    print('\ndone: %d generated, %d failed' % (ok, fail))
    if failures:
        print('\nfailed rows (re-run with --only to retry just these):')
        for rid, why in failures:
            print('  %-14s %s' % (rid, why))
        print('\n  python3 scripts/make_sfx.py --only %s'
              % ','.join(r for r, _ in failures))

    print("""
NEXT — run the trimmer, then listen:
  * python3 scripts/trim_sfx.py
    The sheet's trim_to column is NOT applied at generation time. Until it is
    run, every one-shot plays its full generated length: ui.back is specified
    at 0.10 s and arrives at 0.52 s, which is audibly a fifth of a second of
    dead tail on every back tap. The trimmer is idempotent.

Then, listen before you trust any of it:
  * The API returns SEVERAL takes separated by silence, filling the duration.
    Keep take one, delete the rest. Leading silence must be trimmed, it cannot
    be prompted away.
  * Audition each ambience loop for a full minute. Any identifiable event in it
    (one shout, one bang) becomes a haunting on repeat — throw it away.
  * Anything too loud is fixed in the gain column of js/sfx.js, NOT by adding
    "soft" to the prompt. That word returns a near-silent file.
  * The game runs fine with any of these missing, so ship what is good and
    regenerate the rest.""")


if __name__ == '__main__':
    main()
