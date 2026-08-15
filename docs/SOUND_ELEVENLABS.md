# KARTI — THE SOUND SET

Everything KARTI needs to make a noise: what each sound is, where it plays, how
long it runs, the exact filename it must be saved as, and the exact words to
paste into ElevenLabs to generate it.

**40 files. Under 600 KB for the lot.**

You generate the audio. The game is already wired to use it: `js/sfx.js` ships
with all 40 ids registered and every one of them missing. **A sound that does
not exist is silence, not an error.** Drop `ui-tap.mp3` into `audio/` and taps
start clicking; drop nothing in at all and KARTI works exactly as it does
today. There is no "audio pack" to finish before you can ship. Generate five
sounds tonight, put them in, ship it, do five more next week.

---

## 0. THE ONE RULE: SOFT AND ADDICTIVE, NEVER ANNOYING

> *"Make sure sounds are soft and not annoying. All soft and addictive."*

This is the acceptance criterion for the whole set and it beats everything else
in this document. A KARTI sound is heard **hundreds of times in one evening**.
The difference between a good set and a bad one is not how impressive any
single sound is on its own — it is whether it is still pleasant the
two-hundredth time. **Design for repetition, not for a demo.**

### ⚠️ The trap: never ask ElevenLabs for a "soft" or "quiet" sound

This is the most important sentence in the document. **Do not put the words
*soft*, *quiet*, *subtle* or *unobtrusive* into a prompt.** The model takes
them literally and returns files peaking around 0.03 — effectively inaudible.
Real projects have lost whole batches of takes this way.

So softness is achieved **three other ways**, and the prompts in §6 are built
entirely out of the first one:

1. **Character words, not level words.** Ask for *muted, dull, damped,
   rounded, warm, mellow, dark, felt-covered, no sharp attack, no click edge,
   no crack, no ring*. That gives a genuinely gentle sound at a usable
   recording level. Every prompt below is written this way, deliberately.
2. **Level is set in code, not in the file.** `js/sfx.js` has a `g:` value per
   sound, banded by how often it is heard — read the comment above `REG`.
   That is where "soft" actually happens, and it is instant and reversible.
3. **One loudness for all 40 files** (§7), so nothing jumps out.

The rest of the philosophy, which the prompts *do* encode:

- **Short, damped, rounded.** Soft attacks, short decay, no high-frequency
  edge. If a sound makes you flinch once, it will make you mute the game by
  the fiftieth.
- **The most frequent sounds are the most damped things in the set.** Taps,
  card draws, piece lifts, turn changes — felt more than heard. Presence is
  *reserved* for rare moments.
- **No buzzers, no alarms, no shrill.** An illegal move is a **dull low
  thud** — a small polite "no", not a punishment. A harsh error sound is the
  single most common reason people permanently mute a game.
- **Warm and tactile.** Felt, cloth, wood, muted paper, terracotta, a
  felt-covered table. Restraint, not volume.
- **Escalation comes from PITCH and richness, not loudness.** The four rarity
  stings climb low → mid → bright → bells-and-band. Building the payoff from
  the rise rather than the level is what makes a pack opening addictive
  rather than noisy.
- **Nothing long, nothing droning.** Ambience only if it genuinely helps, and
  it is the first thing to cut.

**Credits are not the constraint** (§4 — one pass costs about a fifth of the
allowance). If a take comes back sharp, bright or loud, **throw it away and
generate it again.** That is the right trade every time. The constraint that
actually binds is download size on a phone (§3).

---

## 1. HOW TO ACTUALLY DO THIS

1. **elevenlabs.io → Sound Effects**, or the API (§4).
2. For each row in §6: paste the **prompt**, set **duration_seconds** and
   **prompt_influence** from the row, set **loop** only where it says `true`.
3. **Expect several takes inside one file — this is normal, and it is the
   thing that will trip you up.** See §4, "The padding problem". You keep the
   first good take and delete the rest.
4. It also returns several *variations* to choose between. **Listen on the
   phone speaker, not on headphones**, phone in your hand at arm's length.
   That is the real listening position.
5. Run the ffmpeg chain in §7 — that is what enforces the single loudness
   target and the size budget.
6. Save into `audio/` under **exactly** the filename in the row. Nothing else
   needs changing; the game picks it up on the next load.

**Order to generate in.** Not top to bottom — these ten first. They are what a
player hits in the first ten seconds and they carry most of the feel:

> `ui-tap` · `ui-sheet` · `ui-back` · `pack-tear` · `pack-flip` ·
> `rar-leggendarju` · `duel-summon` · `duel-hit` · `piece-place` · `ui-error`

Ten sounds and the game already feels finished. The other thirty are polish.

---

## 2. THE VOICE

Under the softness, everything in KARTI sounds like a village festa in August:
warm, brass-adjacent, made of wood and paper and terracotta and one very
distant petard. It is funny, but never a cartoon *boing* — the joke lives in
the game's writing, not in the sound effects. Read `js/cards.js` if you need
reminding: *"Never washed, never replaced. Nobody dares mention the smell."*
That is dry and confident. The sound is the same. Adult, never crude: no comedy
fart, no slide whistle, no record scratch.

- **Materials: felt, cloth, wood, paper, terracotta, mellow brass, stone.**
  Real things from a real village. Nothing synthetic, no lasers, no digital
  blips.
- **Dry and close.** Almost no reverb — a phone speaker turns reverb into mud,
  and reverb tails smear together when several cues stack.
- **Short.** Anything triggered more than twice a minute is under 200 ms. The
  entire ceremony budget is spent on the pack opening, and even there the
  ceremony is *warmth*, not volume.

---

## 3. THE SIZE BUDGET

KARTI is a PWA installed on a phone and served off GitHub Pages. Every kilobyte
is downloaded over Maltese 4G and then sits in the service worker cache, which
is **wiped and refilled on every deploy** (`activate` in `sw.js` deletes every
old cache). A bloated sound set is a tax paid again on every single update.

Computed from this sheet's own `trim_to` column and the bitrates in §7 — not a
wish:

| Group | Files | Format | Size |
|---|---:|---|---:|
| Short one-shots (≤ 1.0 s) | 26 | mono MP3 64 kbps | ~106 KB |
| Medium (1.0–2.0 s) | 8 | mono MP3 64 kbps | ~92 KB |
| Stings (1.9–3.0 s) | 4 | mono MP3 96 kbps | ~104 KB |
| **Core set** | **38** | | **~303 KB** |
| Ambience loops (optional) | 2 | mono MP3 64 kbps | ~192 KB |
| **Whole set** | **40** | | **~495 KB** |
| **HARD CEILING** | | | **600 KB** |

Note the shape of that: **twenty-six files cost 106 KB between them**, and four
files heard once a game cost almost as much. That is the correct way round, and
it is what "short and damped" buys you.

```bash
du -ch audio/*.mp3 | tail -1        # must be under 600K
```

Over budget is nearly always one file that still has the *other* takes, or a
silent tail, welded onto the end. Trim it (§7).

---

## 4. SETTINGS, MODEL AND COST

ElevenLabs' Sound Effects tool is **text-to-SFX**: a text prompt plus a few
controls. It is not an image generator, and prompts written like image prompts
come back badly.

| Field | Value | Why |
|---|---|---|
| Endpoint | `POST https://api.elevenlabs.io/v1/sound-generation` | |
| Model | `eleven_text_to_sound_v2` | **`loop` only works on v2.** |
| `duration_seconds` | **Always set it explicitly**, per row | Costs **40 credits/second** when set, vs **200 credits flat** when omitted. Range **0.5 – 30 s**; 0.5 is the floor, which is why no row generates shorter even where the target is 90 ms. **Auto-duration is unreliable** — the duration predictor is widely reported to miss badly. Never leave it on Auto. |
| `prompt_influence` | Per row, **0.7–0.9** for almost everything | Default is 0.3, far too loose here. High = it does what the words say. You want a damped wooden knock that is a damped wooden knock, not a creative interpretation. Only the two ambience loops drop to 0.5, where wandering is a feature. |
| `output_format` | **`pcm_44100`** if you use the API | Take the master as PCM, never MP3 — see the loop problem in §6.6. Convert to MP3 yourself in §7. |
| `loop` | `true` on the two `amb-*` rows only | §6.6. |

**Cost of one clean pass: 2,564 credits** of 10,000 — the 38-file core set is
**1,604**, and the two 12-second ambience loops are **960** of it all by
themselves (another reason they are the first thing to cut). That leaves nearly
**7,500 credits — enough to regenerate the whole core set four times over.**
That headroom is the point, and you will use it: with several takes arriving in
every file, second and third attempts are the normal way this job goes. Never
accept a harsh take to save credits.

### ⚠️ The padding problem — read this before you generate anything

**The endpoint does not return one clean take.** It fills the *entire requested
duration* with **several variations of the effect separated by silence**, and
many files also open with lead-in silence before the first one.

This is the biggest practical gotcha in the job, and it has three consequences:

1. **Ask for a duration close to what you actually want, then keep take one and
   delete the rest.** Do **not** "generate long and trim" — that multiplies the
   takes you have to wade through *and* costs 40 credits a second. Every
   `duration_seconds` below is already as tight as the 0.5 s floor allows, for
   exactly this reason.
2. **The `trim_to` column is a starting guess, not gospel.** Open the file,
   find where the first take ends, cut there. For the long stings especially
   (`rar-leggendarju`, `duel-win`) the "3 seconds" you asked for may come back
   as three separate 1-second flourishes. Keep the best one.
3. **Leading silence cannot be prompted away — it is a trimming job only.**
   The QA gate is *leading silence = 0 ms after trim*. A sound arriving 30 ms
   late on a card flip reads as broken.

### Vocabulary that works, and vocabulary that does not

**✅ Use these — field-tested as reliable:**
`dry` · `tight` · `short` · `percussive` · `punchy` · `muted` · `dull` ·
`rounded` · `warm` · `mellow` · `dark` · `damped` · `single isolated sound
effect` · `clean foley recording` · `seamless ambient bed` · and above all
**naming the material** (`felt-covered`, `terracotta`, `thin paper`, `wooden`).

**❌ Never use these:**

| Banned | Why |
|---|---|
| `soft`, `quiet`, `subtle`, `unobtrusive` | Taken literally → peak ~0.03, inaudible. **The big one.** |
| `cinematic`, `epic`, `trailer`, `braam`, `huge`, `cavernous` | Trailer vocabulary. Works *too well* and blows the scale out of a small game cue. |
| `pickup sound`, `menu sound`, `UI click`, and other UI abstractions | Abstract words give you generic UI beeps. Describe the **causing action** — *a card laid down on felt*, not *a card play sound*. |
| `stinger`, `transient`, `close-mic'd` | No evidence the model understands them. Wasted words; none appear in any prompt below. |

**Other things to know:**

- **Negatives are a nudge, not a guarantee.** There is no negative-prompt
  parameter, and users report `no background noise` being ignored outright. But
  appending `no music, no reverb tail, no voices` is standard practice in
  shipping pipelines and never backfires — so every prompt below ends with
  them, as backup behind a positive description of what you *do* want.
- **Known output bias: it skews metallic, bright and musical**, and will add
  background music to a prompt that never asked for one. That is the exact
  opposite of the KARTI voice, which is why every prompt below leads with
  material and damping. If a take comes back metallic, **say the material
  again** rather than adding adjectives.
- **Never ask for speech.** Anything reading like dialogue gives a synthetic
  voice that sounds wrong beside everything else. The ambience beds say
  `no distinct words` for this reason.
- **If two takes are wrong, change the noun, not the adjectives.** Swapping
  "click" for "knock", or "slap" for "thump", fixes it far more often than
  piling on adjectives — and usually makes it gentler too.

### If you want the pitched files properly in tune

`ui-toast`, `ui-reward`, `duel-start`, `duel-win`, `duel-lose` and the four
`rar-*` stings are the only pitched sounds in the set. **The SFX model does not
reliably obey a key or a BPM** — key and tempo control belong to **Eleven
Music**, a different model. The prompts below therefore describe pitch
*relatively* ("low", "mid-range", "rising"), which is enough for the escalation
to read.

If you later want them genuinely in one key so they chime together, regenerate
**those nine in Eleven Music**, naming a key — *"in F major"*, the warm key a
village band actually plays in — and **one integer BPM** (Eleven Music forbids
ranges: `96`, never `90-100`). A nice-to-have, not a blocker.

---

## 5. THE AUDIT — WHERE EVERY SOUND PLAYS

| # | Sound | Plays when | How often |
|---|---|---|---|
| 1 | `ui-tap` | any button, any tab, any nav | constantly |
| 2 | `ui-back` | back / close / cancel | constantly |
| 3 | `ui-sheet` | a bottom sheet or modal slides up | often |
| 4 | `ui-toggle` | a settings switch flips | rare |
| 5 | `ui-toast` | the toast bar appears; a takeback is requested | often |
| 6 | `ui-error` | illegal move, "you must take", no packs, disconnect | often |
| 7 | `ui-reward` | coins/packs granted, story boss cleared, tutorial done | rare |
| 8 | `ui-coin` | the KARTI coin toss decides who starts | once a game |
| 9 | `duel-start` | a duel or a board game begins | once a game |
| 10 | `duel-draw` | a card is drawn; cards are dealt in SKARTA | every turn |
| 11 | `duel-shuffle` | deck shuffled, gacha shuffle, SKARTA refill | rare |
| 12 | `duel-summon` | a monster is played to the field | 2–4 a turn |
| 13 | `duel-boss` | a level 5+ tribute summon lands | rare, big |
| 14 | `duel-attack` | an attack is declared | 2 a turn |
| 15 | `duel-hit` | damage lands on life points | every turn |
| 16 | `duel-destroy` | a monster is destroyed | 2 a turn |
| 17 | `duel-spell` | a spell resolves | 1–2 a turn |
| 18 | `duel-trap` | a face-down trap flips up | rare |
| 19 | `duel-turn` | the turn passes to the other player | every turn |
| 20 | `duel-win` | you win a duel, chess, dama, SKARTA or KIRI | once a game |
| 21 | `duel-lose` | you lose one | once a game |
| 22 | `pack-tear` | the pack splits down the seam | once a pack |
| 23 | `pack-flip` | a card turns over in the reveal | 5 a pack |
| 24 | `pack-dupe` | the card just flipped is a duplicate | often |
| 25 | `pack-tally` | the results screen counts up | once a pack |
| 26 | `rar-komuni` | a Common is revealed | ~3 a pack |
| 27 | `rar-rari` | a Rare is revealed | ~1.7 a pack |
| 28 | `rar-epiku` | an Epic is revealed | ~1 in 3 packs |
| 29 | `rar-leggendarju` | a **Legendary** is revealed | ~1 in 16 packs |
| 30 | `piece-lift` | a chess or dama piece is picked up | every move |
| 31 | `piece-place` | it is put down; also castling (played twice) | every move |
| 32 | `piece-capture` | a piece is taken; each hop of a dama multi-jump | often |
| 33 | `piece-king` | dama crowning, chess pawn promotion | rare |
| 34 | `board-check` | your king is in check | a few a game |
| 35 | `card-throw` | a card is played in SKARTA or the Playing Cards drawer | every turn |
| 36 | `card-sweep` | the trick is swept in; the chain is eaten | often |
| 37 | `money-pay` | IL-KIRI rent, tax, salary, buying a property | constantly |
| 38 | `dice-roll` | IL-KIRI dice | every turn |
| 39 | `amb-festa` | *(optional loop)* home screen | continuous |
| 40 | `amb-kazin` | *(optional loop)* party games hub | continuous |

**Sounds deliberately NOT made.** Castling is `piece-place` played twice 130 ms
apart. A dama multi-jump is `piece-capture` once per hop. Chess promotion is
`piece-king`. A takeback request is `ui-toast`, its approval `ui-toggle`.
Dealing is `duel-draw`. Every party-game win is `duel-win`. That is how **83
distinct game moments became 40 files** — and reuse is not only a size saving,
it is what makes the game sound like one thing instead of forty. Credits would
have allowed more; restraint is the design.

---

## 6. THE PROMPTS

**Every table below has the same seven columns, in this order:**

| column | meaning |
|---|---|
| `id` | the id `js/sfx.js` plays. Always `group.name`. |
| `file` | save as **exactly** this, inside `audio/`. |
| `duration_seconds` | send this to the API. Minimum 0.5. |
| `prompt_influence` | send this to the API. |
| `loop` | send `true` only where it says `true`. |
| `trim_to` | **starting guess** for ffmpeg `-t` after keeping take one. `-` = keep the whole first take. |
| `prompt` | paste verbatim. Contains no `|` characters. |

> **For `scripts/make_sfx.py`:** every row in this file whose first cell matches
> `^[a-z]+\.[a-z]+$` is a sound. Columns are the fixed order above. `loop` is
> the literal `true` or `false`; `trim_to` is a float or `-`. The prompt is the
> last cell, verbatim, and never contains a pipe. Nothing else in this document
> matches that pattern, so the whole file scans in one pass.

### 6.1 Shared UI — 8 files

The most-heard sounds in the game by a factor of ten. **Short, damped and
boring.** A UI click with personality is unbearable by the fortieth tap.

| id | file | duration_seconds | prompt_influence | loop | trim_to | prompt |
|---|---|---|---|---|---|---|
| ui.tap | ui-tap.mp3 | 0.5 | 0.9 | false | 0.09 | A single fingertip tap on a felt-covered card, dull and rounded with no click edge and no ring, dry and tight, single isolated sound effect, clean foley recording, no reverb, no music |
| ui.back | ui-back.mp3 | 0.5 | 0.9 | false | 0.10 | A single close wooden thump, dull rounded and dark, lower than a tap, struck firmly, one hit only, clearly audible, dry and tight, single isolated sound effect, clean foley recording, no click, no reverb, no music |
| ui.sheet | ui-sheet.mp3 | 0.6 | 0.8 | false | 0.35 | A cloth and paper whoosh sliding upward and settling, smooth and rounded with no sharp edges, dry and short, single isolated sound effect, clean foley recording, no reverb, no music |
| ui.toggle | ui-toggle.mp3 | 0.5 | 0.9 | false | 0.14 | A single muted switch flick, rounded and damped with no sharp snap, dry and tight, single isolated sound effect, clean foley recording, no reverb, no music |
| ui.toast | ui-toast.mp3 | 0.7 | 0.8 | false | 0.45 | One single warm marimba note struck with a felt mallet, mellow and rounded with a short decay, dry, single isolated sound effect, one note only, no melody, no music bed |
| ui.error | ui-error.mp3 | 0.7 | 0.85 | false | 0.35 | A single close wooden thud, blunt dull and warm with no sharpness, a flat hand laid firmly on a wooden table, clearly audible, dry and tight, single isolated sound effect, clean foley recording, no buzzer, no alarm, no reverb, no music |
| ui.reward | ui-reward.mp3 | 1.2 | 0.8 | false | - | Two warm marimba notes rising with one mellow bell over them, rounded and pleasant, dry and short, clean foley recording, no fanfare, no music bed |
| ui.coin | ui-coin.mp3 | 1.5 | 0.85 | false | - | A coin flicked spinning into the air with a warm whir, then settling and rocking to rest on a felt-covered table, muted and rounded, dry, single isolated sound effect, no bright metallic ring, no music |

> `ui-error` is the most important sound here and the easiest to get wrong. It
> must sound like **"no"** — blunt, warm, over — not like a punishment. If a
> take sounds electronic or sharp, swap "thud" for "knock" and go again.

### 6.2 The duel — 13 files

| id | file | duration_seconds | prompt_influence | loop | trim_to | prompt |
|---|---|---|---|---|---|---|
| duel.start | duel-start.mp3 | 2.0 | 0.75 | false | - | A short mellow brass phrase of three rising notes played by a small village band, warm rounded and unhurried, dry recording, ending cleanly, no drums, no reverb tail, no blare |
| duel.draw | duel-draw.mp3 | 0.5 | 0.85 | false | 0.30 | A single card sliding off the top of a deck, muted paper friction, dry short and tight, single isolated sound effect, clean foley recording, one card only, no snap, no music |
| duel.shuffle | duel-shuffle.mp3 | 1.2 | 0.85 | false | - | A deck of cards riffle shuffled once and squared up on a felt table, muted rounded paper, dry and smooth, clean foley recording, no sharp riffle, no music |
| duel.summon | duel-summon.mp3 | 0.8 | 0.8 | false | 0.55 | A thick card laid down flat on a felt-covered wooden table, one rounded muted thump with a warm woody body, dry and punchy, single isolated sound effect, clean foley recording, no slap, no sharp attack, no reverb, no music |
| duel.boss | duel-boss.mp3 | 2.0 | 0.8 | false | - | A heavy stone block settling onto a stone floor, deep muted thud with a warm rumble that fades quickly, weighty and dark, dry, single isolated sound effect, no crack, no music |
| duel.attack | duel-attack.mp3 | 0.7 | 0.85 | false | 0.45 | A rounded whoosh of something heavy moving quickly through the air, warm and muted with a swell, dry and short, single isolated sound effect, no sharp edge, no impact at the end, no music |
| duel.hit | duel-hit.mp3 | 0.8 | 0.85 | false | 0.55 | A deep muted thump against a heavy padded wooden door, warm and rounded with a short dark body, firm but damped, dry and punchy, single isolated sound effect, no crack, no reverb, no music |
| duel.destroy | duel-destroy.mp3 | 1.2 | 0.85 | false | - | A terracotta pot cracking and falling apart onto cloth, one muted dull break then scattering pieces, warm and rounded, dry, single isolated sound effect, no sharp smash, no reverb, no music |
| duel.spell | duel-spell.mp3 | 1.0 | 0.75 | false | - | A warm shimmer of marimba and glass notes rising, mellow and rounded with a short decay, dry, single isolated sound effect, no melody, no music bed |
| duel.trap | duel-trap.mp3 | 1.0 | 0.8 | false | - | A muted wooden snap of a small trap closing, one rounded click then a dark low settle, sudden but damped, dry and tight, single isolated sound effect, no metallic ring, no music |
| duel.turn | duel-turn.mp3 | 0.6 | 0.8 | false | 0.45 | A single close wooden block knock, dark hollow and rounded, struck firmly, one hit only, clearly audible, dry and tight, single isolated sound effect, no reverb, no music |
| duel.win | duel-win.mp3 | 2.5 | 0.75 | false | 2.20 | A short village brass band flourish, mellow warm and slightly ragged, with a brushed cymbal and one distant muffled firework, rounded and joyful, dry recording, ending cleanly, no blare, no long reverb tail |
| duel.lose | duel-lose.mp3 | 2.2 | 0.75 | false | 1.90 | A deflating tuba phrase of two falling notes played by one tired bandsman, warm mellow and comically resigned, rounded, dry recording, ending cleanly, no blare, no reverb tail |

> `duel-lose` is the one place the game is openly funny. It should raise a
> small laugh from the person who just lost, not rub it in. One tuba, two
> notes, done. If a take sounds dramatic, add *"pathetic"* and drop the
> duration to 1.8.

### 6.3 The pack opening — 8 files

The set piece, and worth your best hour. The visuals are already AAA: the pack
charges, shakes, splits down a lit seam, bursts, and five cards arc into a fan;
each card winds up, flips, gets a light sweep, a ring and a bloom — and for a
Legendary a white flash, sixteen particles and a screen shake. All of it
currently happens in total silence.

**The four rarity stings are one instrument climbing.** Their whole job is that
a player knows from the sound alone, before the card is even square on, whether
this is a good one — and the escalation is **pitch and richness, not volume**:

| rarity | what it is | length |
|---|---|---|
| Common | one low muted marimba tick | 0.35 s |
| Rare | one mid-range marimba + glass bell | 0.8 s |
| Epic | three bells rising + low brass swell | 1.6 s |
| Legendary | church bells + band + distant petard | 3.0 s |

| id | file | duration_seconds | prompt_influence | loop | trim_to | prompt |
|---|---|---|---|---|---|---|
| pack.tear | pack-tear.mp3 | 1.2 | 0.85 | false | - | A paper packet opened in one pull, muted tearing of thin paper, warm and rounded with no sharp crackle, dry, single isolated sound effect, clean foley recording, one continuous tear ending cleanly, no music |
| pack.flip | pack-flip.mp3 | 0.6 | 0.85 | false | 0.35 | A single card turned over and settling face up on a felt table, one rounded paper flutter and a muted tap, dry short and tight, single isolated sound effect, clean foley recording, no snap, no music |
| pack.dupe | pack-dupe.mp3 | 0.8 | 0.85 | false | 0.60 | A single flat muted card landing on a pile of cards, dull rounded and dead with no ring at all, deliberately anticlimactic, dry, single isolated sound effect, clean foley recording, no music |
| pack.tally | pack-tally.mp3 | 0.5 | 0.9 | false | 0.12 | A single close marimba note struck low, dry short and tight, one note only, clearly audible, single isolated sound effect, no reverb, no music |
| rar.komuni | rar-komuni.mp3 | 0.6 | 0.85 | false | 0.35 | A single low muted marimba note, dull plain and rounded with a short decay and no brightness, dry, single isolated sound effect, one note, no music |
| rar.rari | rar-rari.mp3 | 0.9 | 0.8 | false | 0.80 | A single warm mid-range marimba note doubled by one mellow glass bell, clear but rounded, with a short decay, dry, single isolated sound effect, one note, no melody, no music |
| rar.epiku | rar-epiku.mp3 | 1.8 | 0.75 | false | 1.60 | Three mellow bells rising in pitch, warm and glowing, over a low brass swell, rounded and never harsh, short, dry, no drums, no music bed |
| rar.leggendarju | rar-leggendarju.mp3 | 3.5 | 0.7 | false | 3.00 | A warm village festa celebration arriving, mellow church bells ringing a rising figure with a brass band swelling underneath and one distant muffled firework, joyful glowing and generous, warm and rounded, starting immediately and ending cleanly, dry recording, no crash, no blare, no long reverb tail |

> **The Legendary is the money shot** — one pack in sixteen, over a white flash
> and a screen shake. Generate it five or six times and keep the one that makes
> you grin. It is allowed to be *generous*; it is not allowed to be *harsh*,
> and it absolutely must not be *late*: it has to start on the frame the card
> squares up, so **the first sound must be at sample zero.** Trim the head
> ruthlessly. This is also the row most likely to come back as three separate
> flourishes — pick one and cut the others off.

### 6.4 Chess and dama — 5 files

These two games use no artwork at all — hand-drawn SVG and CSS discs. **Sound
is the only physicality they have**, which makes these five files punch far
above their weight. Real objects on a real board: wood for chess, terracotta
for dama, felt underneath both.

| id | file | duration_seconds | prompt_influence | loop | trim_to | prompt |
|---|---|---|---|---|---|---|
| piece.lift | piece-lift.mp3 | 0.5 | 0.9 | false | 0.12 | A small wooden piece lifted off a wooden board, one very short felt scuff, dull and rounded, dry and tight, single isolated sound effect, clean foley recording, no click, no reverb, no music |
| piece.place | piece-place.mp3 | 0.5 | 0.9 | false | 0.25 | A felt-bottomed wooden chess piece set down on a wooden board, one warm rounded knock, damped and satisfying with no sharp click, dry and punchy, single isolated sound effect, clean foley recording, single hit, no reverb, no music |
| piece.capture | piece-capture.mp3 | 0.7 | 0.85 | false | 0.50 | One wooden piece nudged aside by another and sliding off a board, a muted rounded knock then a short wooden slide, dry and tight, single isolated sound effect, clean foley recording, no clatter, no music |
| piece.king | piece-king.mp3 | 1.0 | 0.8 | false | - | A ceramic draughts piece stacked onto another with a rounded click, followed by one warm marimba note, dry and short, single isolated sound effect, clean foley recording, no music |
| board.check | board-check.mp3 | 1.0 | 0.8 | false | - | Two low warm knuckle knocks on a felt-covered wooden table, dull firm and rounded, close together, dry and tight, single isolated sound effect, clean foley recording, no reverb, no music |

### 6.5 SKARTA, IL-KIRI and the playing-card games — 4 files

These cover **three** games' worth of new material, because between them they
only introduce four physical actions the rest of the set does not already have:
throwing a card down, sweeping cards in, paying money, and rolling dice.

- **SKARTA** (`js/skarta.js` + `js/skarta-ui.js`) — `card-throw` to play,
  `card-sweep` when a player eats the chain, `duel-draw` to deal and to draw,
  `duel-shuffle` on refill, `ui-error` on an illegal play, `ui-toast` for
  *"Aħħar waħda!"* and for *"Qabadtek!"*, `duel-win` at the end.
- **IL-KIRI** (`js/kiri.js` + `js/kiri-ui.js`) — `dice-roll` every turn,
  `money-pay` for rent, tax, salary and buying, `ui-coin` for the toss that
  picks who starts, `ui-reward` on passing IL-BIDU, `ui-error` on bankruptcy.
- **Playing Cards** (`js/klabb.js` + `klabb-briscola.js`, `klabb-sette.js`) —
  every game in that drawer is `duel-shuffle` → `duel-draw` → `card-throw` →
  `card-sweep`, and it needs **nothing new at all**.

**Nothing extra to generate for any of the three.** If one of their screens
turns out to need a genuinely new sound, add it here then — do not guess now.

| id | file | duration_seconds | prompt_influence | loop | trim_to | prompt |
|---|---|---|---|---|---|---|
| card.throw | card-throw.mp3 | 0.6 | 0.85 | false | 0.40 | A card laid down firmly onto a pile of cards on a felt table, one rounded paper slap, confident but damped and warm, dry and punchy, single isolated sound effect, clean foley recording, no sharp crack, no music |
| card.sweep | card-sweep.mp3 | 1.0 | 0.85 | false | - | A pile of cards drawn across a felt table and gathered up in one movement, muted rounded paper rustle, warm, dry, single isolated sound effect, clean foley recording, no music |
| money.pay | money-pay.mp3 | 1.0 | 0.85 | false | - | A few coins set down one after another onto a felt-covered table, warm muted clinks with no bright ring, damped, dry, single isolated sound effect, clean foley recording, no jingle, no music |
| dice.roll | dice-roll.mp3 | 1.2 | 0.85 | false | - | Two wooden dice shaken briefly in a cupped hand and rolled across a felt table, muted tumbling that settles quickly, warm and rounded, dry, single isolated sound effect, clean foley recording, no clatter, no music |

### 6.6 Ambience loops — 2 files (optional, do last)

**Set `loop: true` and use `eleven_text_to_sound_v2`** for these two rows only.

⚠️ **Take these two as PCM, not MP3.** MP3 is not a gapless format: the encoder
pads the file with silence, which is why generated loops are widely reported to
"fade out at the end" and not loop seamlessly. Request **`output_format:
pcm_44100`** and convert yourself (§7).

**The game defends against this as well.** `js/sfx.js` sets `loopStart` and
`loopEnd` 60 ms inside each end of these two files, so the playhead never
crosses the encoder padding. Between the PCM master and that, the seam is
covered twice — but a genuinely gappy generation is still a gappy generation,
so audition the loop for a full minute before accepting it.

Both play very low under everything else (`sfx.js` mixes them at 22% and fades
them in over 1.2 s). They are texture, not content. **If a generated loop has
any identifiable event in it — one dog, one shout, one bang — throw it away.**
A recognisable event repeating every twelve seconds is a bug that sounds like
a haunting.

| id | file | duration_seconds | prompt_influence | loop | trim_to | prompt |
|---|---|---|---|---|---|---|
| amb.festa | amb-festa.mp3 | 12.0 | 0.5 | true | - | Distant outdoor village ambience on a warm evening, a faint muffled crowd far away, occasional very distant mellow brass band, cicadas, continuous and even throughout, seamless ambient bed, no distinct voices or words, no close sounds, no sudden events |
| amb.kazin | amb-kazin.mp3 | 12.0 | 0.5 | true | - | Interior ambience of a small old village bar, low muffled indistinct conversation in the background and a faint warm hum, occasional distant glass, continuous and even throughout, seamless ambient bed, no distinct words, no music, no sudden events |

> If these two eat your budget, **cut them.** They are the only two files here
> the game does not really benefit from, and they are nearly 40% of the payload.

---

## 7. POST-PROCESSING — DO NOT SKIP THIS

Raw output is stereo, contains **several takes separated by silence**, usually
opens with lead-in silence, and sits at an inconsistent level. All four are
problems, and the lead-in silence is the worst: it makes the sound arrive
**late**, which on a card flip reads as broken.

**The chain, in order:**

1. **Audition and keep take one.** Open the file, find where the first good
   take ends, note the time. This is a listening job, not a scripted one — no
   filter can tell a good take from a bad one.
2. **Cut to the first transient**, at a zero crossing.
3. **Short fade-out** at the end so the cut does not click.
4. **Normalise**, mono, encode.

Steps 2–4 are this one command:

```bash
# ./sfx.sh raw.wav audio/ui-tap.mp3 0.09
LEN="${3:-2}"
ffmpeg -v error -i "$1" \
  -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0:detection=peak,\
areverse,silenceremove=start_periods=1:start_threshold=-50dB:detection=peak,areverse,\
afade=t=out:st=$(awk "BEGIN{print $LEN-0.015}"):d=0.015,\
loudnorm=I=-20:TP=-3.0:LRA=9" \
  -t "$LEN" -ac 1 -ar 44100 -b:a 64k -y "$2"
```

- **`-t` is the `trim_to` column** — but treat it as a starting guess and
  correct it per file after step 1. Rows with `-` take the whole first take.
- **`loudnorm=I=-20:TP=-3.0`** is the set-wide loudness target. Do not vary it
  per sound — per-sound balance is done in `js/sfx.js` (`g:`), where it is
  instant and reversible. Changing it here is how a set drifts loud. The −3 dB
  ceiling (rather than the usual −1) is deliberate: `sfx.js` mixes up to eight
  voices at once and needs the headroom.
- Use **`-b:a 96k`** for the four stings (`rar-epiku`, `rar-leggendarju`,
  `duel-win`, `duel-lose`) — bells and brass at 64 kbps pick up an audible
  swirl.
- **Never run the trimming or the fade on the two `amb-*` loops.** It cuts the
  loop point off. For those, mono + level + encode only, at a lower target:
  ```bash
  ffmpeg -i amb.wav -af "loudnorm=I=-30:TP=-6.0" -ac 1 -ar 44100 -b:a 64k -y audio/amb-festa.mp3
  ```

Confirm the head is clean — the first sample should be the sound itself:

```bash
ffprobe -v error -show_entries format=duration,size -of default=nk=1:nw=1 audio/ui-tap.mp3
```

**Expect to layer two generations for the complex ones.** `rar-leggendarju` in
particular is usually better as a bell take and a band take mixed together than
as one generation that tried to do both.

---

## 8. QA — BEFORE YOU CALL IT DONE

- [ ] `du -ch audio/*.mp3 | tail -1` is **under 600K**.
- [ ] **Leading silence is 0 ms on every file.** The most common defect.
- [ ] No file still contains a second take of itself.
- [ ] Every filename matches its row **exactly** (lowercase, hyphens not dots,
      `.mp3`). A typo is silence, and silence is not an error, so nothing will
      warn you — you will simply wonder why one sound never plays.
- [ ] Listen on the **phone speaker**, phone in hand at arm's length.
- [ ] **Tap the same button twenty times fast.** If `ui-tap` starts to grate,
      it is too long, too bright or too loud. The most important test here.
- [ ] **Open ten packs in a row.** If you want to mute the game before the
      tenth, the reveal sounds are too long or the stings too hot.
- [ ] **Play one full game of chess.** Every move is `piece-lift` +
      `piece-place`. If that pair grates after twenty moves, lower their `g:`
      in `js/sfx.js` — do not regenerate.
- [ ] **Let an ambience loop run for a full minute** and listen for the seam.
- [ ] No single sound jumps out as louder than the rest. Fix with `g:`, not by
      re-levelling the file.
- [ ] Turn Sounds **off** in Settings and confirm the game is completely
      silent, including a full pack opening.
- [ ] Delete one file at random and confirm nothing breaks — it should just go
      quiet in that one place. Anything else is a bug worth reporting.

---

## 9. IF YOU WANT MORE LATER

Adding a sound is two lines and no risk:

1. Generate it, save as `audio/<something>.mp3`.
2. Add one line to `REG` at the top of `js/sfx.js`:
   `'my.id': { f: 'my-file.mp3', g: 0.5 },`  — start the gain **low**.
3. Call `KARTI_SFX.play('my.id')` where it belongs.

And if an existing sound would do for the new place, add it to `ALIAS` instead
and save a file. That is the rule that kept this document to 40 rows.
