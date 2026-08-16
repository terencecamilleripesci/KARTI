# RECORDING THE MALTESE CALLER

The English calls are generated and already work. **They are a placeholder.**
This sheet is for replacing them with real Maltese voices, which is the plan:
a machine cannot say *tnejn* or *erbgħin*, and a person can.

You do not have to do all ninety. **Record any number and it replaces that one**
— the rest carry on in English. There is no half-finished state to avoid.

---

## HOW TO RECORD

- **Anything that records is fine.** A phone voice memo in a quiet room beats a
  microphone in a room with a fridge running. The processing handles format,
  level and trimming.
- **One file per number.** Say it once, cleanly, and stop.
- Leave a moment of silence at each end — it gets trimmed automatically.
- **Say it the way you would in a każin**, not the way you would read a form.
  This is the voice of the game; a flat reading is worse than the English.
- Keep the pace even across the whole set. Ninety calls in one sitting, one
  person, one room, one distance from the phone — a caller who changes halfway
  through is the thing people notice.

**What to say:** the Maltese, then the English. That is how it is really done —
*"dawn ikunu annunzjati kemm bil-Malti kif ukoll bl-Ingliż"*, and half the room
is listening for one and half for the other.

## HOW TO GET THEM IN

Drop the files anywhere in one folder, named by number — `61.m4a`, `61.wav`,
`call-61.mp3`, all understood — then:

```bash
python3 scripts/import_calls.py ~/my-recordings
```

It converts, strips the silence, evens out the loudness so no number is louder
than the rest, encodes to the same size budget as everything else, and puts
each one in place. The English version of that number is replaced. Run it again
whenever you record more.

`--dry-run` first if you want to see what it would do.

---

## THE NINETY

`say` is what to read. The nickname column is what appears on screen — say it
too if it has one and it feels natural.

| n | file | Maltese | English | on screen |
|---|---|---|---|---|
| 1 | `call-1.mp3` | **wieħed** | Number one | — |
| 2 | `call-2.mp3` | **tnejn** | Number two | — |
| 3 | `call-3.mp3` | **tlieta** | Number three | — |
| 4 | `call-4.mp3` | **erbgħa** | Number four | — |
| 5 | `call-5.mp3` | **ħamsa** | Number five | — |
| 6 | `call-6.mp3` | **sitta** | Number six | — |
| 7 | `call-7.mp3` | **sebgħa** | Number seven | — |
| 8 | `call-8.mp3` | **tmienja** | Number eight | — |
| 9 | `call-9.mp3` | **disgħa** | Number nine | — |
| 10 | `call-10.mp3` | **għaxra** | one and oh | — |
| 11 | `call-11.mp3` | **ħdax** | one and one | — |
| 12 | `call-12.mp3` | **tnax** | one and two | — |
| 13 | `call-13.mp3` | **tlettax** | one and three | — |
| 14 | `call-14.mp3` | **erbatax** | one and four | — |
| 15 | `call-15.mp3` | **ħmistax** | one and five | — |
| 16 | `call-16.mp3` | **sittax** | one and six | — |
| 17 | `call-17.mp3` | **sbatax** | one and seven | — |
| 18 | `call-18.mp3` | **tmintax** | one and eight | — |
| 19 | `call-19.mp3` | **dsatax** | one and nine | — |
| 20 | `call-20.mp3` | **għoxrin** | two and oh | — |
| 21 | `call-21.mp3` | **wieħed u għoxrin** | two and one | — |
| 22 | `call-22.mp3` | **tnejn u għoxrin** | two and two | — |
| 23 | `call-23.mp3` | **tlieta u għoxrin** | two and three | — |
| 24 | `call-24.mp3` | **erbgħa u għoxrin** | two and four | — |
| 25 | `call-25.mp3` | **ħamsa u għoxrin** | two and five | — |
| 26 | `call-26.mp3` | **sitta u għoxrin** | two and six | — |
| 27 | `call-27.mp3` | **sebgħa u għoxrin** | two and seven | — |
| 28 | `call-28.mp3` | **tmienja u għoxrin** | two and eight | — |
| 29 | `call-29.mp3` | **disgħa u għoxrin** | two and nine | — |
| 30 | `call-30.mp3` | **tletin** | three and oh | — |
| 31 | `call-31.mp3` | **wieħed u tletin** | three and one | — |
| 32 | `call-32.mp3` | **tnejn u tletin** | three and two | — |
| 33 | `call-33.mp3` | **tlieta u tletin** | three and three | — |
| 34 | `call-34.mp3` | **erbgħa u tletin** | three and four | — |
| 35 | `call-35.mp3` | **ħamsa u tletin** | three and five | — |
| 36 | `call-36.mp3` | **sitta u tletin** | three and six | — |
| 37 | `call-37.mp3` | **sebgħa u tletin** | three and seven | — |
| 38 | `call-38.mp3` | **tmienja u tletin** | three and eight | — |
| 39 | `call-39.mp3` | **disgħa u tletin** | three and nine | — |
| 40 | `call-40.mp3` | **erbgħin** | four and oh | — |
| 41 | `call-41.mp3` | **wieħed u erbgħin** | four and one | — |
| 42 | `call-42.mp3` | **tnejn u erbgħin** | four and two | — |
| 43 | `call-43.mp3` | **tlieta u erbgħin** | four and three | — |
| 44 | `call-44.mp3` | **erbgħa u erbgħin** | four and four | — |
| 45 | `call-45.mp3` | **ħamsa u erbgħin** | four and five | — |
| 46 | `call-46.mp3` | **sitta u erbgħin** | four and six | — |
| 47 | `call-47.mp3` | **sebgħa u erbgħin** | four and seven | — |
| 48 | `call-48.mp3` | **tmienja u erbgħin** | four and eight | — |
| 49 | `call-49.mp3` | **disgħa u erbgħin** | four and nine | — |
| 50 | `call-50.mp3` | **ħamsin** | five and oh | — |
| 51 | `call-51.mp3` | **wieħed u ħamsin** | five and one | — |
| 52 | `call-52.mp3` | **tnejn u ħamsin** | five and two | — |
| 53 | `call-53.mp3` | **tlieta u ħamsin** | five and three | — |
| 54 | `call-54.mp3` | **erbgħa u ħamsin** | five and four | — |
| 55 | `call-55.mp3` | **ħamsa u ħamsin** | five and five | — |
| 56 | `call-56.mp3` | **sitta u ħamsin** | five and six | — |
| 57 | `call-57.mp3` | **sebgħa u ħamsin** | five and seven | — |
| 58 | `call-58.mp3` | **tmienja u ħamsin** | five and eight | — |
| 59 | `call-59.mp3` | **disgħa u ħamsin** | five and nine | — |
| 60 | `call-60.mp3` | **sittin** | six and oh | — |
| 61 | `call-61.mp3` | **wieħed u sittin** | six and one | — |
| 62 | `call-62.mp3` | **tnejn u sittin** | six and two | — |
| 63 | `call-63.mp3` | **tlieta u sittin** | six and three | — |
| 64 | `call-64.mp3` | **erbgħa u sittin** | six and four | — |
| 65 | `call-65.mp3` | **ħamsa u sittin** | six and five | — |
| 66 | `call-66.mp3` | **sitta u sittin** | six and six | — |
| 67 | `call-67.mp3` | **sebgħa u sittin** | six and seven | — |
| 68 | `call-68.mp3` | **tmienja u sittin** | six and eight | — |
| 69 | `call-69.mp3` | **disgħa u sittin** | six and nine | — |
| 70 | `call-70.mp3` | **sebgħin** | seven and oh | — |
| 71 | `call-71.mp3` | **wieħed u sebgħin** | seven and one | — |
| 72 | `call-72.mp3` | **tnejn u sebgħin** | seven and two | — |
| 73 | `call-73.mp3` | **tlieta u sebgħin** | seven and three | — |
| 74 | `call-74.mp3` | **erbgħa u sebgħin** | seven and four | — |
| 75 | `call-75.mp3` | **ħamsa u sebgħin** | seven and five | — |
| 76 | `call-76.mp3` | **sitta u sebgħin** | seven and six | — |
| 77 | `call-77.mp3` | **sebgħa u sebgħin** | seven and seven | — |
| 78 | `call-78.mp3` | **tmienja u sebgħin** | seven and eight | — |
| 79 | `call-79.mp3` | **disgħa u sebgħin** | seven and nine | — |
| 80 | `call-80.mp3` | **tmenin** | eight and oh | — |
| 81 | `call-81.mp3` | **wieħed u tmenin** | eight and one | — |
| 82 | `call-82.mp3` | **tnejn u tmenin** | eight and two | — |
| 83 | `call-83.mp3` | **tlieta u tmenin** | eight and three | — |
| 84 | `call-84.mp3` | **erbgħa u tmenin** | eight and four | — |
| 85 | `call-85.mp3` | **ħamsa u tmenin** | eight and five | — |
| 86 | `call-86.mp3` | **sitta u tmenin** | eight and six | — |
| 87 | `call-87.mp3` | **sebgħa u tmenin** | eight and seven | — |
| 88 | `call-88.mp3` | **tmienja u tmenin** | eight and eight | — |
| 89 | `call-89.mp3` | **disgħa u tmenin** | eight and nine | — |
| 90 | `call-90.mp3` | **disgħin** | nine and oh | — |

---

## THE SEVEN SHOUTS

These matter more than any single number — they are the loudest moment in the
game. The generated ones are usable because they are Italian-derived and carry
no `ħ` or `għ`, but a real voice will be better.

| file | say |
|---|---|
| `shout-ambo.mp3` | **Ambo!** |
| `shout-terna.mp3` | **Terna!** |
| `shout-kwaterna.mp3` | **Kwaterna!** |
| `shout-cinkwina.mp3` | **Ċinkwina!** |
| `shout-tombla.mp3` | **Tombla!** |
| `shout-vers.mp3` | **Vers!** |
| `shout-fatta.mp3` | **Fatta!** |

Shout them. They are a shout.

---

## A NOTE ON WHO RECORDS

One voice for all ninety is the safe choice. But a każin does not have one
voice, and if you wanted to record a few different people — one per prize
shout, say, or a nanna doing the nineties — that would be better than safe.
Tell me and I will make the import handle it.