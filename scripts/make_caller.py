#!/usr/bin/env python3
"""
make_caller.py — generate the TOMBLA anunzjatur from docs/TOMBLA_CALLER.md.

The markdown sheet is the single source of truth. This script parses its call
tables, calls the ElevenLabs TEXT-TO-SPEECH endpoint once per row, and writes
the result into ./audio/call/ where the tombla caller module expects it.

This is a DIFFERENT endpoint from scripts/make_sfx.py. Sound effects are billed
by the second; speech is billed by the CHARACTER. The two share one credit pool,
so the estimate below is printed against whatever the account has left.

Design notes, each one paid for by a documented failure mode:

  * RESUMABLE, TWICE OVER. A row whose output file exists is skipped, and the
    raw API response is kept in audio/call/_raw/ forever. Re-encoding, re-
    trimming and re-levelling all run off the raw master and cost NOTHING.
    --postprocess-only never opens a socket.
  * TRIMMING IS PART OF THE PIPELINE, NOT AN AFTERTHOUGHT. docs/SOUND_ELEVENLABS.md
    carried a trim_to column that nothing applied, and 35 sounds shipped up to
    5x too long. Here every file is silence-stripped, levelled, encoded and
    length-checked in the same pass that writes it. A file cannot reach audio/
    without having been through it.
  * A HARD CUT IS A BUG REPORT, NOT A FIX. trim_to is a ceiling. Silence
    stripping normally gets under it. If a row is STILL over afterwards the
    text is too long — the file is cut with a fade so nothing clicks, and the
    row is listed loudly at the end so the sheet can be shortened.
  * COST FIRST. Nothing is spent until the estimate has been printed and
    confirmed. --yes skips the prompt for unattended runs.
  * THE KEY IS NEVER PRINTED, never logged, never written into the repo.
  * audio/call/ IS NOT CREATED BY THIS SCRIPT. An agent once deleted every
    generated file under audio/. This script refuses to run until a human has
    made the output directory, and it only ever writes files named in the sheet.

Usage:
    python3 scripts/make_caller.py --dry-run            # parse + cost, spend nothing
    python3 scripts/make_caller.py --batch calls        # the 90 number calls
    python3 scripts/make_caller.py --batch laqam,shouts # the optional extras
    python3 scripts/make_caller.py --only call.61 --force
    python3 scripts/make_caller.py --postprocess-only   # re-encode from masters, free
    python3 scripts/make_caller.py --verify             # size + duration audit
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
import zlib

ROOT    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET   = os.path.join(ROOT, 'docs', 'TOMBLA_CALLER.md')
OUTDIR  = os.path.join(ROOT, 'audio', 'call')
RAWDIR  = os.path.join(OUTDIR, '_raw')
KEYFILE = os.path.expanduser('~/.elevenlabs_key')
API     = 'https://api.elevenlabs.io/v1'

# ── The voice. Argued for in §2 of the sheet. ───────────────────────────────
# George — warm British baritone, and the only voice id ElevenLabs still
# publishes in its own quickstart.
#
# VERIFY IT ON YOUR OWN KEY: default voices "expire on December 31, 2026" and
# are "only accessible to accounts established before March 2026". A newer key
# resolves to the replacement set instead (George -> Eldrin, Brian -> Sawyer).
#     python3 scripts/make_caller.py --list-voices
# then --voice <id>, or $ELEVENLABS_VOICE_ID, or edit this line.
VOICE_ID = os.environ.get('ELEVENLABS_VOICE_ID', 'JBFqnCBsd6RMkjVDRZzb')

# The sheet's `model` column carries an alias, so a model swap is one edit here
# and not ninety edits there.
MODELS = {
    'std':  'eleven_multilingual_v2',   # the 90 calls: best English, most predictable
    'fast': 'eleven_flash_v2_5',        # half price, no phoneme tags, no audio tags
    'v3':   'eleven_v3',                # the only model with audio tags AND inline IPA
}
CREDITS_PER_CHAR = {
    'eleven_flash_v2_5':      0.5,
    'eleven_turbo_v2_5':      0.5,      # deprecated by ElevenLabs; do not use
    'eleven_multilingual_v2': 1.0,
    'eleven_v3':              1.0,
}
# eleven_v3 accepts ONLY these three stability values (Creative/Natural/Robust).
V3_STABILITY = (0.0, 0.5, 1.0)
# Take the master at the best format the free tier allows, then encode down
# locally. Transcoding from a 128 kbps master is far better than asking the API
# for 32 kbps and re-encoding that. The master is kept, so this is a one-off.
MASTER_FORMAT = 'mp3_44100_128'

# The free allowance, for context in the estimate. --allowance overrides.
# NOTE the free tier has no commercial licence and requires "elevenlabs.io"
# attribution on anything published. See §4.3 of the sheet: one month of
# Starter is $6 and removes both problems.
ASSUMED_ALLOWANCE = 9400

# ── The size budget (§3 of the sheet). Enforced, not aspirational. ──────────
# Drop OUT_KBPS to 24 and re-run --postprocess-only to take the shipped set
# from ~556 KB to ~422 KB. It costs nothing: the masters are kept.
OUT_KBPS       = 32        # mono MP3, 22.05 kHz — the spoken-word bitrate
OUT_RATE       = 22050
PER_FILE_KB    = 10.0      # any single call over this is a defect
TOTAL_KB       = 600.0     # batch A + batch C, the shipped set
LOUDNORM       = 'I=-19:TP=-3.0:LRA=7'   # a touch louder than the SFX set: it
                                         # is speech, and it must cut through
FADE           = 0.015

HEADER = ['id', 'file', 'model', 'speed', 'stability', 'trim_to', 'text']
ID_RE  = re.compile(r'^(call|laqam|shout)\.[a-z0-9]+$')
BATCHES = ('calls', 'laqam', 'shouts')

# The SFX model takes these literally and returns near-silence (four takes were
# lost to it). TTS does something worse.
# There is NO voice-direction field on std/fast: stability, style and speed are
# numbers. Any adjective in `text` is simply READ OUT LOUD — ElevenLabs' own
# docs say "the model will still speak out the emotional delivery guides".
# On v3 rows, [bracket] audio tags ARE interpreted, so bracketed spans are
# stripped before this check runs.
# Matched as STEMS, so "softly" and "whispered" are caught too — the failure
# mode is an adverb, and an adverb is what a person naturally writes.
NEVER_IN_TEXT = ('soft', 'quiet', 'subtl', 'whisper', 'gentl', 'calm', 'slow')
TAG_RE = re.compile(r'\[[^\]]*\]')


def die(msg):
    print('error: %s' % msg, file=sys.stderr)
    sys.exit(1)


def batch_of(row_id):
    head = row_id.split('.', 1)[0]
    return 'calls' if head == 'call' else ('laqam' if head == 'laqam' else 'shouts')


# ═══════════════════════════ the sheet ═════════════════════════════════════

def parse_sheet(path):
    """Pull every call row out of the markdown tables.

    A row is only accepted when the table above it carries the exact expected
    header, so prose tables elsewhere in the document cannot be mistaken for
    call rows. Ids are additionally shape-checked, so a stray table with six
    columns still cannot smuggle a row in.
    """
    if not os.path.exists(path):
        die('sheet not found: %s' % path)

    rows, in_table, seen, warned = [], False, {}, []
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
            if all(set(c) <= set('-: ') for c in cells):        # separator row
                continue
            if len(cells) != len(HEADER):
                die('line %d: expected %d columns, found %d'
                    % (lineno, len(HEADER), len(cells)))

            row = dict(zip(HEADER, cells))
            row['line'] = lineno

            if not ID_RE.match(row['id']):
                die('line %d: %r is not a call id (call.NN / laqam.NN / shout.x)'
                    % (lineno, row['id']))
            if row['id'] in seen:
                die('line %d: duplicate id %r (first seen line %d)'
                    % (lineno, row['id'], seen[row['id']]))
            seen[row['id']] = lineno

            if row['model'] not in MODELS:
                die('line %d: %s has model %r, expected one of %s'
                    % (lineno, row['id'], row['model'], '/'.join(sorted(MODELS))))
            row['model_id'] = MODELS[row['model']]

            try:
                row['stability'] = float(row['stability'])
            except ValueError:
                die('line %d: %s has a bad stability (%r)'
                    % (lineno, row['id'], row['stability']))
            if not 0.0 <= row['stability'] <= 1.0:
                die('line %d: %s stability %.2f outside 0.0-1.0'
                    % (lineno, row['id'], row['stability']))
            if row['model'] == 'v3' and row['stability'] not in V3_STABILITY:
                die('line %d: %s is a v3 row with stability %.2f. eleven_v3 '
                    'accepts only %s (Creative/Natural/Robust) and rejects '
                    'anything else.'
                    % (lineno, row['id'], row['stability'],
                       '/'.join('%.1f' % v for v in V3_STABILITY)))

            try:
                row['speed'] = float(row['speed'])
            except ValueError:
                die('line %d: %s has a bad speed (%r)' % (lineno, row['id'], row['speed']))
            if not 0.7 <= row['speed'] <= 1.2:
                die('line %d: %s speed %.2f outside the API range 0.7-1.2'
                    % (lineno, row['id'], row['speed']))

            try:
                row['trim_to'] = float(row['trim_to'])
            except ValueError:
                die('line %d: %s has no usable trim_to (%r). Every row needs a '
                    'ceiling — the sound sheet shipped 35 files up to 5x too '
                    'long because nothing enforced one.'
                    % (lineno, row['id'], row['trim_to']))
            if not 0.3 <= row['trim_to'] <= 4.0:
                die('line %d: %s trim_to %.2f is not a plausible call length'
                    % (lineno, row['id'], row['trim_to']))

            if not row['text']:
                die('line %d: %s has empty text' % (lineno, row['id']))
            if not re.search(r'\d', row['file']) and row['id'].startswith('call'):
                die('line %d: %s filename %r looks wrong' % (lineno, row['id'], row['file']))
            if '/' in row['file'] or row['file'].startswith('.'):
                die('line %d: %s has an unsafe filename %r'
                    % (lineno, row['id'], row['file']))

            if re.search(r'\d', row['text']):
                die('line %d: %s text contains a digit (%r). Numerals go through '
                    'the API text normaliser and it is not worth trusting for '
                    'the one thing this whole set exists to say. Spell it out.'
                    % (lineno, row['id'], row['text']))

            # [excited] and friends are INTERPRETED on v3, so strip bracketed
            # spans before looking for words that would merely be spoken.
            low = TAG_RE.sub(' ', row['text']).lower()
            hits = [w for w in NEVER_IN_TEXT if re.search(r'\b%s' % w, low)]
            if hits:
                warned.append((row['id'], '/'.join(hits)))

            if row['model'] != 'v3' and TAG_RE.search(row['text']):
                die('line %d: %s is a %s row carrying a [bracket] tag. Audio '
                    'tags are only interpreted by eleven_v3; on every other '
                    'model the behaviour is undocumented and the likely '
                    'outcome is that it gets spelled out.'
                    % (lineno, row['id'], row['model']))

            row['batch'] = batch_of(row['id'])
            rows.append(row)

    if not rows:
        die('no call rows found in %s — has the table format changed?' % path)

    for rid, hits in warned:
        print('  WARNING  %-10s text contains %s — there is no voice-direction '
              'field on this model, so the word is simply READ OUT.' % (rid, hits))
    return rows


def credits_for(row):
    """Speech is billed per character of the request body's `text`."""
    return len(row['text']) * CREDITS_PER_CHAR.get(row['model_id'], 1.0)


# ═══════════════════════════ the account ═══════════════════════════════════

def read_key():
    key = os.environ.get('ELEVENLABS_API_KEY')
    if key:
        return key.strip()
    if os.path.exists(KEYFILE):
        with open(KEYFILE, encoding='utf-8') as fh:
            return fh.read().strip()
    die('no API key. Set ELEVENLABS_API_KEY or write it to %s' % KEYFILE)


def list_voices(key):
    """What the account ACTUALLY has. The published default-voice ids are
    stale: ElevenLabs says they expire 31 Dec 2026 and are only reachable from
    accounts created before March 2026. Generating 90 files against an id that
    silently resolves to a different person is a 2,177-credit mistake."""
    req = urllib.request.Request(API + '/voices?voice_type=default',
                                 headers={'xi-api-key': key})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            d = json.load(resp)
    except Exception as exc:                       # noqa: BLE001
        die('could not list voices: %s' % exc)
    voices = d.get('voices') or []
    if not voices:
        die('the account returned no default voices at all — see §2 of the sheet')
    print('\n%-28s %-24s %s' % ('name', 'voice_id', 'labels'))
    for v in voices:
        labels = v.get('labels') or {}
        print('%-28s %-24s %s'
              % (v.get('name', '?'), v.get('voice_id', '?'),
                 ', '.join('%s=%s' % kv for kv in sorted(labels.items()))))
    print('\n%d default voice(s). Current setting: %s' % (len(voices), VOICE_ID))
    if not any(v.get('voice_id') == VOICE_ID for v in voices):
        print('  !! %s is NOT in that list. Pick one above and pass --voice, '
              'or set $ELEVENLABS_VOICE_ID.' % VOICE_ID)


def check_subscription(key):
    """Report the remaining allowance. Never fatal — the run can proceed."""
    req = urllib.request.Request(API + '/user/subscription',
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


# ═══════════════════════════ generation ════════════════════════════════════

def tts(key, row, rawpath, voice, retries=3):
    """One API call. Writes the untouched master; post-processing is separate
    so it can be re-run for free."""
    body = {
        'text': row['text'],
        'model_id': row['model_id'],
        # Everything in the sheet is spelled out in words, so normalisation has
        # nothing to do. 'off' is the predictable choice and is also the only
        # value that works everywhere: 'on' is rejected outright on
        # flash_v2_5/turbo_v2_5 below Enterprise.
        'apply_text_normalization': 'off',
        'voice_settings': {
            'stability': row['stability'],   # a caller is the same man every time
            'similarity_boost': 0.80,
            'style': 0.0,             # style > 0 wanders and costs latency
            'use_speaker_boost': True,
            'speed': row['speed'],
        },
        # Deterministic across machines and across Python runs — str.__hash__ is
        # salted per process and would have quietly reseeded every re-run.
        'seed': zlib.crc32(row['id'].encode('utf-8')) & 0x7fffffff,
    }
    url = '%s/text-to-speech/%s?output_format=%s' % (API, voice, MASTER_FORMAT)
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode('utf-8'),
        headers={'xi-api-key': key,
                 'Content-Type': 'application/json',
                 'Accept': 'audio/mpeg'},
        method='POST')

    last = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
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
    tmp = rawpath + '.part'
    with open(tmp, 'wb') as fh:
        fh.write(audio)
    os.replace(tmp, rawpath)
    return True, len(audio)


# ═══════════════════════════ post-processing ═══════════════════════════════

def duration(path):
    try:
        out = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'csv=p=0', path], capture_output=True, text=True).stdout
        return float(out.strip())
    except (OSError, ValueError):
        return 0.0


def encode(rawpath, outpath, trim_to):
    """Silence-strip, level, encode, and only then cut if still too long.

    Returns (ok, hard_cut, seconds, bytes). `hard_cut` true means the text is
    too long for its ceiling and the sheet should be edited — a hard cut is a
    bug report, not a fix.
    """
    strip = ('silenceremove=start_periods=1:start_threshold=-45dB:'
             'start_silence=0:detection=peak,'
             'areverse,'
             'silenceremove=start_periods=1:start_threshold=-45dB:detection=peak,'
             'areverse')
    common = ['-ac', '1', '-ar', str(OUT_RATE),
              '-codec:a', 'libmp3lame', '-b:a', '%dk' % OUT_KBPS,
              '-write_xing', '0', '-id3v2_version', '0', '-map_metadata', '-1']

    tmp = outpath + '.part.mp3'
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', rawpath,
           '-af', strip + ',loudnorm=' + LOUDNORM] + common + [tmp]
    try:
        subprocess.run(cmd, check=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        if os.path.exists(tmp):
            os.unlink(tmp)
        return False, False, 0.0, 0

    have = duration(tmp)
    hard = False
    if have > trim_to + 0.03:
        # Still over after the silence came off: the words themselves are too
        # long. Cut, fade so it cannot click, and say so at the end of the run.
        hard = True
        fade = min(FADE, trim_to * 0.25)
        tmp2 = outpath + '.cut.mp3'
        cut = ['ffmpeg', '-v', 'error', '-y', '-i', tmp,
               '-af', 'atrim=0:%.3f,afade=t=out:st=%.3f:d=%.3f'
                      % (trim_to, trim_to - fade, fade)] + common + [tmp2]
        try:
            subprocess.run(cut, check=True)
            os.unlink(tmp)
            tmp = tmp2
            have = duration(tmp)
        except (OSError, subprocess.CalledProcessError):
            pass

    os.replace(tmp, outpath)
    return True, hard, have, os.path.getsize(outpath)


# ═══════════════════════════ reporting ═════════════════════════════════════

def verify(rows):
    print('\n%-10s %-16s %6s %6s %7s  %s'
          % ('id', 'file', 'have', 'ceil', 'KB', ''))
    total = fat = long_ = missing = 0
    for row in rows:
        path = os.path.join(OUTDIR, row['file'])
        if not os.path.exists(path):
            missing += 1
            continue
        d, sz = duration(path), os.path.getsize(path)
        total += sz
        flags = []
        if sz / 1024.0 > PER_FILE_KB:
            flags.append('OVER %0.1f KB' % PER_FILE_KB)
            fat += 1
        # 0.12 not 0.02: LAME pads to a whole MPEG frame (~26 ms at 22.05 kHz)
        # and a hard-cut file legitimately lands a frame or two over its ceiling.
        # A tighter tolerance here reports a defect that does not exist.
        if d > row['trim_to'] + 0.12:
            flags.append('OVER trim_to')
            long_ += 1
        print('%-10s %-16s %5.2fs %5.2fs %6.1f  %s'
              % (row['id'], row['file'], d, row['trim_to'], sz / 1024.0,
                 ' '.join(flags)))
    print('\n%d present, %d not generated yet' % (len(rows) - missing, missing))
    print('total     : %.1f KB of a %.0f KB budget (%.0f%%)'
          % (total / 1024.0, TOTAL_KB, 100.0 * total / 1024.0 / TOTAL_KB))
    if total / 1024.0 > TOTAL_KB:
        print('  OVER BUDGET. Cut in this order: the 7 shout files, then the '
              '28 laqam files, then drop OUT_KBPS to 20.')
    if fat:
        print('  %d file(s) over the %.1f KB per-file ceiling.' % (fat, PER_FILE_KB))
    if long_:
        print('  %d file(s) longer than their trim_to — re-run '
              '--postprocess-only, and if they stay long, shorten the text.'
              % long_)


# ═══════════════════════════ main ══════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dry-run', action='store_true',
                    help='parse the sheet and print the cost; spend nothing')
    ap.add_argument('--force', action='store_true',
                    help='regenerate rows whose master already exists (re-bills)')
    ap.add_argument('--only', default='', help='comma-separated ids')
    ap.add_argument('--batch', default='calls,shouts',
                    help='comma-separated: calls,laqam,shouts (or "all"). '
                         'Default is the shipped set; laqam is opt-in — see '
                         'the stop-rule in §7.3 of the sheet.')
    ap.add_argument('--postprocess-only', action='store_true',
                    help='re-encode every existing master. Costs nothing.')
    ap.add_argument('--verify', action='store_true',
                    help='audit what is on disk against the budget')
    ap.add_argument('--list-voices', action='store_true',
                    help='print the default voices on YOUR key, then exit. '
                         'Do this before generating ninety files.')
    ap.add_argument('--voice', default=VOICE_ID,
                    help='voice_id to use (default %s)' % VOICE_ID)
    ap.add_argument('--model', default='', choices=sorted(MODELS) + [''],
                    help='override every row\'s model column. "fast" halves '
                         'the bill and loses audio tags and phonemes.')
    ap.add_argument('--allowance', type=int, default=ASSUMED_ALLOWANCE,
                    help='credits assumed remaining, for the estimate')
    ap.add_argument('--yes', action='store_true',
                    help='do not ask before spending credits')
    args = ap.parse_args()

    if args.list_voices:
        list_voices(read_key())
        return

    print('sheet     : %s' % os.path.relpath(SHEET, ROOT))
    rows = parse_sheet(SHEET)
    print('parsed    : %d rows (%s)'
          % (len(rows), ', '.join('%s %d' % (b, sum(1 for r in rows if r['batch'] == b))
                                  for b in BATCHES)))

    if args.only:
        want = {s.strip() for s in args.only.split(',') if s.strip()}
        unknown = want - {r['id'] for r in rows}
        if unknown:
            die('unknown id(s): %s' % ', '.join(sorted(unknown)))
        rows = [r for r in rows if r['id'] in want]
    else:
        want_b = BATCHES if args.batch.strip() == 'all' else tuple(
            b.strip() for b in args.batch.split(',') if b.strip())
        bad = set(want_b) - set(BATCHES)
        if bad:
            die('unknown batch(es): %s (pick from %s, or all)'
                % (', '.join(sorted(bad)), ', '.join(BATCHES)))
        rows = [r for r in rows if r['batch'] in want_b]
        print('batch     : %s -> %d rows' % (', '.join(want_b), len(rows)))

    # Applied AFTER filtering: --model fast --batch calls must not trip over a
    # [tag] in the shout rows this run is not generating.
    if args.model:
        for r in rows:
            r['model'], r['model_id'] = args.model, MODELS[args.model]
            if args.model != 'v3' and TAG_RE.search(r['text']):
                die('--model %s cannot be forced onto %s: it carries a [tag] '
                    'that only eleven_v3 interprets.' % (args.model, r['id']))
            if args.model == 'v3' and r['stability'] not in V3_STABILITY:
                r['stability'] = min(V3_STABILITY,
                                     key=lambda v: abs(v - r['stability']))
        print('model     : every row forced to %s (%s)'
              % (args.model, MODELS[args.model]))

    if args.verify:
        verify(rows)
        return

    # --dry-run spends nothing and writes nothing, so it must work before the
    # output directory exists — that is the whole point of running it first.
    if not os.path.isdir(OUTDIR) and not args.dry_run:
        die('output directory %s does not exist.\n'
            '       Create it yourself — this script will not make a directory '
            'under audio/, and never deletes anything there:\n'
            '           mkdir -p audio/call/_raw\n'
            '           echo "audio/call/_raw/" >> .gitignore'
            % os.path.relpath(OUTDIR, ROOT))
    if os.path.isdir(OUTDIR):
        os.makedirs(RAWDIR, exist_ok=True)   # inside a directory a human made

    # ── re-encode from masters. Free, and the answer to almost every complaint
    if args.postprocess_only:
        done = cut = miss = 0
        for row in rows:
            raw = os.path.join(RAWDIR, row['file'])
            if not os.path.exists(raw):
                miss += 1
                continue
            ok, hard, secs, size = encode(raw, os.path.join(OUTDIR, row['file']),
                                          row['trim_to'])
            if ok:
                done += 1
                cut += 1 if hard else 0
                print('  %-10s %5.2fs  %5.1f KB%s'
                      % (row['id'], secs, size / 1024.0, '  HARD CUT' if hard else ''))
        print('\nre-encoded %d, hard-cut %d, no master for %d. Nothing spent.'
              % (done, cut, miss))
        return

    todo, have = [], []
    for row in rows:
        raw = os.path.join(RAWDIR, row['file'])
        (have if (os.path.exists(raw) and not args.force) else todo).append(row)
    if have:
        print('existing  : %d master(s) already fetched, skipping '
              '(--force to re-bill, --postprocess-only to re-encode free)' % len(have))
    if not todo:
        print('\nNothing to fetch. Run --postprocess-only to rebuild the mp3s, '
              'or --verify to audit them.')
        return

    chars = sum(len(r['text']) for r in todo)
    cost = sum(credits_for(r) for r in todo)
    print('\nto generate: %d files, %d characters' % (len(todo), chars))
    print('cost       : %.0f credits — about %.0f%% of a %d allowance'
          % (cost, 100.0 * cost / max(args.allowance, 1), args.allowance))
    for m in sorted({r['model_id'] for r in todo}):
        sub = [r for r in todo if r['model_id'] == m]
        print('             %-24s %3d rows  %5d chars  x%.1f = %5.0f credits'
              % (m, len(sub), sum(len(r['text']) for r in sub),
                 CREDITS_PER_CHAR.get(m, 1.0), sum(credits_for(r) for r in sub)))
    est_kb = sum(r['trim_to'] * OUT_KBPS * 1000 / 8.0 + 200 for r in todo) / 1024.0
    print('size       : <= %.0f KB at %d kbps mono (ceiling from trim_to; real '
          'files land ~12%% under)' % (est_kb, OUT_KBPS))

    if args.dry_run:
        print('\n--dry-run: nothing spent.')
        for r in todo:
            print('  %-10s %-16s %-4s %4.2fx st%.2f %4.2fs %3d ch  %s'
                  % (r['id'], r['file'], r['model'], r['speed'],
                     r['stability'], r['trim_to'], len(r['text']), r['text']))
        return

    key = read_key()
    remaining = check_subscription(key)
    if remaining is not None and cost > remaining:
        die('this run needs %.0f credits but only %d remain. Use --batch calls '
            'to do the 90 numbers only, or --only to do a slice.'
            % (cost, remaining))

    if not args.yes:
        try:
            if input('\nProceed and spend %.0f credits? [y/N] ' % cost).strip().lower() \
                    not in ('y', 'yes'):
                print('aborted, nothing spent.')
                return
        except EOFError:
            die('no tty to confirm on — re-run with --yes if you meant to spend')

    print('\nvoice     : %s' % args.voice)
    ok = fail = hardcuts = 0
    failures, cutlist, total = [], [], 0
    for i, row in enumerate(todo, 1):
        raw = os.path.join(RAWDIR, row['file'])
        dest = os.path.join(OUTDIR, row['file'])
        print('  [%3d/%3d] %-10s %-16s' % (i, len(todo), row['id'], row['file']),
              end=' ')
        sys.stdout.flush()
        good, info = tts(key, row, raw, args.voice)
        if not good:
            fail += 1
            failures.append((row['id'], info))
            print('-> FAILED: %s' % info)
            continue
        eok, hard, secs, size = encode(raw, dest, row['trim_to'])
        if not eok:
            fail += 1
            failures.append((row['id'], 'ffmpeg post-processing failed'))
            print('-> fetched but ENCODE FAILED (master kept)')
            continue
        ok += 1
        total += size
        if hard:
            hardcuts += 1
            cutlist.append(row['id'])
        print('-> %5.2fs %5.1f KB%s' % (secs, size / 1024.0, '  HARD CUT' if hard else ''))

    print('\ndone: %d generated, %d failed, %.1f KB written' % (ok, fail, total / 1024.0))
    if failures:
        print('\nfailed rows:')
        for rid, why in failures:
            print('  %-10s %s' % (rid, why))
        print('\n  python3 scripts/make_caller.py --only %s'
              % ','.join(r for r, _ in failures))
    if cutlist:
        print('\n%d row(s) had to be HARD CUT to fit trim_to. The words are too '
              'long, not the file — shorten the text in the sheet and re-run '
              '--postprocess-only (free), or raise the ceiling:' % hardcuts)
        print('  ' + ', '.join(cutlist))

    print("""
NEXT:
  * python3 scripts/make_caller.py --verify
    Audits every file against the per-file and total budget. Do this before
    you commit anything into audio/call/.
  * Listen on the PHONE SPEAKER with the game running, not on headphones.
    Draw twenty numbers in a row. If the caller starts to grate at twenty it
    will be unbearable at ninety — that is the whole test.
  * Anything too loud is fixed in the caller module's gain, NOT by regenerating.
  * audio/call/_raw/ must be gitignored. It is the reason a re-encode is free.
  * The game is correct with every one of these files missing. Ship the ones
    that are good, delete the ones that are not, and the caller simply goes
    quiet for those numbers.""")


if __name__ == '__main__':
    main()
