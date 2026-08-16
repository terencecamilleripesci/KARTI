# KARTI — THE TOMBLA CALLER

The *anunzjatur*. Ninety spoken number calls and seven prize shouts: what the
voice says, which model and voice say it, the exact filename each one is saved
as, and the pipeline that gets it under the size budget without anyone having
to remember to run a second script.

**97 files. Under 600 KB for the lot. None of them precached, and the game is
already perfect without every single one of them.**

> This is a **different endpoint** from `docs/SOUND_ELEVENLABS.md`. That sheet
> drives `POST /v1/sound-generation`, billed at 40 credits per second. This one
> drives `POST /v1/text-to-speech/{voice_id}`, billed **per character**. They
> share one credit pool. Read §4 before you spend anything.

> **⚠️ Read §0 before you read anything else.** The headline research finding is
> that ElevenLabs **cannot speak Maltese**, and the ninety calls are therefore
> **in English**. §0 is the evidence and the reasoning, and it is the part of
> this document most likely to need arguing about.

---

## 0. THE VERDICT ON MALTESE

**Decision: the ninety number calls are in ENGLISH. Digits, then the number.
No Maltese numerals are spoken by the machine — not `sittin u wieħed`, not
`għoxrin`, not `tmienja`. The Maltese stays where it already is: on the screen,
and in the mouth of the human being holding the phone in manual mode.**

This was not the intended answer. It is the answer the research produced, and
here is the whole chain, because it is the kind of decision that should be
possible to overturn if any link in it turns out to be wrong.

### 0.1 ElevenLabs has no Maltese voice. Not on any model, at any price.

Three published language lists, checked directly:

| Model | Languages | Maltese? |
|---|---:|---|
| `eleven_multilingual_v2` | 29 | **No** |
| `eleven_flash_v2_5` / `eleven_turbo_v2_5` | 32 | **No** |
| `eleven_v3` | 70+ | **No** |

This is not "small languages are missing". The v3 list of 70+ includes **Welsh,
Irish, Icelandic, Luxembourgish, Galician, Chichewa, Lingala and Sindhi**.
Maltese specifically is not in it. ElevenLabs supports Maltese in **Scribe**,
their speech-to-**text** model — they know the language exists. There is simply
no Maltese voice to buy.

> Sources: <https://elevenlabs.io/docs/models> ·
> <https://elevenlabs.io/languages> ·
> <https://elevenlabs.io/speech-to-text/maltese>

### 0.2 Phonetic respelling is the standard workaround, and it is not available on the model we would use.

Current docs, verbatim: **"Pronunciation dictionary phoneme tags only work with
`eleven_flash_v2` and `eleven_v3` models"** and **"Other models skip dictionary
phoneme tags and use the default pronunciation."** Also: **"If you want to use
IPA and CMU pronunciations in languages other than English, you will have to
switch to the `eleven_v3` model."**

So the phonetic lever exists on exactly one model that can leave English —
`eleven_v3`, which accepts inline IPA between forward slashes. It is **not**
available on `eleven_multilingual_v2` (the quality benchmark) and **not** on
`eleven_flash_v2_5` (the cheap one). Note the trap: `eleven_flash_v2` supports
phoneme tags and `eleven_flash_v2_5` does not, and they are one character apart.

> Source: <https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/pronunciation-dictionaries>

### 0.3 Maltese numerals are the worst possible case for an English voice.

Even granting v3 and IPA, the *numerals* are the hardest words in the language
to fake, because of where the consonants sit:

**Nine of the twenty base forms open with a cluster that is illegal in English
phonotactics** — `tn-` (tnejn, tnax), `tm-` (tmienja, tmintax), `ħd-` (ħdax),
`ħm-` (ħmistax), `zb-` (sbatax), `ts-` (dsatax), `tl-` (tlieta, tlettax). An
English-trained voice given `tnejn` will either insert a schwa — *te-NAYN* — or
drop the first consonant. Neither is an accent; both are a mistake. And these
are not rare words: they recur in **every** compound from 11 to 19 and in
**every** ten from 30 to 90, so the error would fire in most of the ninety.

Then the `għ` trap, which is the one that would embarrass us:

| Maltese | Actual | Note |
|---|---|---|
| erbgħa (4) | **ERB-a** /ˈɛrba/ | `għ` silent |
| erbgħin (40) | **er-BAYN** /ɛrˈbɛjn/ | `għ` + `i` → diphthong /ɛj/ |
| sebgħa (7) | **SEH-ba** /ˈsɛba/ | |
| sebgħin (70) | **se-BAYN** /sɛˈbɛjn/ | |
| disgħa (9) | **DIH-sa** /ˈdɪsa/ | |
| disgħin (90) | **di-SAYN** /dɪˈsɛjn/ | |

Same digraph, opposite output, in the same number family. Meanwhile `ħamsin`,
`sittin`, `tletin` and `tmenin` — no `għ` — really do end *-EEN*. A respelling
table can encode all of that. What it cannot do is **tell us when it is wrong**,
because nobody here can hear the output before it ships, and a caller that says
*er-BEEN* for forty says it ninety times a game to a room of Maltese speakers.

> Sources: [Wiktionary: erbgħin](https://en.wiktionary.org/wiki/erbg%C4%A7in) ·
> [Help:IPA/Maltese](https://en.wikipedia.org/wiki/Help:IPA/Maltese) ·
> [Maltese phrasebook](https://en.wikivoyage.org/wiki/Maltese_phrasebook) ·
> Hume, Vella, Venditti & Gett (2009) on `għ` and vowel duration.

### 0.4 And the product has already solved it, better than we could.

TOMBLA now has a **manual mode**: one person taps to draw each ball and reads
it out to the table themselves, in Maltese, and the app is deliberately silent.
That is the *każin*, and the anunzjatur in it is a Maltese human being. **The
Maltese half of the call is already covered by the correct instrument.**

The automatic caller in this document is for the *other* case — people playing
from four different houses with nobody in the room to shout. There, a clear
English call is genuinely useful. In the room, it is not wanted at all.

### 0.5 Why English-only is not a compromise

The tradition is **bilingual**, and this is sourced, not assumed:

> *"F'Malta daħlet l-użanza li meta jittellgħu n-numri tat-tombla, dawn ikunu
> annunzjati kemm bil-Malti kif ukoll bl-Ingliż"* — in Malta the custom
> developed that tombla numbers are announced **both in Maltese and in
> English**, because much of the room is elderly and hard of hearing and the
> repeat gives them a second chance to find the square.
> — [kliemustorja.com](https://kliemustorja.com/2021/11/18/tombla-lottu-u-lotteriji/)

`js/tombla.js` already says this in its own comments. So the machine is not
doing a tourist impression of a Maltese caller. **It is doing the English half
of a real Maltese call — the half a machine can say correctly — and leaving the
Maltese half to the person who can.** That is a defensible thing to ship.

### 0.6 What we *do* keep in Maltese

Two things survive the test, for the same reason: no `ħ`, no `għ`, no `q`.

- **The seven prize shouts** — AMBO, TERNA, KWATERNA, ĊINKWINA, TOMBLA, VERS,
  FATTA (§7.2). All Italian-derived, all ordinary syllables, and they are the
  loudest moment in the game. **Ship these.** Only `ĊINKWINA` needs respelling
  (`Chinkweena`), and `ċ` = /tʃ/ is exactly the English *ch*.
- **Up to 23 of the 28 laqmijiet** (§7.3) — `il-pastizz`, `Santa Marija`,
  `tużżana`. **Opt-in, not shipped by default**, with a stop-rule, because a
  caller that says fourteen nicknames well and nine badly is worse than one
  that says none. Five are excluded outright, by name and by reason.

### 0.7 The honest alternatives, in order

1. **Ship §7.1 + §7.2** — 97 files, English calls, Maltese shouts. **This is the
   recommendation.**
2. **Ship §7.2 only** — 7 files, 31 KB, one afternoon. The shouts are the best
   value in this document by a distance: they are the emotional peak of the
   game and they are unambiguously correct Maltese. If you only do one thing,
   do this.
3. **Ship nothing.** Also completely legitimate. Manual mode already puts a
   Maltese voice in the room, and every mode plays perfectly with no caller
   audio at all. Nothing downstream of this document is a dependency.
4. **Record a human.** If the owner or a friend will read ninety lines into a
   phone, that beats every option above and costs nothing but an evening. The
   filenames, the trimming pipeline and the wiring in §9 are all identical —
   only the source of the audio changes. **If this is on the table, do it
   instead.** Nothing in §7 competes with a real Maltese voice.

---

## 1. HOW TO ACTUALLY DO THIS

1. **Make the output directory yourself.** `scripts/make_caller.py` refuses to
   create anything under `audio/` — an agent once deleted every generated file
   in there. One command, once:
   ```bash
   mkdir -p audio/call/_raw
   echo "audio/call/_raw/" >> .gitignore
   ```
2. **Confirm the voice id actually exists on your key** (§2). This is not
   optional in 2026 and it is a thirty-second check.
3. **Dry run.** Prints the parsed table and the real cost, spends nothing:
   ```bash
   python3 scripts/make_caller.py --dry-run --batch all
   ```
4. **Generate the shouts first** — seven files, ~121 credits, and they tell you
   whether the voice is right before you commit to ninety:
   ```bash
   python3 scripts/make_caller.py --batch shouts
   ```
5. **Listen. On the phone speaker, at arm's length, with the game running.**
   If the voice is wrong, change `--voice` and do the seven again. Seven files
   is a cheap opinion; ninety is not.
6. **Then the ninety:**
   ```bash
   python3 scripts/make_caller.py --batch calls
   ```
7. **Audit before committing:** `python3 scripts/make_caller.py --verify`.

**The raw API response for every row is kept in `audio/call/_raw/` forever.**
Re-encoding, re-trimming, re-levelling and changing the bitrate all run off
those masters and **cost nothing**:

```bash
python3 scripts/make_caller.py --postprocess-only --batch all
```

That is the single most important property of this pipeline. Every "it is too
long / too loud / too big" complaint is a free re-run, not a re-bill.

---

## 2. THE VOICE

One man, calling numbers he has called a thousand times. Not a newsreader, not
a game-show host, not excited. **Warm, unhurried, slightly bored, completely
clear.** The comedy in TOMBLA is on the screen — the laqam and the joke are
laid out in `callOf()` — and the voice's whole job is to be the straight man
under it. A caller who performs every number is unbearable by number twenty,
which is a quarter of the way through one game.

**Default: `George` — `JBFqnCBsd6RMkjVDRZzb`.** Warm British baritone, and the
only voice id ElevenLabs still publishes in its own quickstart. British rather
than American is deliberate: Malta's English is British-inflected, and a
Maltese ear will find *"six and one, sixty-one"* in RP entirely normal and the
same line in General American faintly wrong.

Alternates worth ten minutes: `Brian` `nPczCjzI2devNBz1zQrb` (deeper, American,
more narrator), `Bill` `pqHfZKP75CvOlQylNhV4` (older, club-caller).

### ⚠️ Verify the voice id on your own key before generating ninety files

ElevenLabs docs, verbatim: **"All our Default voices will expire on December 31,
2026"**, and default voices are **"only accessible to accounts established
before March 2026."** A key created recently may resolve to the *replacement*
set instead (George → *Eldrin*, Brian → *Sawyer*, Bill → *Wyatt*). The ids
above are also not published on the current default-voices page — they come
from third-party integration docs.

```bash
python3 scripts/make_caller.py --list-voices
```

That hits `GET /v1/voices?voice_type=default` and prints name → id from your
account. Use what it prints. Then either edit `VOICE_ID` in the script or pass
`--voice <id>` / set `$ELEVENLABS_VOICE_ID`.

**One voice for the whole set, always.** Ninety files that are ninety-five per
cent the same sentence will expose any drift instantly. This is also why every
row carries a fixed `stability` and the script sends a **deterministic seed
derived from the row id** — regenerating one file later gives back the same man,
not his cousin.

---

## 3. THE SIZE BUDGET

KARTI is a PWA on a phone over Maltese 4G, and `sw.js` **wipes its runtime
cache on every deploy** (`activate` deletes every cache that is not the current
one, and only the `CORE` list is carried forward across a bump). So anything
cached at runtime is paid for again after every single deploy.

That is the argument for the whole design below. **The caller is never
precached and is fetched one number at a time** (§9), so the re-download after
a deploy is not 560 KB — it is 5 KB per number that actually comes out of the
bag, in a game the player is already playing.

### The budget, and it is enforced

| | |
|---|---|
| Format | **mono MP3, 22.05 kHz, 32 kbps** — the standard spoken-word bitrate |
| **Per file** | **≤ 10.0 KB. No exceptions.** |
| **Batch A, the 90 calls** | **≤ 560 KB** (expected ~526 KB) |
| **Batch C, the 7 shouts** | **≤ 35 KB** (expected ~31 KB) |
| **SHIPPED TOTAL** | **≤ 600 KB** |
| Batch B, the 28 laqmijiet, if ever generated | +101 KB → ceiling 700 KB |

`--verify` checks every one of those and says so if a file is over.

The 600 KB line sits deliberately between the **expected** 556 KB and the
**theoretical ceiling** of 650 KB. The ceiling assumes every one of the 97 files
lands exactly on its `trim_to`, and none will: each `trim_to` carries ~0.2 s of
headroom precisely so that a hard cut (§8) means something is wrong rather than
being the normal case. If `--verify` ever reports over 600 KB, something has
genuinely gone long — go and look, do not raise the number.

### Computed from this sheet's own `trim_to` column

| Group | Files | Audio | Expected | Ceiling |
|---|---:|---:|---:|---:|
| Calls 1–9 (`Number seven.`) | 9 | 6.3 s | 27 KB | 35 KB |
| Calls 10–90 (`Six and one, sixty-one.`) | 81 | 123.3 s | 499 KB | 578 KB |
| **Batch A total** | **90** | **129.6 s** | **526 KB** | 614 KB |
| Batch C, shouts | 7 | 7.5 s | 31 KB | 36 KB |
| **SHIPPED** | **97** | **137.1 s** | **556 KB** | **650 KB** |
| Batch B, laqmijiet (opt-in) | 28 | 24.4 s | 101 KB | 129 KB |

For scale: the existing sound set is **51 files and 356 KB**. The caller is
**1.6× the entire rest of the game's audio**, and that is the honest headline.
It is acceptable only because of the lazy rule, and if it stops being
acceptable the cuts are below.

### If it is too big — cut in this order

1. **Do not generate Batch B.** Already the default. −101 KB.
2. **Drop `OUT_KBPS` to 24 and re-run `--postprocess-only`.** Free, no API
   call, takes about a minute, and brings the shipped set from 556 KB to
   **422 KB** — comfortably inside the existing set's own 600 KB ceiling. The
   voice gets thinner; on a phone speaker in a noisy room, very few people
   would name which one they were hearing. **This is the cut to make first if
   size ever actually bites.**
3. **Drop the digits.** `Sixty-one.` instead of `Six and one, sixty-one.` takes
   Batch A to about 290 KB and takes the whole character of the call with it.
   Do not do this — it is the one thing the owner asked for by name.
4. **Ship §7.2 only.** 31 KB. See §0.7.

### What it costs on the wire, which is the number that matters

| Moment | Bytes |
|---|---|
| One number drawn, first time on this device | **~6 KB** |
| Idle prefetch, per draw | ~2 files ≈ 12 KB, only while nothing is happening |
| A whole 90-draw game, cold cache | ≤ 560 KB over ~10 minutes |
| A whole game, warm cache | **0** |
| First game after a deploy | as cold, and only for numbers actually drawn |

---

## 4. SETTINGS, MODEL AND COST

| Field | Value | Why |
|---|---|---|
| Endpoint | `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` | Not `/v1/sound-generation`. Different billing entirely. |
| `output_format` | **`mp3_44100_128`** (query param) | Take the master at the best **free-tier** quality, then encode down locally. Transcoding from 128 kbps beats asking the API for 32. `mp3_44100_192` needs Creator tier; 44.1 kHz PCM/WAV needs Pro. 128 is the default and is ungated. |
| `model_id` | per row, §4.1 | |
| `apply_text_normalization` | **`off`** on every row | Every number in §7 is **already spelled out in words**. There is nothing to normalise, and normalisation adds latency and its own opinions. `"on"` is rejected outright on `flash_v2_5`/`turbo_v2_5` below Enterprise, so `off` is also the only value that works on every model. |
| `voice_settings.stability` | per row | 0.55 for calls (same man, ninety times). §4.1 for the v3 rule. |
| `voice_settings.similarity_boost` | 0.80 | |
| `voice_settings.style` | **0.0** | Above zero it wanders and adds latency. There is nothing to emote in *"Six and one, sixty-one."* |
| `voice_settings.speed` | **1.08** on calls | A caller is brisk. 1.08 is a real trim on 90 files and still sounds like a person; past ~1.10 it starts to sound rushed. Range 0.7–1.2. |
| `seed` | derived from the row id | Deterministic. Regenerating one row does not change the voice mid-set. |
| `language_code` | **not sent** | There is no `mt`. Sending `en` on the v3 rows would fight the IPA. |

### 4.1 The three models, and which rows use which

The sheet's `model` column carries a short alias. The script maps it:

| alias | `model_id` | Cost | Used for | Why |
|---|---|---:|---|---|
| `std` | `eleven_multilingual_v2` | **1.0 credit/char** | the 90 calls | The English quality benchmark, and the most *predictable*. Ninety near-identical lines need consistency far more than expression. |
| `fast` | `eleven_flash_v2_5` | **0.5 credit/char** | nothing, by default | Half price, small quality step down, **no phoneme tags, no audio tags**. Use it via `--model fast` if credits ever bite. |
| `v3` | `eleven_v3` | 1.0 credit/char | the 7 shouts, the 28 laqmijiet | The only model with **audio tags** (`[excited]`) and **inline IPA**. Both are needed, and only here. |

⚠️ `eleven_turbo_v2_5` and `eleven_turbo_v2` are now listed as **deprecated**.
Use `eleven_flash_v2_5` for the 0.5× rate.

⚠️ **`eleven_v3` only accepts `stability` of exactly `0.0`, `0.5` or `1.0`**
(Creative / Natural / Robust). Every v3 row in §7 uses one of those three, and
the script rejects the sheet if one does not.

### 4.2 The cost, and it is not the constraint

Speech is billed **per character of `text`**, one credit per character on `std`
and `v3`, half on `fast`.

| Batch | Rows | Characters | Model | **Credits** |
|---|---:|---:|---|---:|
| A — the 90 calls | 90 | 2,177 | `std` ×1.0 | **2,177** |
| C — the 7 shouts | 7 | 121 | `v3` ×1.0 | **121** |
| **Shipped total** | **97** | **2,298** | | **2,298** |
| B — the 28 laqmijiet (opt-in) | 28 | 365 | `v3` ×1.0 | 365 |
| Everything | 125 | 2,663 | | **2,663** |

**Against roughly 9,400 credits remaining, one clean pass of the shipped set
costs about 2,300 — under a quarter of what is left, with about 7,100 spare.**
That is enough to regenerate all ninety **three more times**, which is the point:
if a take is wrong, throw it away. On `--model fast` the same pass is 1,149.

**Credits are not the constraint here — size is (§3), exactly as in the sound
set.** Do not accept a bad voice to save characters.

### 4.3 ⚠️ The free tier's licence, which is a real problem and not a technical one

Two published terms, and the owner needs to see both:

- **No commercial use.** *"[The free plan] does not include a commercial licence
  and cannot be used for any commercial purpose."*
- **Attribution.** Free-tier output shared publicly must credit ElevenLabs —
  the string **"elevenlabs.io"** in the title — and this applies to content
  generated before or after any later subscription.

KARTI is published on GitHub Pages. **The 51 sound effects already in `audio/`
are under the same terms**, so this is a pre-existing question rather than one
this document creates — but ninety files of a recognisable synthetic *voice*
raises it from theoretical to visible.

**The clean fix costs $6.** One month of **Starter** includes the commercial
licence, drops the attribution requirement and gives 30,000 credits — three
times what is needed for everything in this document plus a full regeneration
of the sound set. Generate everything in one sitting, then cancel. That is the
recommendation, and it is a decision for the owner, not for a script.

### 4.4 ⚠️ The "soft" trap, checked for this endpoint

`docs/SOUND_ELEVENLABS.md` §0 records that the **sound** model takes *soft*,
*quiet* and *subtle* literally and returns near-silent files. Four takes were
lost to it. The question was whether TTS does the same. **It does not — it does
something worse.**

On `eleven_multilingual_v2` and `eleven_flash_v2_5` there is **no
voice-direction field at all**. `stability`, `style` and `speed` are numbers.
Any adjective you put in `text` is **simply read out loud**. ElevenLabs' own
docs, verbatim: **"the model will still speak out the emotional delivery
guides… these can be removed in post-production using an audio editor if
unwanted."** Write `Softly: six and one` and the file says the word "softly".

- **On `std` rows: put nothing in `text` but the words to be spoken.** Not a
  stage direction, not a bracket, not a note to self. Loudness lives in the
  post-processing chain (§8) and in the caller module's gain (§9).
- **On `v3` rows only, square-bracket audio tags are real** and are interpreted
  rather than spoken: `[excited]`, `[whispers]`, `[laughs]`, `[sighs]`,
  `[sarcastic]`, `[curious]`. That is why the seven shouts are v3 rows. Their
  effect is voice-dependent — *"Some tags work well with certain voices while
  others may not"* — so audition them.
- **Never put a bracket tag on a `std` row.** Undocumented behaviour; the
  likely outcome is that it is spelled out.

`scripts/make_caller.py` warns on `soft`/`quiet`/`subtle`/`whisper`/`gently`/
`calmly` appearing as bare words outside brackets, as a backstop against a
hand-edit later.

---

## 5. THE CALL STRUCTURE

**`61` is called `"Six and one, sixty-one."`** The digits, then the number.
That is the traditional caller's announcement and it is the thing the owner
asked for by name.

### The rule, for all ninety

| Range | Text | Example |
|---|---|---|
| 1–9 | `Number <n>.` | 7 → `Number seven.` |
| 10–90, unit 0 | `<tens digit> and oh, <number>.` | 60 → `Six and oh, sixty.` |
| 10–99, otherwise | `<tens digit> and <unit digit>, <number>.` | 61 → `Six and one, sixty-one.` |

Fully regular, which matters: ninety files generated from one rule sound like
one man following one habit. Ninety hand-written lines sound like ninety
decisions.

The comma is doing real work — it is a ~200 ms beat between the digits and the
number, which is the rhythm of the thing. Not an ellipsis: that invites a breath
and a hesitation, and costs a quarter of a second on every file.

### What the voice deliberately does NOT say

`js/tombla.js` builds a call in three separate layers, on purpose — read the
comment above `LAQAM`:

| Layer | What it is | Where it goes |
|---|---|---|
| `mtNum(n)` | the number in Maltese — *wieħed u sittin* | **screen only** (§0) |
| `LAQAM[n]` | the sourced nickname — *il-pastizz* + English gloss | **screen**; audio only via opt-in Batch B |
| `JOKE[n]` / `PLAIN[]` | KARTI's own comedy, clearly labelled as ours | **screen only, always** |

**The voice says the number. The screen says everything else.** Two reasons,
and both are load-bearing:

1. **Length.** This fires ninety times in one game. `Six and one, sixty-one.`
   is 1.6 s. Add the laqam and the joke and it is five, and by number thirty
   somebody has muted the game. Length is what makes a caller tiring, and the
   jokes are funnier read than heard on the fifth game anyway.
2. **The jokes are written, not spoken.** *"Somebody has just marked the wrong
   square."* lands dry, in text, in the player's own head. Read aloud by a
   synthetic voice at a fixed cadence, ninety times, it dies. `JOKE` is
   deliberately sparse for exactly this reason and putting it in the audio
   would undo that.

**Nothing in `LAQAM` is ours and nothing has been added to it here.** Where the
sources disagreed about which number a nickname belongs to (*iċ-ċavetta* 18 vs
21, *ir-rixa* 57 vs 75, *it-tabib* 21 vs 27) `tombla.js` left it out, and it
stays out. §7.3 covers exactly the 28 that are in the file, and not one more.

> A full 90-number laqam list exists at
> <https://ghidhabilmalti.mt/laqmijiet-numri-tombla>. **It is not used here.**
> It was read through machine translation and several glosses came back plainly
> wrong (*tar-Randan*, "of Lent", rendered as "Ramadan"; *il-papra*, "the duck",
> as "the paper"; *il-qamel*, "the lice", as "the camel"). The Maltese strings
> look reliable; the English does not. If the owner wants the other 62, that
> page checked by a Maltese speaker is where they come from — and that is a
> `tombla.js` change, not an audio one.

---

## 6. THE MALTESE, FOR THE RECORD

Not used by the shipped set. Kept because §0 is a decision that should be
possible to revisit with a native ear in the room, and because re-doing this
research would cost another hour.

### 6.1 The numerals

Every form below is confirmed by Wiktionary IPA, the Wikivoyage phrasebook
respellings, Omniglot and languagesandnumbers.com — and the two sources that
give actual phonetics agree with each other on every single number.

| n | Maltese | IPA | Respelling |
|---:|---|---|---|
| 1 | wieħed | /ˈwɪːħɛt/ | WEE-het |
| 2 | tnejn | /tnɛjn/ | t'NAYN |
| 3 | tlieta | /ˈtlɪːta/ | TLEE-ta |
| 4 | erbgħa | /ˈɛrba/ | ERB-a |
| 5 | ħamsa | /ˈħamsa/ | HAM-sa |
| 6 | sitta | /ˈsɪtta/ | SIT-ta |
| 7 | sebgħa | /ˈsɛba/ | SEH-ba |
| 8 | tmienja | /ˈtmɪːnja/ | t'MEEN-ya |
| 9 | disgħa | /ˈdɪsa/ | DIH-sa |
| 10 | għaxra | /ˈaːʃra/ | AHSH-ra |
| 11 | ħdax | /ħdaːʃ/ | h'DAHSH |
| 12 | tnax | /tnaːʃ/ | t'NAHSH |
| 13 | tlettax | /tlɛtˈtaːʃ/ | tlet-TAHSH |
| 14 | erbatax | /ɛrbaˈtaːʃ/ | air-ba-TAHSH |
| 15 | ħmistax | /ħmɪsˈtaːʃ/ | h'mis-TAHSH |
| 16 | sittax | /sɪtˈtaːʃ/ | sit-TAHSH |
| 17 | sbatax | /zbaˈtaːʃ/ | z'ba-TAHSH |
| 18 | tmintax | /tmɪnˈtaːʃ/ | t'min-TAHSH |
| 19 | dsatax | /t͡saˈtaːʃ/ | tsa-TAHSH |
| 20 | għoxrin | /ɔʃˈriːn/ | osh-REEN |
| 30 | tletin | /tlɛˈtiːn/ | tle-TEEN |
| 40 | erbgħin | /ɛrˈbɛjn/ | **air-BAYN** |
| 50 | ħamsin | /ħamˈsiːn/ | ham-SEEN |
| 60 | sittin | /sɪtˈtiːn/ | sit-TEEN |
| 70 | sebgħin | /sɛˈbɛjn/ | **se-BAYN** |
| 80 | tmenin | /tmɛˈniːn/ | t'me-NEEN |
| 90 | disgħin | /dɪˈsɛjn/ | **di-SAYN** |
| — | u ("and") | /u ~ w/ | oo |

**Compounds are UNIT + `u` + TEN**, confirmed by all four sources — `61` is
`wieħed u sittin`, not `sittin u wieħed`. `1` is gendered (`wieħed` m /
`waħda` f); counting uses `wieħed`. `u` is /u/ between consonants and /w/ next
to a vowel; *"oo"* is understood in every position and is what the phrasebook
uses.

So the generation rule, if it is ever wanted, is:
`respell(n % 10) + " oo " + respell(floor(n / 10) * 10)`, dropping the unit when
`n % 10 == 0` — e.g. 74 → `air-ba oo se-BAYN`.

### 6.2 The letters that decide it

| Letter | IPA | What actually happens |
|---|---|---|
| **ħ** | /ħ/ | Voiceless pharyngeal fricative. **Audible, never silent.** Allophones [ħ ~ h ~ χ], and glottal **[h] is spreading among younger speakers** — so a plain English *h* is a defensible rendering, which is why `ħ` words are graded MED rather than HIGH in §7.3. |
| **h** | ∅ | Silent, except word-finally where it is /ħ/. No numeral is affected. |
| **għ** | ∅ / length | **Silent as a consonant** — the historic *ʕ/*ɣ is gone. Either no phonetic correlate or it lengthens the neighbouring vowel. Before `i` → /ɛj ~ aj/; before `u` → /ɔw ~ aw/; word-final → /ħ/. **Do not attempt a throaty sound.** |
| **q** | /ʔ/ | Glottal stop. The one an English voice has no reliable way to produce on demand — hence HIGH in §7.3. |
| ċ / ġ | /t͡ʃ/ /d͡ʒ/ | *church* / *judge*. Both fine in English. |
| ż / z | /z/ /t͡s/ | *maze* / *pizza*. |
| x | /ʃ/ | *shoe* — this is why every `-ax` numeral ends *-ahsh*. |
| j | /j/ | *yes*. |
| ie | /ɪː/ | long *ee*. |

> Wikipedia says `għ` "pharyngealises" the vowel. The academic literature (Hume,
> Vella, Venditti & Gett 2009; Borg & Azzopardi-Alexander) says pharyngealisation
> is **gone** in modern Standard Maltese and only length or diphthongisation
> remains. Trust the academic view. Also disregard sources describing `għ` as
> "guttural like the French r" — contradicted by every reference work.

---

## 7. THE TABLES

**Every table below has the same seven columns, in this order:**

| column | meaning |
|---|---|
| `id` | `call.NN`, `laqam.NN` or `shout.<name>`. The id the caller module plays. |
| `file` | save as **exactly** this, inside **`audio/call/`**. |
| `model` | `std` \| `fast` \| `v3` — see §4.1. |
| `speed` | `voice_settings.speed`. Range 0.7–1.2. |
| `stability` | `voice_settings.stability`. **v3 rows must be 0.0 / 0.5 / 1.0.** |
| `trim_to` | **hard ceiling in seconds**, enforced in §8. Not a guess that somebody has to remember to apply. |
| `text` | sent verbatim as the request body's `text`. Never contains a `\|`, never contains a digit. |

> **For `scripts/make_caller.py`:** a row is only read when the table
> immediately above it carries that exact header, and the id must match
> `^(call\|laqam\|shout)\.[a-z0-9]+$`. Nothing else in this document matches
> both conditions, so the whole file scans in one pass. The `text` cell is the
> last one and is taken verbatim. **A digit anywhere in `text` is a parse
> error** — numerals go through the API's normaliser, and the one thing this
> entire set exists to say is not worth handing to it.

### 7.1 Batch A — the ninety number calls · SHIP THIS

English. Digits, then the number (§5). One voice, one rule, ninety files.


**Calls 1–30**

| id | file | model | speed | stability | trim_to | text |
|---|---|---|---|---|---|---|
| call.01 | call-01.mp3 | std | 1.08 | 0.55 | 0.93 | Number one. |
| call.02 | call-02.mp3 | std | 1.08 | 0.55 | 0.93 | Number two. |
| call.03 | call-03.mp3 | std | 1.08 | 0.55 | 0.93 | Number three. |
| call.04 | call-04.mp3 | std | 1.08 | 0.55 | 0.93 | Number four. |
| call.05 | call-05.mp3 | std | 1.08 | 0.55 | 0.93 | Number five. |
| call.06 | call-06.mp3 | std | 1.08 | 0.55 | 0.93 | Number six. |
| call.07 | call-07.mp3 | std | 1.08 | 0.55 | 1.13 | Number seven. |
| call.08 | call-08.mp3 | std | 1.08 | 0.55 | 0.93 | Number eight. |
| call.09 | call-09.mp3 | std | 1.08 | 0.55 | 0.93 | Number nine. |
| call.10 | call-10.mp3 | std | 1.08 | 0.55 | 1.33 | One and oh, ten. |
| call.11 | call-11.mp3 | std | 1.08 | 0.55 | 1.73 | One and one, eleven. |
| call.12 | call-12.mp3 | std | 1.08 | 0.55 | 1.33 | One and two, twelve. |
| call.13 | call-13.mp3 | std | 1.08 | 0.55 | 1.53 | One and three, thirteen. |
| call.14 | call-14.mp3 | std | 1.08 | 0.55 | 1.53 | One and four, fourteen. |
| call.15 | call-15.mp3 | std | 1.08 | 0.55 | 1.53 | One and five, fifteen. |
| call.16 | call-16.mp3 | std | 1.08 | 0.55 | 1.53 | One and six, sixteen. |
| call.17 | call-17.mp3 | std | 1.08 | 0.55 | 1.93 | One and seven, seventeen. |
| call.18 | call-18.mp3 | std | 1.08 | 0.55 | 1.53 | One and eight, eighteen. |
| call.19 | call-19.mp3 | std | 1.08 | 0.55 | 1.53 | One and nine, nineteen. |
| call.20 | call-20.mp3 | std | 1.08 | 0.55 | 1.53 | Two and oh, twenty. |
| call.21 | call-21.mp3 | std | 1.08 | 0.55 | 1.73 | Two and one, twenty-one. |
| call.22 | call-22.mp3 | std | 1.08 | 0.55 | 1.73 | Two and two, twenty-two. |
| call.23 | call-23.mp3 | std | 1.08 | 0.55 | 1.73 | Two and three, twenty-three. |
| call.24 | call-24.mp3 | std | 1.08 | 0.55 | 1.73 | Two and four, twenty-four. |
| call.25 | call-25.mp3 | std | 1.08 | 0.55 | 1.73 | Two and five, twenty-five. |
| call.26 | call-26.mp3 | std | 1.08 | 0.55 | 1.73 | Two and six, twenty-six. |
| call.27 | call-27.mp3 | std | 1.08 | 0.55 | 2.13 | Two and seven, twenty-seven. |
| call.28 | call-28.mp3 | std | 1.08 | 0.55 | 1.73 | Two and eight, twenty-eight. |
| call.29 | call-29.mp3 | std | 1.08 | 0.55 | 1.73 | Two and nine, twenty-nine. |
| call.30 | call-30.mp3 | std | 1.08 | 0.55 | 1.53 | Three and oh, thirty. |

**Calls 31–60**

| id | file | model | speed | stability | trim_to | text |
|---|---|---|---|---|---|---|
| call.31 | call-31.mp3 | std | 1.08 | 0.55 | 1.73 | Three and one, thirty-one. |
| call.32 | call-32.mp3 | std | 1.08 | 0.55 | 1.73 | Three and two, thirty-two. |
| call.33 | call-33.mp3 | std | 1.08 | 0.55 | 1.73 | Three and three, thirty-three. |
| call.34 | call-34.mp3 | std | 1.08 | 0.55 | 1.73 | Three and four, thirty-four. |
| call.35 | call-35.mp3 | std | 1.08 | 0.55 | 1.73 | Three and five, thirty-five. |
| call.36 | call-36.mp3 | std | 1.08 | 0.55 | 1.73 | Three and six, thirty-six. |
| call.37 | call-37.mp3 | std | 1.08 | 0.55 | 2.13 | Three and seven, thirty-seven. |
| call.38 | call-38.mp3 | std | 1.08 | 0.55 | 1.73 | Three and eight, thirty-eight. |
| call.39 | call-39.mp3 | std | 1.08 | 0.55 | 1.73 | Three and nine, thirty-nine. |
| call.40 | call-40.mp3 | std | 1.08 | 0.55 | 1.53 | Four and oh, forty. |
| call.41 | call-41.mp3 | std | 1.08 | 0.55 | 1.73 | Four and one, forty-one. |
| call.42 | call-42.mp3 | std | 1.08 | 0.55 | 1.73 | Four and two, forty-two. |
| call.43 | call-43.mp3 | std | 1.08 | 0.55 | 1.73 | Four and three, forty-three. |
| call.44 | call-44.mp3 | std | 1.08 | 0.55 | 1.73 | Four and four, forty-four. |
| call.45 | call-45.mp3 | std | 1.08 | 0.55 | 1.73 | Four and five, forty-five. |
| call.46 | call-46.mp3 | std | 1.08 | 0.55 | 1.73 | Four and six, forty-six. |
| call.47 | call-47.mp3 | std | 1.08 | 0.55 | 2.13 | Four and seven, forty-seven. |
| call.48 | call-48.mp3 | std | 1.08 | 0.55 | 1.73 | Four and eight, forty-eight. |
| call.49 | call-49.mp3 | std | 1.08 | 0.55 | 1.73 | Four and nine, forty-nine. |
| call.50 | call-50.mp3 | std | 1.08 | 0.55 | 1.53 | Five and oh, fifty. |
| call.51 | call-51.mp3 | std | 1.08 | 0.55 | 1.73 | Five and one, fifty-one. |
| call.52 | call-52.mp3 | std | 1.08 | 0.55 | 1.73 | Five and two, fifty-two. |
| call.53 | call-53.mp3 | std | 1.08 | 0.55 | 1.73 | Five and three, fifty-three. |
| call.54 | call-54.mp3 | std | 1.08 | 0.55 | 1.73 | Five and four, fifty-four. |
| call.55 | call-55.mp3 | std | 1.08 | 0.55 | 1.73 | Five and five, fifty-five. |
| call.56 | call-56.mp3 | std | 1.08 | 0.55 | 1.73 | Five and six, fifty-six. |
| call.57 | call-57.mp3 | std | 1.08 | 0.55 | 2.13 | Five and seven, fifty-seven. |
| call.58 | call-58.mp3 | std | 1.08 | 0.55 | 1.73 | Five and eight, fifty-eight. |
| call.59 | call-59.mp3 | std | 1.08 | 0.55 | 1.73 | Five and nine, fifty-nine. |
| call.60 | call-60.mp3 | std | 1.08 | 0.55 | 1.53 | Six and oh, sixty. |

**Calls 61–90**

| id | file | model | speed | stability | trim_to | text |
|---|---|---|---|---|---|---|
| call.61 | call-61.mp3 | std | 1.08 | 0.55 | 1.73 | Six and one, sixty-one. |
| call.62 | call-62.mp3 | std | 1.08 | 0.55 | 1.73 | Six and two, sixty-two. |
| call.63 | call-63.mp3 | std | 1.08 | 0.55 | 1.73 | Six and three, sixty-three. |
| call.64 | call-64.mp3 | std | 1.08 | 0.55 | 1.73 | Six and four, sixty-four. |
| call.65 | call-65.mp3 | std | 1.08 | 0.55 | 1.73 | Six and five, sixty-five. |
| call.66 | call-66.mp3 | std | 1.08 | 0.55 | 1.73 | Six and six, sixty-six. |
| call.67 | call-67.mp3 | std | 1.08 | 0.55 | 2.13 | Six and seven, sixty-seven. |
| call.68 | call-68.mp3 | std | 1.08 | 0.55 | 1.73 | Six and eight, sixty-eight. |
| call.69 | call-69.mp3 | std | 1.08 | 0.55 | 1.73 | Six and nine, sixty-nine. |
| call.70 | call-70.mp3 | std | 1.08 | 0.55 | 1.93 | Seven and oh, seventy. |
| call.71 | call-71.mp3 | std | 1.08 | 0.55 | 2.13 | Seven and one, seventy-one. |
| call.72 | call-72.mp3 | std | 1.08 | 0.55 | 2.13 | Seven and two, seventy-two. |
| call.73 | call-73.mp3 | std | 1.08 | 0.55 | 2.13 | Seven and three, seventy-three. |
| call.74 | call-74.mp3 | std | 1.08 | 0.55 | 2.13 | Seven and four, seventy-four. |
| call.75 | call-75.mp3 | std | 1.08 | 0.55 | 2.13 | Seven and five, seventy-five. |
| call.76 | call-76.mp3 | std | 1.08 | 0.55 | 2.13 | Seven and six, seventy-six. |
| call.77 | call-77.mp3 | std | 1.08 | 0.55 | 2.53 | Seven and seven, seventy-seven. |
| call.78 | call-78.mp3 | std | 1.08 | 0.55 | 2.13 | Seven and eight, seventy-eight. |
| call.79 | call-79.mp3 | std | 1.08 | 0.55 | 2.13 | Seven and nine, seventy-nine. |
| call.80 | call-80.mp3 | std | 1.08 | 0.55 | 1.53 | Eight and oh, eighty. |
| call.81 | call-81.mp3 | std | 1.08 | 0.55 | 1.73 | Eight and one, eighty-one. |
| call.82 | call-82.mp3 | std | 1.08 | 0.55 | 1.73 | Eight and two, eighty-two. |
| call.83 | call-83.mp3 | std | 1.08 | 0.55 | 1.73 | Eight and three, eighty-three. |
| call.84 | call-84.mp3 | std | 1.08 | 0.55 | 1.73 | Eight and four, eighty-four. |
| call.85 | call-85.mp3 | std | 1.08 | 0.55 | 1.73 | Eight and five, eighty-five. |
| call.86 | call-86.mp3 | std | 1.08 | 0.55 | 1.73 | Eight and six, eighty-six. |
| call.87 | call-87.mp3 | std | 1.08 | 0.55 | 2.13 | Eight and seven, eighty-seven. |
| call.88 | call-88.mp3 | std | 1.08 | 0.55 | 1.73 | Eight and eight, eighty-eight. |
| call.89 | call-89.mp3 | std | 1.08 | 0.55 | 1.73 | Eight and nine, eighty-nine. |
| call.90 | call-90.mp3 | std | 1.08 | 0.55 | 1.53 | Nine and oh, ninety. |

### 7.2 Batch C — the seven prize shouts · SHIP THIS FIRST

`js/tombla-ui.js` already plays `tombla.shout` when a rung goes, and
`T.shoutOf()` already returns the Maltese word — **AMBO, TERNA, KWATERNA,
ĊINKWINA, TOMBLA**, and in hall mode **VERS** and **FATTA**. These seven put a
voice on the biggest moment in the game for 31 KB and 121 credits.

They are also the only Maltese in the shipped set, and they are safe: all
Italian-derived, all ordinary syllable shapes, **no `ħ`, no `għ`, no `q`
anywhere in them**. Two need respelling and nothing else:

- **ĊINKWINA → `Chinkweena`.** `ċ` = /t͡ʃ/, which is exactly English *ch*.
- **FATTA → `Fahtta`.** Maltese /ˈfatːa/ has a long open *a*; bare `Fatta` gets
  read /ˈfætə/, which is wrong in a way people will hear.
- **VERS → `Verse`.** Identical to the English word; spell it as the English
  word and it comes out right.

`v3` rows, so `[excited]` is interpreted rather than spoken (§4.4), at
stability `0.0` — Creative — because these are the one place in the set where
some variation is a feature.

| id | file | model | speed | stability | trim_to | text |
|---|---|---|---|---|---|---|
| shout.ambo | shout-ambo.mp3 | v3 | 1.00 | 0.00 | 1.28 | [excited] Ambo! |
| shout.terna | shout-terna.mp3 | v3 | 1.00 | 0.00 | 1.28 | [excited] Terna! |
| shout.kwaterna | shout-kwaterna.mp3 | v3 | 1.00 | 0.00 | 1.53 | [excited] Kwaterna! |
| shout.cinkwina | shout-cinkwina.mp3 | v3 | 1.00 | 0.00 | 1.53 | [excited] Chinkweena! |
| shout.tombla | shout-tombla.mp3 | v3 | 1.00 | 0.00 | 1.28 | [excited] Tombla! |
| shout.vers | shout-vers.mp3 | v3 | 1.00 | 0.00 | 1.03 | [excited] Verse! |
| shout.fatta | shout-fatta.mp3 | v3 | 1.00 | 0.00 | 1.28 | [excited] Fahtta! |

### 7.3 Batch B — the laqmijiet · OPT-IN, NOT RECOMMENDED, WITH A STOP-RULE

**The default answer is no.** These are specified in full so the decision can
be made by ear rather than by argument, for 365 credits and 101 KB — but read
§0 first, and read the stop-rule below before generating anything.

`v3` rows carrying **inline IPA between forward slashes**, which is the only
phonetic control ElevenLabs offers outside its supported languages (§0.2).

⚠️ **If v3 does not recognise the slash notation it will spell the IPA symbols
out loud.** Generate `laqam.53` — `il-pastizz`, the least risky in the set —
**on its own, first**, and listen to it before spending the other 364 credits:

```bash
python3 scripts/make_caller.py --only laqam.53
```

#### The stop-rule

1. Generate the LOW and MED rows only — **23 files**, ~318 credits.
   **Do not generate the five HIGH rows at all**: 1, 22, 50, 63, 69. `għ` and
   `q` are the two sounds an English voice has no way to produce, and they are
   also precisely the sounds a Maltese listener uses to place a speaker.
2. **Play all 23 to a Maltese speaker who has never seen this document.** Not
   the owner reading along with the spelling — someone hearing it cold.
3. **If more than three make them wince, delete the whole batch.** Not the three
   — the batch. A caller that says *il-pastizz* beautifully and *ix-xiħa* like a
   tourist is worse than one that says neither, because the good ones make the
   listener trust it right up until the bad one.
4. Whatever survives, ship. A missing file is silence and the nickname is on
   screen regardless, so a partial batch is a valid end state — it just must be
   a partial batch chosen by a Maltese ear, not by a budget.

#### Risk grading

`LOW` — Romance-shaped, no `ħ`/`għ`/`q`, English can say it.
`MED` — a consonant cluster English does not use word-initially (`kn-`, `mn-`,
`fn-`, `ts-`), or a `ħ` that survives as English *h* (§6.2).
`HIGH` — `għ` or `q`. **Do not generate these.**

| n | laqam | gloss | IPA | risk |
|---|---|---|---|---|
| 1 | iż-żgħir | the little one | `/ɪzˈzɐjr/` | HIGH: għ |
| 5 | ċinku | the five | `/ˈtʃiŋku/` | LOW |
| 7 | il-pipa | the pipe | `/ɪlˈpiːpa/` | LOW |
| 10 | ta' San Pawl | Saint Paul's | `/ta san ˈpawl/` | LOW |
| 11 | il-knisja tax-Naxxar | the church at Naxxar | `/ɪlˈknɪsja taʃnaʃˈʃar/` | MED: kn- onset |
| 12 | tużżana | a dozen | `/tuzˈzaːna/` | LOW |
| 13 | ta' Ġuda | Judas' | `/ta ˈdʒuːda/` | LOW |
| 15 | Santa Marija | Our Lady of the Assumption | `/ˈsanta maˈriːja/` | LOW |
| 19 | San Ġużepp | Saint Joseph | `/san dʒuˈzɛpː/` | LOW |
| 22 | is-sorijiet għarkupptejhom | the nuns on their knees | `/ɪs sɔrɪˈjiːt arkupˈtɛjhɔm/` | HIGH: għ, and eight syllables |
| 25 | il-Milied | Christmas | `/ɪl mɪˈliːt/` | LOW |
| 29 | tal-Imnarja | the Imnarja feast | `/tal ɪmˈnarja/` | MED: mn- onset |
| 33 | l-età ta' Kristu | the age of Christ | `/lɛˈta ta ˈkrɪstu/` | LOW |
| 44 | il-patrijiet | the friars | `/ɪl patrɪˈjiːt/` | LOW |
| 48 | il-mejjet | the dead man | `/ɪlˈmɛjːɛt/` | LOW |
| 50 | in-nofs qantar | half a hundredweight | `/ɪn nɔfs ˈʔantar/` | HIGH: q = glottal stop |
| 53 | il-pastizz | the pastizz | `/ɪl pasˈtitːs/` | LOW |
| 55 | il-fniek | the rabbits | `/ɪlˈfniːk/` | MED: fn- onset |
| 57 | il-ħut | the fish | `/ɪlˈħuːt/` | MED: ħ -> English h |
| 63 | l-għarusa | the bride | `/laˈruːsa/` | HIGH: għ |
| 66 | iż-żejżiet | the little ones | `/ɪzˈzɛjziːt/` | LOW |
| 69 | il-maqlubin | the upside-down pair | `/ɪl maʔluˈbiːn/` | HIGH: q = glottal stop |
| 77 | zpapen | the two walking sticks | `/ˈtsaːpɛn/` | MED: ts- onset |
| 81 | il-ħotbi | the hunchback | `/ɪlˈħɔtbi/` | MED: ħ -> English h |
| 84 | il-knisja | the church | `/ɪlˈknɪsja/` | MED: kn- onset |
| 88 | bajd u bajd | eggs and eggs | `/bajt u bajt/` | LOW |
| 89 | ir-ruħ | the soul | `/ɪrˈruːħ/` | MED: final ħ |
| 90 | ix-xiħa | the old woman | `/ɪʃˈʃiːħa/` | MED: medial ħ |

#### The rows

| id | file | model | speed | stability | trim_to | text |
|---|---|---|---|---|---|---|
| laqam.01 | laqam-01.mp3 | v3 | 0.98 | 0.50 | 0.80 | /ɪzˈzɐjr/ |
| laqam.05 | laqam-05.mp3 | v3 | 0.98 | 0.50 | 0.80 | /ˈtʃiŋku/ |
| laqam.07 | laqam-07.mp3 | v3 | 0.98 | 0.50 | 1.03 | /ɪlˈpiːpa/ |
| laqam.10 | laqam-10.mp3 | v3 | 0.98 | 0.50 | 1.03 | /ta san ˈpawl/ |
| laqam.11 | laqam-11.mp3 | v3 | 0.98 | 0.50 | 1.71 | /ɪlˈknɪsja taʃnaʃˈʃar/ |
| laqam.12 | laqam-12.mp3 | v3 | 0.98 | 0.50 | 1.03 | /tuzˈzaːna/ |
| laqam.13 | laqam-13.mp3 | v3 | 0.98 | 0.50 | 1.03 | /ta ˈdʒuːda/ |
| laqam.15 | laqam-15.mp3 | v3 | 0.98 | 0.50 | 1.49 | /ˈsanta maˈriːja/ |
| laqam.19 | laqam-19.mp3 | v3 | 0.98 | 0.50 | 1.03 | /san dʒuˈzɛpː/ |
| laqam.22 | laqam-22.mp3 | v3 | 0.98 | 0.50 | 2.17 | /ɪs sɔrɪˈjiːt arkupˈtɛjhɔm/ |
| laqam.25 | laqam-25.mp3 | v3 | 0.98 | 0.50 | 1.03 | /ɪl mɪˈliːt/ |
| laqam.29 | laqam-29.mp3 | v3 | 0.98 | 0.50 | 1.26 | /tal ɪmˈnarja/ |
| laqam.33 | laqam-33.mp3 | v3 | 0.98 | 0.50 | 1.49 | /lɛˈta ta ˈkrɪstu/ |
| laqam.44 | laqam-44.mp3 | v3 | 0.98 | 0.50 | 1.26 | /ɪl patrɪˈjiːt/ |
| laqam.48 | laqam-48.mp3 | v3 | 0.98 | 0.50 | 1.03 | /ɪlˈmɛjːɛt/ |
| laqam.50 | laqam-50.mp3 | v3 | 0.98 | 0.50 | 1.26 | /ɪn nɔfs ˈʔantar/ |
| laqam.53 | laqam-53.mp3 | v3 | 0.98 | 0.50 | 1.03 | /ɪl pasˈtitːs/ |
| laqam.55 | laqam-55.mp3 | v3 | 0.98 | 0.50 | 0.80 | /ɪlˈfniːk/ |
| laqam.57 | laqam-57.mp3 | v3 | 0.98 | 0.50 | 0.80 | /ɪlˈħuːt/ |
| laqam.63 | laqam-63.mp3 | v3 | 0.98 | 0.50 | 1.03 | /laˈruːsa/ |
| laqam.66 | laqam-66.mp3 | v3 | 0.98 | 0.50 | 1.03 | /ɪzˈzɛjziːt/ |
| laqam.69 | laqam-69.mp3 | v3 | 0.98 | 0.50 | 1.26 | /ɪl maʔluˈbiːn/ |
| laqam.77 | laqam-77.mp3 | v3 | 0.98 | 0.50 | 1.03 | /ˈtsaːpɛn/ |
| laqam.81 | laqam-81.mp3 | v3 | 0.98 | 0.50 | 1.03 | /ɪlˈħɔtbi/ |
| laqam.84 | laqam-84.mp3 | v3 | 0.98 | 0.50 | 1.03 | /ɪlˈknɪsja/ |
| laqam.88 | laqam-88.mp3 | v3 | 0.98 | 0.50 | 1.03 | /bajt u bajt/ |
| laqam.89 | laqam-89.mp3 | v3 | 0.98 | 0.50 | 0.80 | /ɪrˈruːħ/ |
| laqam.90 | laqam-90.mp3 | v3 | 0.98 | 0.50 | 1.03 | /ɪʃˈʃiːħa/ |

---

## 8. POST-PROCESSING — AND WHY IT IS NOT A SEPARATE SCRIPT

`docs/SOUND_ELEVENLABS.md` carried a `trim_to` column from the first day and
**nothing ever applied it**. Thirty-five sounds shipped at their full generated
length — `ui.back` was specified at 0.10 s and was playing at 0.52 s, five times
too long, which is exactly what *"the back notice is long"* turned out to mean.
`scripts/trim_sfx.py` exists to clean that up after the fact.

**That does not happen twice.** In `make_caller.py`, fetching and
post-processing are one pass. A file cannot reach `audio/call/` without having
been through the chain, because the chain is what writes it.

The chain, per file, in order:

1. **Strip leading and trailing silence** — `silenceremove` at −45 dB, forwards
   then reversed. This is the real length control. TTS returns one clean take
   (no multi-take padding — that is an SFX-model problem, not this one) but it
   pads the ends, and a call that arrives 200 ms after the ball lands reads as
   broken.
2. **Loudness-normalise** to `I=-19:TP=-3.0:LRA=7`. One target for all 97, so
   no number is louder than another. That is 1 LU hotter than the sound set's
   `I=-20` — this is speech and it has to carry over a room — and the same
   −3 dB true-peak ceiling, because the caller can land on top of `tombla.call`
   and `ui.note` in the same frame.
3. **Encode** mono, 22.05 kHz, 32 kbps, with `-write_xing 0 -id3v2_version 0
   -map_metadata -1`. Those three flags strip about 300 bytes of header per
   file — 29 KB across the set, for free.
4. **Check against `trim_to`.** If it is still over after the silence came off,
   the *words* are too long, not the file. It is cut with a 15 ms fade so it
   cannot click, and **the row is listed loudly at the end of the run**:

   ```
   3 row(s) had to be HARD CUT to fit trim_to. …shorten the text in the
   sheet and re-run --postprocess-only (free), or raise the ceiling:
     call.77, call.87, laqam.22
   ```

   **A hard cut is a bug report, not a fix.** It means a word got clipped. Fix
   the sheet, then re-run — which costs nothing, because of the masters.

### The masters are the whole trick

Every raw API response is written to `audio/call/_raw/<same filename>` and kept.
`--postprocess-only` re-runs steps 1–4 for every row that has a master, with no
network call and no credits. So:

- changing the bitrate is free;
- changing the loudness target is free;
- tightening every `trim_to` after actually listening is free;
- and a re-run after any of those **cannot** re-bill, because the fetch step
  sees the master and skips.

`audio/call/_raw/` **must be gitignored**. It is roughly 2.3 MB and it is a
build input, not an asset.

---

## 9. PLAYBACK — THE WIRING FOR `js/tombla-ui.js`

**Nothing in this section has been implemented.** These are the hooks for
whoever is in the tombla files. Two call sites, one small module, no changes to
`js/sfx.js` and no changes to `js/tombla.js`.

### 9.0 The three rules, in priority order

1. **A missing file is silence, never an error.** Same rule as the sound set.
   `audio/call/` empty → TOMBLA plays exactly as it does today, the number
   appears on screen, nothing logs, nothing warns. Every single file in this
   document is an enhancement and not one of them is a dependency.
2. **Never block the draw.** The number must be on screen and the board
   markable whether or not any audio has loaded, resolved or decoded. The
   caller is fire-and-forget: `say()` returns immediately, always, and returns
   nothing.
3. **Manual mode is silent.** When the host is calling the numbers out loud
   himself, the phone must not talk over him. One flag, checked first.

### 9.1 Why a separate module and not `js/sfx.js`

`js/sfx.js` is a Web Audio mixer with a 51-entry `REG`, per-id gains, a dedupe
window, a voice pool and a preload pack system. The caller needs none of it and
would damage it:

- **97 more `REG` entries** for files that are one voice, never layered, never
  looped and never rate-shifted — that is a 190% increase in the registry for
  no shared behaviour.
- **`play()` gives up after 600 ms** if the buffer has not arrived. Correct for
  a card flip; wrong for a call, which has the whole ball animation to arrive in.
- **Decoded `AudioBuffer`s stay in memory.** 97 buffers of ~1.6 s at 22.05 kHz
  is around 13 MB of float32 on a phone, to play one file at a time.
- **The caller must interrupt itself** — a fast draw has to cut the previous
  number off mid-word. That is one line on an `HTMLAudioElement` and awkward in
  a voice pool.

So: a small module using **`HTMLAudioElement`**, one element reused, streaming,
cached by the HTTP layer and the service worker, no decode step and no memory
held. It **follows** `js/sfx.js` for mute and volume rather than duplicating the
settings.

Suggested file: `js/tombla-caller.js`, loaded after `sfx.js` and before
`tombla-ui.js`. It needs a `<script>` tag in `index.html` and its path added to
`CORE` in `sw.js` (it is ~3 KB and must work offline). **`audio/call/*.mp3` must
NOT be added to `CORE`** — see §3.

### 9.2 The module contract

```js
window.KARTI_CALLER = {
  say(n),                 // speak number n. Returns nothing. Never throws.
  shout(key),             // 'ambo'|'terna'|'kwaterna'|'cinkwina'|'tombla'|'vers'|'fatta'
  warm(calledArray),      // idle prefetch. Safe to call every draw.
  setEnabled(bool),       // manual mode turns it OFF
  isEnabled(),
  stop(),                 // cut whatever is talking, immediately
  diag()                  // { enabled, playing, cached:[], dead:[] }
};
```

Behaviour required of `say(n)`:

| Condition | Result |
|---|---|
| `setEnabled(false)` (manual mode) | no-op |
| `KARTI_SFX.isEnabled()` is false | no-op — one mute switch for the whole game |
| file 404s / decode fails | mark the id dead, **never retry it**, no-op forever after |
| a new number is drawn mid-sentence | cut the old one (`pause()`, `currentTime = 0`) and start the new one — the new number is the one that matters |
| audio has not arrived within **900 ms** of the draw | **drop it silently.** A call that arrives after the player has already read the number and marked it is worse than no call. |
| audio has arrived | play at `KARTI_SFX.getVolume() * 0.85` |

`0.85` because the voice is the loudest thing in the set by design and still
has to sit under the player's own master volume. Tune it there, in code —
never by regenerating a file.

### 9.3 The exact call sites

**One — the draw.** `js/tombla-ui.js`, `function onCall(n)` (currently ~line
775). It already fires two sounds; add a third line at the end:

```js
function onCall(n){
  if (!U || !n) return;
  const st = T.state();
  U.lastN = n; U.lastCall = st.calls;
  sfx('tombla.call', { force:true, gain:0.5 });
  sfx('ui.note',   { force:true, rate: 0.78 + (n / 90) * 0.95 });
  render();
  /* ── the anunzjatur. Silence if audio/call/ is empty, silent in manual
       mode, and never in the way of the render above. ── */
  try { window.KARTI_CALLER && window.KARTI_CALLER.say(n); } catch (e) {}
  try { window.KARTI_CALLER && window.KARTI_CALLER.warm(T.called()); } catch (e) {}
  const ball = U.root.querySelector('.tb-ball');
  …
}
```

Note it goes **after `render()`**, not before. The number is on the glass first;
the voice is decoration.

**Two — the shout.** `js/tombla-ui.js`, `function onPrize(seat, key)`
(currently ~line 789), beside the existing `sfx('tombla.shout')`:

```js
sfx('tombla.shout', { force:true });
try { window.KARTI_CALLER && window.KARTI_CALLER.shout(key); } catch (e) {}
```

`key` already matches the filenames — `ambo`, `terna`, `kwaterna`, `cinkwina`,
`tombla` — and `T.shoutOf()` already swaps in `vers`/`fatta` in hall mode, so
the module should apply the same swap: `if (hall && (key==='cinkwina')) key='vers'`,
`if (hall && (key==='tombla')) key='fatta'`. Read it off `st.opts.mode === 'hall'`.

**Three — manual mode.** Wherever the manual/host flag is set, once:

```js
window.KARTI_CALLER && window.KARTI_CALLER.setEnabled(!manualMode);
```

and `KARTI_CALLER.stop()` when switching *into* manual mid-game, so a call
already in flight does not talk over the host's first number.

### 9.4 Prefetch — and the reason it is not "the next number"

The obvious design is to preload the next ball. **Do not.**

`js/tombla.js` deliberately hides the future: `view(seat)` sets
`st.bagLeft = st.bag.length` and then `st.bag = []`, with the comment *"the only
secret in tombla is what has not come out of the bag yet"*. A prefetch of
`call-38.mp3` puts the next number in the network panel, in the service worker
cache and in the browser's resource timing — **readable from JavaScript by any
player in an online game.** That would be a cheat vector built on top of the one
thing the module was careful to hide.

Prefetch from the **past** instead:

```js
warm(called)   // called = T.called(), the numbers already out
```

- Build `remaining` = 1..90 minus `called`. This is public information; every
  player's board shows it.
- Fetch **two** of them per draw, chosen at random from `remaining`, skipping
  anything already cached or dead.
- Only on idle (`requestIdleCallback`, 2.5 s timeout).
- `fetch(url, {credentials:'same-origin'}).catch(()=>{})` — the response body is
  discarded; the point is to land it in the HTTP and service-worker caches so
  the later `new Audio(url)` is instant.

Two per draw against one consumed per draw means the warm set runs ahead of the
game and is fully warm by roughly the twentieth call, at ~12 KB per draw of
genuinely idle bandwidth. And it leaks nothing, because a uniform sample of what
is left is exactly what an observer could already compute.

Warm the seven shouts once at module load — 31 KB total, and the shout is the
one cue that absolutely cannot be late.

### 9.5 A missing file, precisely

```js
a.addEventListener('error', () => { dead[id] = true; });
```

One flag, checked before every play, never cleared, never retried. Nothing is
logged at `warn` level and nothing is surfaced in the UI. **Delete
`audio/call/61.mp3` and number 61 simply goes quiet while the other eighty-nine
still speak** — that is the acceptance test, and it is in §10.

---

## 10. QA — BEFORE YOU CALL IT DONE

- [ ] `python3 scripts/make_caller.py --verify` is clean: **no file over 10 KB**,
      no file over its `trim_to`, total **under 600 KB**.
- [ ] `du -ch audio/call/*.mp3 | tail -1` agrees with it.
- [ ] `audio/call/_raw/` is in `.gitignore` and **is not committed**.
- [ ] **Leading silence is 0 ms on every file.** The most common defect, and on
      a call it reads as the app lagging.
- [ ] **No file was hard-cut.** A hard cut means a clipped word. Check the end
      of the generation log.
- [ ] **Play all ninety in a row** — `for f in audio/call/call-*.mp3; do
      ffplay -autoexit -nodisp "$f"; done`. Listen for: a number that is a
      different man; a number noticeably louder; a clipped final consonant.
      *Seventy-seven* and *eighty-seven* are the longest and fail first.
- [ ] **Draw twenty numbers in a real game, on the phone speaker, at arm's
      length.** If it grates at twenty it is unbearable at ninety. This is the
      whole test. If it does grate: lower the gain in §9.2, or raise `speed`
      to 1.10 and re-run `--postprocess-only`. Do not regenerate.
- [ ] **Draw two numbers fast.** The first call must cut off cleanly, not
      overlap the second.
- [ ] **Turn Sounds off in Settings.** The caller must be completely silent.
- [ ] **Switch to manual mode mid-game.** The caller must stop mid-word and
      stay stopped.
- [ ] **Delete `audio/call/call-61.mp3` and play a game.** 61 goes quiet; every
      other number still speaks; nothing logs; nothing breaks. If anything else
      happens, that is a bug worth reporting.
- [ ] **Delete the whole of `audio/call/` and play a game.** TOMBLA must behave
      exactly as it does today.
- [ ] Play one game with the phone in aeroplane mode after a fresh deploy —
      no caller audio, no errors, no stalls waiting on a fetch.
- [ ] If Batch B was generated: **the stop-rule in §7.3 has actually been run,
      by a Maltese speaker, listening cold.**
