# KARTI — THE SOUND SET

Everything KARTI needs to make a noise: what each sound is, where it plays, how
long it runs, the exact filename it must be saved as, and the exact words to
paste into ElevenLabs to generate it.

**49 files. Under 600 KB for the lot.**

> **Second pass, §10.** Thirty-eight of these are generated and in `audio/`.
> §10 is the interaction audit that came after he had heard them — every tab,
> every settings row, every chess and dama move — and it adds **nine files**
> and **thirty-one reuses**. Read §10 before generating anything new; several
> of its "new sounds" are an existing file at a different playback rate and
> cost nothing at all.

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

**Measured, after the first 38 were generated and normalised:**

| Group | Files | Measured |
|---|---:|---:|
| First pass, on disk in `audio/` now | 38 | **331 KB** |
| Second pass (§10) | 9 | ~54 KB (estimate) |
| **Both passes** | **47** | **~385 KB** |
| Ambience loops, if you generate them | 2 | ~192 KB |
| **Everything** | **49** | **~577 KB** |

The first 38 came in a little over the estimate. That is fine, and the second
pass is deliberately small — but note what it does to the ambience decision:
**with §10 generated, the two `amb-*` loops no longer fit comfortably.** They
were always the first thing to cut (§6.6) and this is the moment. Cut them and
the whole set is **~385 KB**, comfortably inside budget.

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
| ui.sheet | ui-sheet.mp3 | 0.6 | 0.8 | false | 0.35 | A heavy wooden drawer pulled open and stopping against its stop, a low bodied wooden slide with a dull thud landing at the end, close and clearly audible, dark warm and rounded, dry and tight, single isolated sound effect, clean foley recording, no hiss, no rattle, no reverb, no music |
| ui.toggle | ui-toggle.mp3 | 0.5 | 0.9 | false | 0.14 | A heavy brass latch thrown on a thick wooden door, one deep solid clunk with the wood resonating dully underneath it, close and clearly audible, dark warm and rounded, dry and tight, single isolated sound effect, clean foley recording, no ring, no rattle, no hiss, no reverb, no music |
| ui.toast | ui-toast.mp3 | 0.7 | 0.8 | false | 0.45 | One single warm marimba note struck with a felt mallet, mellow and rounded with a short decay, dry, single isolated sound effect, one note only, no melody, no music bed |
| ui.error | ui-error.mp3 | 0.7 | 0.85 | false | 0.35 | A single close wooden thud, blunt dull and warm with no sharpness, a flat hand laid firmly on a wooden table, clearly audible, dry and tight, single isolated sound effect, clean foley recording, no buzzer, no alarm, no reverb, no music |
| ui.reward | ui-reward.mp3 | 1.2 | 0.8 | false | 0.70 | Two warm marimba notes rising with one mellow bell over them, rounded and pleasant, dry and short, clean foley recording, no fanfare, no music bed |
| ui.coin | ui-coin.mp3 | 1.5 | 0.85 | false | - | A coin flicked spinning into the air with a warm whir, then settling and rocking to rest on a felt-covered table, muted and rounded, dry, single isolated sound effect, no bright metallic ring, no music |

> `ui-error` is the most important sound here and the easiest to get wrong. It
> must sound like **"no"** — blunt, warm, over — not like a punishment. If a
> take sounds electronic or sharp, swap "thud" for "knock" and go again.

### 6.2 The duel — 13 files

| id | file | duration_seconds | prompt_influence | loop | trim_to | prompt |
|---|---|---|---|---|---|---|
| duel.start | duel-start.mp3 | 2.0 | 0.75 | false | 1.70 | A short mellow brass phrase of three rising notes played by a small village band, warm rounded and unhurried, dry recording, ending cleanly, no drums, no reverb tail, no blare |
| duel.draw | duel-draw.mp3 | 0.5 | 0.85 | false | 0.30 | A single card sliding off the top of a deck, muted paper friction, dry short and tight, single isolated sound effect, clean foley recording, one card only, no snap, no music |
| duel.shuffle | duel-shuffle.mp3 | 1.2 | 0.85 | false | 1.05 | A deck of cards riffle shuffled once and squared up on a felt table, muted rounded paper, dry and smooth, clean foley recording, no sharp riffle, no music |
| duel.summon | duel-summon.mp3 | 0.8 | 0.8 | false | 0.55 | A thick card laid down flat on a felt-covered wooden table, one rounded muted thump with a warm woody body, dry and punchy, single isolated sound effect, clean foley recording, no slap, no sharp attack, no reverb, no music |
| duel.boss | duel-boss.mp3 | 2.0 | 0.8 | false | 1.40 | Three low brass horns playing one long unison note together, the growl and rasp of the brass clearly present in the middle of the sound with a heavy dark weight underneath it, ominous and swelling then stopping, close-miked and dry, single isolated sound effect, no drums, no rumble, no reverb, no music bed |
| duel.attack | duel-attack.mp3 | 0.7 | 0.85 | false | 0.45 | A rounded whoosh of something heavy moving quickly through the air, warm and muted with a swell, dry and short, single isolated sound effect, no sharp edge, no impact at the end, no music |
| duel.hit | duel-hit.mp3 | 0.8 | 0.85 | false | 0.45 | A padded mallet striking a thick hardwood plank hard, the woody midrange knock of the plank leading clearly with a short dark thump behind it, firm and solid and damped, close-miked and dry and punchy, single isolated sound effect, no crack, no rumble, no reverb, no music |
| duel.destroy | duel-destroy.mp3 | 1.2 | 0.85 | false | 0.45 | A terracotta pot cracking and falling apart onto cloth, one muted dull break then scattering pieces, warm and rounded, dry, single isolated sound effect, no sharp smash, no reverb, no music |
| duel.spell | duel-spell.mp3 | 1.0 | 0.75 | false | 0.65 | A warm shimmer of marimba and glass notes rising, mellow and rounded with a short decay, dry, single isolated sound effect, no melody, no music bed |
| duel.trap | duel-trap.mp3 | 1.0 | 0.8 | false | 0.70 | A heavy wooden box lid slamming shut, a deep dull thud with real low weight arriving first and a short muted wooden snap on top of it, sudden and final and damped, dark and thick, close-miked and dry, single isolated sound effect, no metallic ring, no spring, no reverb, no music |
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
| pack.tear | pack-tear.mp3 | 1.2 | 0.85 | false | 1.15 | A paper packet opened in one pull, muted tearing of thin paper, warm and rounded with no sharp crackle, dry, single isolated sound effect, clean foley recording, one continuous tear ending cleanly, no music |
| pack.flip | pack-flip.mp3 | 0.6 | 0.85 | false | 0.35 | A single card turned over and settling face up on a felt table, one rounded paper flutter and a muted tap, dry short and tight, single isolated sound effect, clean foley recording, no snap, no music |
| pack.dupe | pack-dupe.mp3 | 0.8 | 0.85 | false | 0.60 | A single flat muted card landing on a pile of cards, dull rounded and dead with no ring at all, deliberately anticlimactic, dry, single isolated sound effect, clean foley recording, no music |
| pack.tally | pack-tally.mp3 | 0.5 | 0.9 | false | 0.12 | A single close marimba note struck low, dry short and tight, one note only, clearly audible, single isolated sound effect, no reverb, no music |
| rar.komuni | rar-komuni.mp3 | 0.6 | 0.85 | false | 0.35 | A single mid-range wooden marimba note struck once, the woody knock of the bar clearly present, plain and rounded and unremarkable with a short decay, close-miked and dry, single isolated sound effect, one note, no low boom, no reverb, no music |
| rar.rari | rar-rari.mp3 | 0.9 | 0.8 | false | 0.80 | Two bright glass bells struck together and ringing clearly in the upper middle, a warm wooden note underneath them, present and clearly audible, rounded not piercing, short decay, dry, single isolated sound effect, one note, no melody, no music |
| rar.epiku | rar-epiku.mp3 | 1.8 | 0.75 | false | 1.30 | Four bright glass bells struck in a rising figure, the bells leading the sound clearly and ringing out in the upper middle, with a warm brass swell filling in underneath them, glowing and generous and building, close-miked and dry, single isolated sound effect, no low boom, no drums, no reverb, no music bed |
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
| piece.king | piece-king.mp3 | 1.0 | 0.8 | false | 0.92 | A ceramic draughts piece stacked onto another with a rounded click, followed by one warm marimba note, dry and short, single isolated sound effect, clean foley recording, no music |
| board.check | board-check.mp3 | 1.0 | 0.8 | false | 0.70 | Two low warm knuckle knocks on a felt-covered wooden table, dull firm and rounded, close together, dry and tight, single isolated sound effect, clean foley recording, no reverb, no music |

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
| card.throw | card-throw.mp3 | 0.6 | 0.85 | false | 0.30 | A stiff playing card thrown down hard onto a pile of cards on a felt table, one firm full-bodied paper slap with a strong clear attack, warm and rounded but definite and close, close-miked and dry and punchy, single isolated sound effect, clean foley recording, no sharp crack, no reverb, no music |
| card.sweep | card-sweep.mp3 | 1.0 | 0.85 | false | 0.82 | A pile of cards drawn across a felt table and gathered up in one movement, muted rounded paper rustle, warm, dry, single isolated sound effect, clean foley recording, no music |
| money.pay | money-pay.mp3 | 1.2 | 0.85 | false | 0.70 | Heavy coins dropped from a hand into a shallow wooden bowl on a table, the dull wooden knock of the bowl arriving first with the coins settling into it, thick and warm and bottom-heavy, dark rounded clinks with no bright ring and no sparkle, close-miked and dry, single isolated sound effect, clean foley recording, no jingle, no cash register, no reverb, no music |
| dice.roll | dice-roll.mp3 | 1.2 | 0.85 | false | 0.85 | Two heavy wooden dice tumbling and landing on a thick wooden table, deep hollow knocks with real weight as they bounce twice and stop, warm dark low wood tone underneath, brief and settling quickly, close-miked and dry, single isolated sound effect, clean foley recording, no rattle, no clatter, no reverb, no music |

### 6.7 TOMBLA — 4 files (third pass)

Tombla asks for its own four because it borrows badly. A number call is a
wooden token out of a cloth bag, not a die; a counter pressed onto card stock
is drier than a piece on a felt board; and a rung going in a room full of
people is a crowd, not a bell.

The mark sound matters most: it happens **fifteen-plus times a game per player**
and it is the one the ear tires of first. It is the quietest thing in the whole
set by design.

| id | file | duration_seconds | prompt_influence | loop | trim_to | prompt |
|---|---|---|---|---|---|---|
| tombla.call | tombla-call.mp3 | 0.8 | 0.85 | false | 0.55 | A small wooden token drawn out of a cloth bag and set down firmly on a wooden table, one dry rounded knock with a brief cloth rustle before it, close and clearly audible, warm and dark, single isolated sound effect, clean foley recording, no rattle, no reverb, no music |
| tombla.mark | tombla-mark.mp3 | 0.5 | 0.9 | false | 0.16 | A small plastic counter pressed down onto stiff card, one short dry tick with a muted yielding paper give under it, close and clearly audible, dull and rounded, single isolated sound effect, clean foley recording, no click, no snap, no reverb, no music |
| tombla.near | tombla-near.mp3 | 1.4 | 0.75 | false | 0.58 | Two warm mellow marimba notes rising a step and held, unresolved and expectant, dark and rounded, close and clearly audible, single isolated sound effect, no percussion, no alarm, no reverb tail, no music bed |
| tombla.shout | tombla-shout.mp3 | 2.0 | 0.75 | false | 1.74 | A small indoor crowd of a dozen people reacting together in one warm swell of delight, a single mellow hand bell struck once through it, close and roomy but not a stadium, no words, no cheering chant, single isolated sound effect, no music |

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

---

# 10. SECOND PASS — THE INTERACTION AUDIT

> *"I want more sound. Make an agent audit every tab on screen, tabs and
> settings etc, addictive when playing and moving checkers and chess. All
> sound audit. And make it with ElevenLabs."*

He has now heard the first 38. This section is what came out of walking the
**actual code** — `index.html`, `game.js`, `chess.js`, `dama.js`, `skarta.js`,
`skarta-ui.js`, `party.js` — and listing every interaction that currently makes
**no noise at all** and should.

**It adds nine files.** It also adds **thirty-one reuses** and a pitched layer
that turns one file into a whole scale, so the number of *audible moments* in
KARTI roughly doubles for **~54 KB**. That ratio is the whole point of the
section, and §1 of this document is why: reuse is not a size saving dressed up
as a virtue, it is what makes a game sound like **one thing** rather than fifty.

## 10.1 The one idea this pass adds: an instrument

> *"Each tab could have its own subtly different note so the app feels like an
> instrument rather than one repeated click."*

Exactly right, and the cheap way to do it is **not five files**.

`ui-note.mp3` is **one low kalimba note**. `js/sfx.js` plays it at the playback
rate for a step of a **major pentatonic scale** — and a pentatonic has no wrong
note and no semitone clash, so however fast a player jabs at the bottom nav,
however long a dama jump chain runs, however hard they drag the volume slider,
the result is a **tune** and never a rattle.

One 5 KB file is therefore:

- **four bottom-nav tabs**, each with a fixed note, so a destination always
  sounds the same however you reached it and the note becomes a landmark;
- **every filter chip** in Collection and the deck builder — running along a
  filter row plays a scale;
- **the volume slider**, which now sounds the value as you drag it;
- **a dama multi-jump**, climbing one step per hop, so a four-jump sweep
  announces itself as a four-jump sweep;
- **the SKARTA chain**, climbing as it builds and **falling back down every
  step it climbed** when somebody swallows it;
- **the four suits** of a wild card, one note each.

Playback rate also shortens the sample as it raises it, which is the right way
round: the higher a cue sits, the more it needs to get out of the way.

## 10.2 THE AUDIT

`REUSE` = an existing file, no bytes. `RATE` = an existing file at a different
playback rate, no bytes. `NEW` = one of the nine in §10.3.
**AUTO** = already working with no edit to any other file — `js/sfx.js` derives
it from the DOM. **WIRE** = needs one line at the listed call site.

### Tabs, screens and navigation

| Interaction | Where | Sound | Kind | Status |
|---|---|---|---|---|
| Bottom-nav tab tapped | `index.html:1352-1377`, `game.js:3990-3993` | `ui.note` at a fixed step per `data-scr` + `ui.swipe` under it | **NEW** + RATE | AUTO |
| Collection tab | `#btn-coll` `data-scr="coll"` | note step 1 | RATE | AUTO |
| Inventory tab | `#btn-deck` `data-scr="deck"` | note step 2 | RATE | AUTO |
| Store tab | `#btn-packs` `data-scr="pack"` | note step 3 | RATE | AUTO |
| Guide tab | `#btn-tutor` `data-scr="tutor"` | note step 4 | RATE | AUTO |
| Any screen becoming visible | `game.js:654` toggles `.on` on `section.screen` | `ui.swipe` | **NEW** | AUTO — a `MutationObserver` per screen, so a back button, a menu tile and a restored session all sound too |
| Screen change that came from a tab | — | *one* sound, not two | — | AUTO — `DEDUPE_MS` drops the second |
| Back / close / cancel | `BACKISH` id and label test | `ui.back` | REUSE | AUTO (first pass) |
| Sheet / modal opening, closing | `#sheet`, `#modal` | `ui.sheet` / `ui.back` | REUSE | AUTO (first pass) |
| Party-games tile opening a game | `party.js:291` | `party.open` → `ui.sheet` | REUSE | AUTO (it is a `<button>`) |
| Rail scrolled past an item | `.chiprow`, `.decksel`, `.hand` | `rail.tick` → `pack.tally`, pitched up per tick | REUSE | AUTO, **off by default** — `autoWire({rails:true})` |

### Settings

| Interaction | Where | Sound | Kind | Status |
|---|---|---|---|---|
| A switch turning **ON** | `game.js:1016-1022` (Invites), `1031` (Reduce motion), `sfx.js` (Sounds) | `ui.toggle` + note rising | REUSE | AUTO |
| A switch turning **OFF** | same | **`ui.untoggle`** + note falling | **NEW** | AUTO |
| Telling on from off correctly | — | — | — | AUTO — a **capture-phase** listener reads the switch *before* it flips. Reduce motion re-renders the whole sheet and its old element keeps the stale state, so reading after the fact is right on one row and wrong on another. This was a real bug in the making. |
| Volume slider dragged | `sfx.js` `bindSettings` | `ui.note` at a step keyed to the **value** | **NEW** | AUTO (own file) |
| Volume slider released | same | `ui.tap` | REUSE | AUTO |
| Cloud save / Wipe save buttons | `game.js:1025`, `1036` | `ui.tap` | REUSE | AUTO |
| Wipe confirmed | `game.js:1046` | `ui.error` via the ⚠ toast | REUSE | AUTO |

### Chess — `js/chess.js`

| Interaction | Where | Sound | Kind | Status |
|---|---|---|---|---|
| Piece picked up | `tap()` **chess.js:877** | `boardPick('chess')` → `piece.lift` | REUSE | **WIRE** |
| Put back down unmoved | **chess.js:875, 893** | `boardCancel()` → `ui.back` at 0.4 | REUSE | **WIRE** |
| A move — the travel | **chess.js:942** (human), **969** (AI) | **`piece.slide`**, then `piece.place` 75 ms later | **NEW** | **WIRE** |
| A capture | same, `m.cap` | `piece.slide` → `piece.capture` | REUSE | **WIRE** |
| Castling | same, `m.fl & (F_CK\|F_CQ)` | `piece.place` **twice**, 150 ms apart — king then rook | REUSE | **WIRE** |
| Promotion | same, `m.promo` | `piece.king` + a three-note rise | REUSE | **WIRE** |
| Promotion picker opens | `promoPicker()` **chess.js:905** | `ui.sheet` | REUSE | AUTO |
| Check | `render()` **chess.js:764** | `board.check` | REUSE | **WIRE** |
| **Checkmate** | `status()` **chess.js:949 / 975**, `finish()` **1032** | **`board.mate`** — the king topples — then `duel.win`/`duel.lose` 560 ms later | **NEW** | **WIRE** |
| Stalemate / fifty-move / repetition | `finish()` **chess.js:1046** | `ui.toast` — a draw is not a loss | REUSE | **WIRE** |
| Illegal move ("nowhere to go") | **chess.js:888** | `ui.error` | REUSE | AUTO via the toast watcher |
| Resign | **chess.js:737** | `duel.lose` | REUSE | **WIRE** |
| Undo | `undo()` **chess.js:1004** | `ui.swipe` → `piece.place` pitched down | REUSE | **WIRE** |
| Takeback requested | `askTakeback()` **chess.js:1020** | `ui.toast` | REUSE | **WIRE** |
| Takeback accepted | **chess.js:1135** | `ui.toggle` + note | REUSE | **WIRE** |
| Takeback refused | same machinery | `ui.error` at 0.8 | REUSE | **WIRE** |
| Game start | `newGame()` **chess.js:682** | `duel.start` + `preloadFor('chess')` | REUSE | **WIRE** |
| Board square tapped (any) | `.pt-sq`, **chess.js:724** | **silence** | — | AUTO — `.pt-sq` is in the SKIP list so a chess move never also makes a UI tap |

### Dama — `js/dama.js`

Dama is **terracotta on wood**; chess is **felt-bottomed wood on wood**. Two
games, two materials, and after this pass you can tell which board is on the
table with your eyes shut. That is what he meant by *moving checkers*.

| Interaction | Where | Sound | Kind | Status |
|---|---|---|---|---|
| Disc picked up | `tap()` **dama.js:535** | `boardPick('dama')` → `piece.lift` at rate 0.94 | RATE | **WIRE** |
| Put back down unmoved | **dama.js:533, 544** | `boardCancel()` | REUSE | **WIRE** |
| A quiet step | `play()` **dama.js:591** (human), **617** (AI), `m.caps.length === 0` | **`dama.place`** | **NEW** | **WIRE** |
| **One hop of a jump** | `begin()` **dama.js:565**, `advance()` **dama.js:576** | **`dama.jump`**, rate **+7% per hop**, with a pentatonic note climbing under it | **NEW** | **WIRE** — call `boardChain(hop, total)` per hop |
| A chain of 3 or more completing | same | `ui.reward` 210 ms after the last hop | REUSE | **WIRE** |
| Crowning / king me | `applied()` **dama.js:181-187** `n.crowned` | `piece.king` + a three-note rise | REUSE | **WIRE** |
| "You must take" | `tap()` **dama.js:538**, rule at **169-172** | `ui.error` at **rate 0.92, gain 0.75** — a rule reminder, not a telling-off | RATE | AUTO via the toast watcher, better if wired |
| Blocked / wiped out / draw | `finish()` **dama.js:671** | `duel.win` / `duel.lose` / `ui.toast` | REUSE | **WIRE** |
| Resign | **dama.js:401** | `duel.lose` | REUSE | **WIRE** |
| Undo / takeback | **dama.js:647, 661** | as chess | REUSE | **WIRE** |
| Game start | `newGame()` **dama.js:355** | `duel.start` + `preloadFor('dama')` | REUSE | **WIRE** |

### SKARTA — `js/skarta.js`, `js/skarta-ui.js`

The engine is pure and **both the human and the AI go through it**, so one call
inside the engine covers every seat at the table.

| Interaction | Where | Sound | Kind | Status |
|---|---|---|---|---|
| A card played to the pile | `play()` **skarta.js:282** | `card.throw` | REUSE | **WIRE** |
| **+2 lands on the chain** | **skarta.js:322-323** | `duel.summon` + a note **one step higher per two cards** | REUSE | **WIRE** |
| **Kaxxa +4 / +7** | **skarta.js:330-341** | same, further up the scale — a +7 is audibly a +7 | REUSE | **WIRE** |
| **IL-LIMITU** — chain closed | **skarta.js:347-349** | `duel.trap` | REUSE | **WIRE** |
| **Eating the chain** | `takeChain()` **skarta.js:387-392** | `card.sweep` + the ladder **falling back down every step it climbed** | REUSE | **WIRE** |
| **AĦĦAR WAĦDA** | `sayAhhar()` **skarta.js:442-444**, button **skarta-ui.js:888** | **`call.bell`** — a counter bell, not speech | **NEW** | **WIRE** |
| **QABADTEK** | `catchOut()` **skarta.js:456-459**, button **skarta-ui.js:766-771** | `duel.trap`, then `ui.error` 150 ms later | REUSE | **WIRE** |
| Got away with it | `expireCall()` **skarta.js:464-469** | `ui.toast` at 0.6 | REUSE | **WIRE** |
| Skip | **skarta.js:308-312** | `duel.turn` + low note | REUSE | **WIRE** |
| Reverse | **skarta.js:314-319** | **`ui.swipe`** + note — direction you can hear | **NEW** | **WIRE** |
| Wild — suit chosen | `suitSheet()` **skarta-ui.js:924** | one note per suit, four suits four notes | RATE | **WIRE** |
| Draw one | `drawOne()` **skarta.js:414** | `duel.draw` | REUSE | **WIRE** |
| Deck reshuffled | `refill()` **skarta.js:364** | `duel.shuffle` | REUSE | **WIRE** |
| Illegal play | `play()` **skarta.js:275** | `ui.error` | REUSE | **WIRE** |
| Turn passes | `advance()` **skarta.js:257** | `duel.turn` | REUSE | **WIRE** |
| Game over | `finish()` **skarta.js:479** | `duel.win` / `duel.lose` | REUSE | **WIRE** |
| Pass-the-phone curtain ready | **skarta-ui.js:1031** | `ui.tap` | REUSE | AUTO |

### Collection, Inventory, Store

| Interaction | Where | Sound | Kind | Status |
|---|---|---|---|---|
| Filter chip tapped | `chipRow()` **game.js:1830-1838** | `ui.note` at the chip's **position in the row** | **NEW** | AUTO — `.chip` was removed from the SKIP list, which was the largest block of silent taps in the app |
| Pack set chip tapped | `renderSetPicker()` **game.js:1330** | same | RATE | AUTO — `.setchip` also came out of SKIP |
| Starter-deck card tapped | **game.js:1189** | same | RATE | AUTO — `.deckcard` also came out of SKIP |
| Pool / Deck pane switch | **game.js:2399** `[data-pane]` | same | RATE | AUTO |
| A card opened in Collection | **game.js:1892** `#coll-grid` | `card.open` → `pack.flip` | REUSE | AUTO — the cards channel lets `.card` through **only** inside `#scr-coll` and `#scr-deck`, never in a duel |
| **+** in the deck builder | `poolRow()` **game.js:2466** | `deck.add` → `duel.summon` | REUSE | AUTO — read off the `aria-label`, because the glyph is a **minus sign** and not a hyphen |
| **−** in the deck builder | **game.js:2461** | `deck.remove` → `duel.draw` | REUSE | AUTO |
| Deck saved | `saveDeck()` **game.js:2432** | `ui.reward` | REUSE | AUTO via the toast |
| Deck illegal | `deckIsLegal()` **game.js:491** | `ui.error` | REUSE | AUTO via the ⚠ toast |
| Deck made active | `deckOptions()` **game.js:2246** | `ui.tap` | REUSE | AUTO |
| Search typed | `#coll-search`, `#db-search` | **silence** — deliberate | — | a note per keystroke is the fastest way to get a game muted |

### The pack opening — now wired with no edits to `game.js`

The pack opener is timed to **animation frames**, not to events, so it cannot be
reached through `duelEvent()`. But it announces every beat of itself by putting
a class on an element, and `attributeOldValue` turns that into exact
transitions. One `MutationObserver` on `#scr-pack` therefore wires the whole
set piece.

| Interaction | Where | Sound | Kind | Status |
|---|---|---|---|---|
| **The pack charges and shakes** | `game.js:1567` adds `.charge` | **`pack.charge`** | **NEW** | AUTO |
| The seam splits | `game.js:1572` adds `.tearing` | `pack.tear` | REUSE | AUTO |
| A card flips face up | `game.js:1637` adds `.flipped` to `.slot` | `pack.flip` | REUSE | AUTO |
| ...and its rarity sting | the same `.slot` already carries `komuni`/`rari`/`epiku`/`leggendarju` | `rar.*`, 90 ms later | REUSE | AUTO |
| Duplicate card | `game.js` reveal | `pack.dupe` | REUSE | **WIRE** — the DOM does not say "duplicate" |
| Summary counting up | `game.js:1754` | `pack.tally` via `run()` | REUSE | **WIRE** |
| Coins spent | `tryOpen()` **game.js:1447** | `shop.buy` → `money.pay` | REUSE | **WIRE** |
| Not enough coins | **game.js:1449** | `ui.error` | REUSE | AUTO via the toast |

**`pack.charge` is the most important new file in this pass.** The pack charges
and shakes for **880 ms** before the seam goes and until now every millisecond
of it was silent — the payoff arrived with no build. Anticipation is what makes
an opening addictive; the tear is only the release. It is 10 KB.

## 10.3 THE NINE NEW PROMPTS

Same seven columns, same rules, same banned vocabulary (§4). Every prompt below
is written to §0: **character words, never level words**, and every one of them
names a **material**. Note that several also say *close*, *struck firmly* or
*clearly audible* — that is the other half of the lesson from the first pass.
Four of the first 38 came back at the noise floor from asking for something
"soft"; two more came back at the noise floor from describing something barely
there. **Aim at the narrow band between literal silence and harsh, on purpose.**

### 10.3.1 The instrument and the shared UI — 3 files

| id | file | duration_seconds | prompt_influence | loop | trim_to | prompt |
|---|---|---|---|---|---|---|
| ui.note | ui-note.mp3 | 0.5 | 0.9 | false | 0.30 | A single low kalimba tine plucked once with the thumb, warm woody and rounded with a clear mellow body and a short decay, plucked firmly and clearly audible, dry and tight, single isolated sound effect, one low note only, clean foley recording, no melody, no reverb, no music |
| ui.untoggle | ui-untoggle.mp3 | 0.5 | 0.9 | false | 0.16 | A heavy switch released and dropping back down, one blunt low wooden clunk with a damped body, struck firmly and clearly audible, darker and lower than a flick, dry and tight, single isolated sound effect, clean foley recording, no sharp snap, no click edge, no reverb, no music |
| ui.swipe | ui-swipe.mp3 | 0.5 | 0.85 | false | 0.22 | A stiff card sliding fast across a wooden table and stopping dead, one low bodied woody scrape with weight behind it, close and clearly audible, dark and rounded, dry and tight, single isolated sound effect, clean foley recording, no hiss, no air, no whoosh, no reverb, no music |

> **`ui-note` is the row to spend a take on.** Eight things in the app are this
> one file at a different rate, so a bad take is eight bad sounds. Keep it
> **low** — the rate layer only goes up, and a note generated too high has
> nowhere left to climb. If a take comes back bright or metallic, say
> *kalimba* and *woody* again rather than adding adjectives (§4).

### 10.3.2 Chess and dama — 4 files

| id | file | duration_seconds | prompt_influence | loop | trim_to | prompt |
|---|---|---|---|---|---|---|
| piece.slide | piece-slide.mp3 | 0.5 | 0.9 | false | 0.20 | A felt-bottomed wooden chess piece pushed a short distance across a wooden board, one warm rounded scrape with a woody body, close and clearly audible, dry and tight, single isolated sound effect, clean foley recording, no squeak, no click, no reverb, no music |
| board.mate | board-mate.mp3 | 1.5 | 0.85 | false | 0.30 | A tall wooden chess king toppled over and rolling to rest on a wooden board, one firm rounded knock then a short warm wooden roll that settles and stops, close and clearly audible, dry, single isolated sound effect, clean foley recording, no clatter, no reverb, no music |
| dama.place | dama-place.mp3 | 0.5 | 0.9 | false | 0.22 | A flat terracotta draughts disc set down firmly on a wooden board, one warm rounded clack with a short earthy body, damped and clearly audible, dry and punchy, single isolated sound effect, clean foley recording, no ring, no reverb, no music |
| dama.jump | dama-jump.mp3 | 0.6 | 0.85 | false | 0.30 | A terracotta draughts disc hopped over another and landing on a wooden board, one short skip through the air then a warm rounded clack, close and clearly audible, dry and punchy, single isolated sound effect, clean foley recording, no clatter, no reverb, no music |

> **Generate `dama-place` and `piece-place` back to back and listen to them one
> after the other.** If you cannot hear that one is terracotta and the other is
> wood, the pair has failed and the whole reason for the two files is gone.
> Say the material again; do not add adjectives.
>
> **`dama-jump` is heard the most in this group** and it is pitched **up 7% per
> hop** of a chain, so audition it at 1.0, 1.2 and 1.4 before accepting it. If
> it gets sharp on the way up it is too bright at 1.0.

### 10.3.3 SKARTA and the pack — 2 files

| id | file | duration_seconds | prompt_influence | loop | trim_to | prompt |
|---|---|---|---|---|---|---|
| call.bell | call-bell.mp3 | 1.0 | 0.85 | false | 0.60 | A heavy brass counter bell struck once with the flat of the hand, the dull thud of the hand landing on it first and a warm dark low ding blooming underneath, thick and round and full-bodied, mellow, decaying quickly, close-miked and dry, single isolated sound effect, one strike only, clean foley recording, no shrill top, no long ring, no reverb, no music |
| pack.charge | pack-charge.mp3 | 1.5 | 0.8 | false | 1.10 | A paper packet gripped tight and squeezed in both hands, a rising rounded paper crush and creak swelling for one second and stopping dead just before it opens, warm and close, clearly audible, dry, single isolated sound effect, clean foley recording, no tear, no crackle, no reverb, no music |

> **`pack-charge` must not tear.** It is the 880 ms of build *before*
> `pack-tear`, and the two play back to back. If a take ends with the packet
> actually opening you get two tears in a row and the build is wasted — say
> *stopping dead just before it opens* again and go once more.

### 10.3.4 Cost and size

| | |
|---|---:|
| New rows | **9** |
| Audio requested | **7.1 s** |
| **Credits** | **284** of the ~9,550 remaining — **3%** |
| Estimated size at 64 kbps mono | **~54 KB** |
| Whole set on disk after this pass | **~385 KB** (47 files, ambience cut) |

Prove the rows parse and cost what this says before spending anything:

```bash
python3 scripts/make_sfx.py --dry-run
```

## 10.4 WHAT IS ALREADY WORKING, AND WHAT NEEDS ONE LINE

`js/sfx.js` is done. Drop the nine files into `audio/` and everything marked
**AUTO** above starts working with **no edit to any other file** — tabs, screen
changes, settings switches on and off, filter chips, the deck builder's ±, the
Collection card taps and the entire pack ceremony including the rarity stings.

Everything marked **WIRE** genuinely needs game context that a click cannot
carry. These are the exact call sites, and each is one line:

**`js/chess.js`**

| Line | Add |
|---|---|
| 877 | `KARTI_SFX.boardPick('chess');` |
| 875, 893 | `KARTI_SFX.boardCancel();` |
| 942 (human), 969 (AI) | `KARTI_SFX.boardMove({ game:'chess', capture:!!m.cap, castle:!!(m.fl & (F_CK\|F_CQ)), promo:!!m.promo });` |
| 764 | `if (inCheck(st)) KARTI_SFX.boardCheck();` |
| 949, 975 | `if (s.end === 'mate') KARTI_SFX.boardEnd({ mate:true, win: s.win === G.human });` |
| 1032 `finish()` | `KARTI_SFX.boardEnd({ draw: s.win === null, win: s.win === G.human });` |
| 737 | `KARTI_SFX.play('board.resign');` |
| 1004 | `KARTI_SFX.takeback('undo');` |
| 1020 | `KARTI_SFX.takeback('ask');` |
| 1135 (accepted / refused) | `KARTI_SFX.takeback('ok');` / `KARTI_SFX.takeback('no');` |
| 682 `newGame()` | `KARTI_SFX.play('duel.start'); KARTI_SFX.preloadFor('chess');` |

**`js/dama.js`**

| Line | Add |
|---|---|
| 535 | `KARTI_SFX.boardPick('dama');` |
| 533, 544 | `KARTI_SFX.boardCancel();` |
| 565 `begin()` | `KARTI_SFX.boardChain(1);` |
| 576 `advance()` | `KARTI_SFX.boardChain(at, done.length ? at : 0);` — `at` is the hop number the chain is already tracking |
| 591 (human), 617 (AI) | `KARTI_SFX.boardMove({ game:'dama', capture:!!m.caps.length, hops:m.caps.length, crowned:G.st.crowned });` |
| 538 | `KARTI_SFX.boardIllegal({ forced:true });` |
| 671 `finish()` | `KARTI_SFX.boardEnd({ draw: s.win === null, win: s.win === G.human });` |
| 401 | `KARTI_SFX.play('board.resign');` |
| 647, 661 | `KARTI_SFX.takeback('undo');` / `KARTI_SFX.takeback('ask');` |
| 355 `newGame()` | `KARTI_SFX.play('duel.start'); KARTI_SFX.preloadFor('dama');` |

**`js/skarta.js`** — one dispatcher, `KARTI_SFX.skarta(type, info)`:

| Line | Add |
|---|---|
| 282 | `KARTI_SFX.skarta('play');` |
| 309, 311 | `KARTI_SFX.skarta('skip');` |
| 318 | `KARTI_SFX.skarta('reverse');` |
| 323 | `KARTI_SFX.skarta('chain', { n:S.chain.n });` |
| 331 | `KARTI_SFX.skarta('chain', { n:S.chain.n });` |
| 348 | `KARTI_SFX.skarta('shut');` |
| 364 | `KARTI_SFX.skarta('shuffle');` |
| 388 | `KARTI_SFX.skarta('eat', { n:n });` |
| 414 | `KARTI_SFX.skarta('draw');` |
| 442 | `KARTI_SFX.skarta('ahhar');` |
| 456 | `KARTI_SFX.skarta('caught');` |
| 466 | `KARTI_SFX.skarta('missed');` |
| 257 | `KARTI_SFX.skarta('turn');` |
| 275 | `KARTI_SFX.skarta('illegal');` |
| 479 | `KARTI_SFX.skarta('over', { win: winner === 0 });` |

**`js/skarta-ui.js`** — `925` (suit chosen): `KARTI_SFX.skarta('suit', { i:idx });`

**`js/game.js`** — the pack opener's two remaining beats and the purchase:
`1447` `KARTI_SFX.play('shop.buy')`, the duplicate branch of the reveal
`KARTI_SFX.play('pack.dupe')`, and `1754` `KARTI_SFX.run('pack.tally', n, 90)`.

Every one of these is safe to add in any order and safe to leave out. A call to
an id whose file is missing is **silence, not an error**, and if a real call
site and the delegated layer ever both fire for the same moment, `DEDUPE_MS`
drops the second and exactly one sound comes out.

## 10.5 QA FOR THIS PASS

On top of §8:

- [ ] **Tap the four tabs in order, then out of order.** It should sound like a
      tune either way. If any pair clashes, the note file is not what you think
      it is — regenerate `ui-note`, do not re-map the steps.
- [ ] **Turn one settings switch on and off ten times.** On and off must be
      audibly different, and neither may grate.
- [ ] **Drag the volume slider end to end.** A scale, not a machine gun.
- [ ] **Play one dama game and force a four-jump chain.** It must climb, and
      the fourth hop must not be sharp.
- [ ] **Play one chess game.** Every move is slide + knock. If that grates by
      move twenty, lower `piece.slide`'s `g:` — do not regenerate.
- [ ] **Open one pack.** Charge, tear, five flips, the stings. Nothing may be
      late, and nothing may double up.
- [ ] Run a filter row and a chip row: a scale, no repeats.
- [ ] `KARTI_SFX.diag()` — `registered` is **49**, `missing` is empty once all
      nine are in, and `auto` shows every channel.
- [ ] Delete all nine new files and confirm KARTI is exactly as it was.

---

# 11. FOURTH PASS — WIRING EVERY GAME, AND FOUR SOUNDS MEASURED WRONG

This pass wired the games that were still silent (the main duel, the story
ladder, SKARTA's chain, and the last gaps in chess and dama) and then **played
every one of them to a finish with a probe on `play()`**, counting what
actually came out of the speaker rather than what the source said it would.
Most of the findings were wiring. Four were the files themselves.

## 11.1 How to tell a thin sound from a soft one, with numbers

"It feels like air" is measurable, and it is the one complaint that cannot be
fixed with the `g:` column — turning up a sound with no body just gives you a
louder hiss. Two numbers, taken over the whole file with DC removed:

- **spectral centroid** — where the energy actually sits, in Hz.
- **share of energy below 400 Hz** — whether there is anything underneath it.

The calibration point is `ui-swipe`, because it is the one the owner picked out
unprompted. The take he objected to measured **4408 Hz / 2.8 %**. Rewritten for
body it measures **1542 Hz / 20.0 %** and the complaint went away. So:

| centroid | low share | verdict |
|---|---|---|
| under ~2500 Hz | over ~15 % | has a body, leave it alone |
| over ~3000 Hz | under ~5 % | it is air — **regenerate, do not re-level** |

Run it with `ffmpeg -i audio/<f>.mp3 -ac 1 -ar 22050 -f f32le -` into an FFT.
**Measure before rewriting.** Three files that "felt thin" measured fine and
were left alone; the four below did not.

## 11.2 The second measurement: THIS SHIPS ON A PHONE

The centroid test above finds sounds that are all air. It does not find the
opposite fault, and the opposite fault turned out to be worse.

**A phone speaker puts out almost nothing below about 500 Hz.** So a sound whose
energy is all underneath that is not "warm" on the target device — it is
missing. Measure every file twice: once flat, and once through a 12 dB/octave
roll-off below 500 Hz, which is a conservative model of a phone. The gap
between the two numbers is how much of that sound the handset throws away.

The result, across all 51 files:

| | flat | through a phone |
|---|---|---|
| spread, loudest to quietest | 23.3 dB | **29.5 dB** |

Thirty decibels between the loudest and the quietest thing in the mix is not a
set, it is a pile. And the ordering inverts — several files that measure among
the LOUDEST flat are among the quietest on a phone:

| id | flat | phone | thrown away | what it is |
|---|---|---|---|---|
| `duel.boss` | −14.4 | **−45.3** | 30.9 dB | the boss sting. The biggest moment in the game. |
| `duel.hit` | −13.9 | **−43.7** | 29.8 dB | taking damage, 9–12 times a duel |
| `rar.komuni` | −15.6 | **−33.8** | 18.2 dB | every common in every pack |
| `rar.epiku` | −17.6 | **−33.8** | 16.2 dB | every epic pull |

### The rarity ladder does not go up

This is the clearest single failure in the set, and it is exactly the thing
that is supposed to make opening a pack addictive:

| rung | phone level | |
|---|---|---|
| `rar.komuni` | −33.8 dB | |
| `rar.rari` | −28.6 dB | rises 5 dB ✓ |
| `rar.epiku` | **−33.8 dB** | **falls 5 dB ✗** |
| `rar.leggendarju` | −16.5 dB | jumps 17 dB |

**Pulling an EPIC currently sounds quieter than pulling a plain RARE.** Flat, it
is no better — `rar.komuni` is the loudest of the four, so on headphones the
commons boom hardest. The escalation does not exist on either device.

## 11.3 What was fixed in code, free, and what needs credits

**Six re-levelled in `js/sfx.js` — no credits, instant, reversible.** These are
files whose energy IS in the band a phone reproduces; they were simply set too
low. `g:` fixes those completely:

| id | g was | g now | phone dB was | now |
|---|---|---|---|---|
| `duel.turn` | 0.40 | 0.80 | −35.4 | −29.4 |
| `duel.draw` | 0.42 | 0.55 | −30.1 | −27.7 |
| `pack.flip` | 0.48 | 0.72 | −28.7 | −25.2 |
| `pack.charge` | 0.58 | 0.88 | −28.3 | −24.6 |
| `duel.summon` | 0.58 | 0.85 | −28.7 | −25.4 |
| `board.check` | 0.64 | 0.90 | −29.1 | −26.2 |

**Nine to regenerate — about 408 credits of the ~7000 left.** Every one of them
is beyond what `g:` can reach, for one of two opposite reasons.

*Too much air — high centroid, nothing underneath (the `ui-swipe` fault):*

| id | measured | why it is wrong |
|---|---|---|
| `money.pay` | 9399 Hz / 0.3 % | The airiest file in the set, more than twice as thin as the `ui-swipe` take that was rejected. It is money: buying a pack, paying rent in IL-KIRI, redeeming a mortgage. Coins have mass; this has none. |
| `dice.roll` | 6631 Hz / 0.1 % | Dice are wood on wood. There is no knock in this at all — the shake without the arrival. IL-KIRI's most repeated sound. |
| `call.bell` | 3029 Hz / 0.0 % | **Zero** energy below 400 Hz. It is AĦĦAR WAĦDA in SKARTA, the tensest moment in that game, and it rings without ever having been struck. |
| `duel.trap` | 3032 Hz / 1.8 % | A trap springing, IL-LIMITU closing a chain, QABADTEK. Every one is a gotcha, and a gotcha needs a thump under the snap. |

*All body, nothing a phone can reproduce — the opposite fault, and the one that
matters more because these are the big moments:*

| id | measured | why it is wrong |
|---|---|---|
| `duel.boss` | 58 Hz, loses 30.9 dB | The boss sting is inaudible on the target device. Raising `g:` only raises bass the speaker cannot move. |
| `duel.hit` | 58 Hz, loses 29.8 dB | Taking damage is the core feedback of a duel and it does not read on a phone. |
| `rar.komuni` | 175 Hz, loses 18.2 dB | Loudest of the four flat, joint-quietest on a phone. Breaks the ladder at both ends. |
| `rar.epiku` | 161 Hz, loses 16.2 dB | Makes an epic quieter than a rare. This is the payoff the whole pack ceremony builds to. |

*And one that is simply recorded ten decibels below the rest of the set:*

| id | measured | why it is wrong |
|---|---|---|
| `card.throw` | peak 0.30 vs 0.63 typical; **−35.4 dB, the quietest in the set** | It is the main event sound of **five** games — SKARTA (46 times in one hand) and all four playing-card games. Even at `g: 1.0` it cannot reach its band, so this one cannot be fixed in code at all. |

### The technique, in one line

Every rewritten row **names the thing a phone can reproduce FIRST and the body
second** — the bowl before the coins, the table before the dice, the hand before
the ding, the plank before the thump, the bells before the brass swell. That
inversion is what fixed `ui-swipe`, and it is the whole trick. The rows
themselves are rewritten in place in §6.1–§6.5 and §10.3.3; they are not
repeated here, because `scripts/make_sfx.py` parses this document as one sheet
and rejects a duplicate id.

To redo them (the key is held elsewhere — do not run this speculatively):

```
python3 scripts/make_sfx.py --dry-run --only money.pay,dice.roll,call.bell,duel.trap,duel.boss,duel.hit,rar.komuni,rar.epiku,card.throw --force
python3 scripts/make_sfx.py          --only money.pay,dice.roll,call.bell,duel.trap,duel.boss,duel.hit,rar.komuni,rar.epiku,card.throw --force
python3 scripts/trim_sfx.py
```

Then **re-measure before accepting**. Acceptance for the new takes:

- nothing over 3000 Hz centroid with under 5 % below 400 Hz (that is air);
- nothing losing more than ~10 dB through the phone filter (that is sub-bass);
- `rar.komuni < rar.rari < rar.epiku < rar.leggendarju` on the phone measure,
  monotonically. If the ladder does not climb, the take is wrong however nice
  it sounds on its own.

## 11.4 Twelve dead tails, fixed for nothing

`trim_to` was measured wrong — or never set — on twelve rows, and a dead tail is
the difference between snappy and sluggish. Measured as "the last moment the
file is still above −40 dB of its own peak":

| id | file is | sound ends at | dead | trim_to now |
|---|---|---|---|---|
| `board.mate` | 1.20 s | **0.24 s** | 0.96 s | 0.30 |
| `tombla.near` | 1.36 s | 0.54 s | 0.82 s | 0.58 |
| `duel.destroy` | 1.20 s | 0.41 s | 0.79 s | 0.45 |
| `ui.reward` | 1.20 s | 0.65 s | 0.55 s | 0.70 |
| `duel.spell` | 1.00 s | 0.61 s | 0.39 s | 0.65 |
| `duel.start` | 2.00 s | 1.64 s | 0.37 s | 1.70 |
| `board.check` | 1.00 s | 0.66 s | 0.34 s | 0.70 |
| `tombla.shout` | 2.00 s | 1.70 s | 0.30 s | 1.74 |
| `card.sweep` | 1.00 s | 0.78 s | 0.22 s | 0.82 |
| `duel.shuffle` | 1.20 s | 1.00 s | 0.20 s | 1.05 |
| `piece.king` | 1.00 s | 0.88 s | 0.12 s | 0.92 |
| `pack.tear` | 1.20 s | 1.11 s | 0.10 s | 1.15 |

`board.mate` had a `trim_to` of 1.20 against a sound that is over at 0.24 s —
the take simply has a second of silence in it. **These cost no credits at all:**

```
python3 scripts/trim_sfx.py        # idempotent, no API key needed
```

### And the two `after()` gaps that were timed against the wrong number

Sequencing must be measured against the SOUND, not the file. Two of mine were
not, and both were found by the table above:

- **`boardEnd` mate:** the victory sting waited 560 ms behind `board.mate`. The
  king finishes rolling at 240 ms, so there was a third of a second of silence
  in the middle of checkmate. Now 280 ms.
- **`DUEL.destroy` wipe stagger:** 110 ms between kills, against a pot that
  takes 410 ms to finish breaking — four monsters dying came out three-deep and
  read as mud. Now 170 ms, so a board wipe sounds like four things, not one.

## 11.4 QA for this pass

- [ ] Play a duel to a finish. Turn change and card draw must be **two beats**,
      not one — they used to land on the same millisecond.
- [ ] Tribute-summon a Level 7. It must sound bigger than a Level 3.
- [ ] Tap a bottom-nav tab. **One sound.** If you hear a whoosh behind the
      note, the nav claim in `js/sfx.js` has been broken again.
- [ ] Play a SKARTA hand with a +4 or +7 in it. The chain must climb as it
      grows and fall as somebody eats it.
- [ ] Undo a move in chess and in dama. It must sound, and it used to not —
      the button disables itself as it runs.
- [ ] Take a multi-jump in dama one tap at a time. **Every tap clacks.** They
      used to bank up silently and all fire at the end.
- [ ] Block `audio/` entirely and play a duel and a chess game. Zero errors,
      zero sound, no difference to the game.
- [ ] **One action, one sound.** Tap every control in every game and count.
      Two ids on one frame is the most amateur fault in a sound set and the
      40 ms dedupe cannot catch it, because it only collapses the SAME id.
- [ ] Re-measure the set after any regeneration and check the spread. It was
      23.3 dB flat / 29.5 dB through a phone before this pass. Anything that
      wide means something jumps out.
- [ ] Check the rarity ladder CLIMBS on the phone measure, komuni through
      leggendarju. It did not before this pass — epiku was quieter than rari.
