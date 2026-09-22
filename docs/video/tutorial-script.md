# Press — "How to use it" · YouTube tutorial script

The shooting script for the channel walkthrough. Every scene id here matches a
scene in `scripts/capture-tutorial.mjs`, and every screen described is the real
app driven in a real browser — nothing in this video is a mock-up, because a
tutorial that shows a button the app does not have is worse than no tutorial.

- **Runtime:** ~5:47
- **Footage:** 390×844 portrait, composited centre-frame on a felt-green 16:9
  canvas (`--green-900` `#0b3d2e`) with the scene title set in Oswald.
- **Voice:** one narrator, plain and quick. Brand voice: buddies-trip money
  games, nobody plays for free. Never "simply", never "just", never "seamless".
- **Captions:** burned, so it reads with the sound off.

Timings are targets for the voice generation — the footage is cut to the
narration, not the other way round.

The scene ranges above each block, the chapter marks in the description and the
runtime are all read back out of `press-tutorial.srt` rather than kept by hand.
They had drifted badly doing it the other way: this file claimed a 4:30 runtime
against captions that already ran to 5:17. Re-derive them after any re-voice
instead of editing them.

---

## 01 · Cold open — Home, first run (0:00–0:20)

*On screen: Press opens on an empty Home. The wordmark, "Track golf side games
— the fun way", Start New Round, Golf League, and "No rounds yet".*

> This is Press. One phone keeps score for the whole group — skins, Nassau,
> Wolf, the lot — and it does the math while you play. No account, no app
> store, nothing to install. Here's a full round in four minutes.

## 02 · Players (0:20–0:38)

*Start New Round. Four names typed in, a handicap beside each.*

> Start New Round, and type everyone in. Handicap goes in the box beside the
> name — that's what every net score in the round comes off. Press remembers
> your regular crew, so next week this is one tap.

## 03 · Course, and checking the card (0:38–1:05)

*The Course row opens. Course search, Pebble Beach tapped — and Holes & pars
opens itself on the load. The check note at the top of it, then the grid: every
par and every stroke index, editable, eighteen across.*

> Open Course. Search for it and Press pulls in the pars and the stroke
> indexes, or load one you saved earlier. Either way the card opens right here
> — and search data gets read before you see it, so anything that looks off is
> flagged. Check it against the real card once, then save it. Everything
> downstream — every stroke anybody gets — comes off these eighteen numbers.

## 04 · Games (1:05–1:21)

*The Games row opens. Game cards toggled on: Skins, Nassau, Stableford, Junk.
One ⓘ tapped, the rules text unfolds.*

> Games is where the money starts. Tap what you're playing. Every format
> carries its own rules behind the info button — so when somebody at the table
> has never played Wolf, you don't have to be the one who explains it.

## 05 · The formats (1:21–2:00)

*Scrolling the full game list, then the Scoring panel with Net/Gross and the
allowance selector.*

> The full list: stroke play, match play — singles or two-man best ball —
> skins, Stableford, Wolf, Vegas with the birdie flip, Quota, Nassau with
> presses, and a Thursday-night league format with A and B singles plus a
> combined team match. Net runs through all of it: one stroke per hole down the
> stroke index, a second one on the hardest holes when somebody's playing off
> more than eighteen. Set a game to gross to play it off the card, or cut the
> allowance the way the format asks.

## 06 · Money (2:00–2:14)

*The Money row opens. A stake typed against each game.*

> Money sets the stake per game. Five a skin, twenty on the Nassau. Leave it
> blank and you're playing for nothing — and you can change it mid-round from
> the Board.

## 07 · Scoring a hole (2:14–2:43)

*Start Round. The Hole tab: hole number, par, the progress dots, a row per
player. Scores tapped in on the chips.*

> Start Round, and this is where you live for the next four hours. Hole number,
> par, one row per player. Tap the score — par is the chip in the middle, and
> the dots beside a name are the strokes they're getting on this hole. The
> strip across the top is your eighteen; filled means done.

## 08 · The money ticker (2:43–2:54)

*The ticker above the hole updates as the last score lands.*

> The line at the top is the money, live, all round. Close out a hole and it
> tells you exactly what just changed hands, and who it came from.

## 09 · Junk, Wolf and presses (2:54–3:15)

*The junk panel opens; a greenie and a sandie claimed. Then the Wolf and Nassau
controls on a hole.*

> Greenies, sandies, barkies — claim them on the hole and they land on the
> card, priced. Wolf picks its partner right here before anybody's hit. Nassau
> presses too: take one by hand, or set it to press automatically when a side
> goes two down.

## 10 · The Board (3:15–3:36)

*The Board tab: money board, then a leaderboard per game.*

> The Board tab is every game at once — who's up in the match, who's holding
> skins, where the money actually sits. Somebody gave you the wrong handicap on
> the first tee? Fix it here and every board behind it recalculates.

## 11 · The card (3:36–3:46)

*The Card tab: the full scorecard grid.*

> Card is the whole scorecard, eighteen across. Tap a number to fix it, tap a
> hole to jump straight back to it.

## 12 · Results and awards (3:46–4:05)

*Finish Round. The Results screen: winner hero with confetti, then the awards.*

> Finish the round and Press settles it. Winner up top, then the superlatives —
> Shot of the Day, The Snowman, The ATM, Sandbagger — and each one cites the
> number it's based on, so the argument is short.

## 13 · Settling up (4:05–4:20)

*The Settlement block: the fewest payments that clear the group.*

> Then the bit that normally takes ten minutes in the car park. Press resolves
> the whole group into the fewest payments that settle it. Three people pay,
> not twelve.

## 14 · Sharing the result (4:20–4:29)

*The Share sheet: Results image, Scorecard image.*

> Share gives you the scoreboard as an image, or the full card as an image —
> both straight into the group chat.

## 15 · Handing the round over (4:29–5:08)

*The QR code in the share sheet, then the same round opening on a second phone
as "Sent to you" with a Keep it button.*

> And underneath, the round itself. The whole thing is packed into the link —
> point another phone's camera at the code and it opens in their copy of Press.
> Nothing is uploaded. No server ever sees it. On their phone it arrives held —
> sent to you, not saved — until they tap Keep it. Mid-round, the same link
> hands the card over and they carry on scoring from where you stopped. And if
> you both end up keeping score, Press puts the two cards side by side and asks
> which one is real, instead of picking one on a timestamp.

## 16 · Offline (5:08–5:34)

*The network is cut — genuinely, at the browser — and the app is reloaded and
driven again.*

> Which brings us to the thing that actually matters out on the course. Watch:
> I'm killing the network completely. Reload. Still there, still scoring. Every
> round, every saved course, every bit of history lives on your phone. That's
> the privacy story too — there's no account to make, and nothing to leak.

## 17 · Close (5:34–5:47)

*Home screen, the install hint at the bottom.*

> Add it to your home screen and it opens like anything else on your phone.
> It's free, it's at pressgolf.netlify.app, link's in the description.
>
> Now go take their money.

---

## Thumbnail

Felt-green ground (`#0b3d2e`), the Press flag mark, a phone showing the Board
tab with money on it, and three or four words of gold (`#e7b53c`) Oswald —
"NOBODY PLAYS FREE" or "SETTLE IT ON 18". No face, no arrows, no red circles.

## Description (draft)

> Press is a free web app for tracking golf side games — skins, Nassau, Wolf,
> Vegas, Stableford, Quota, match play and a league format — from one phone.
> It does the math while you play and settles the whole group into the fewest
> payments at the end. No account, no app store, works with no signal, and
> everything stays on your device.
>
> ▶️ pressgolf.netlify.app
>
> 0:00 What Press is
> 0:20 Adding players and handicaps
> 0:38 Loading a course, and checking the card
> 1:05 Picking your games
> 1:21 Every format, and net scoring
> 2:00 Setting the stakes
> 2:14 Scoring a hole
> 2:43 The live money ticker
> 2:54 Junk, Wolf and presses
> 3:15 The Board
> 3:36 The scorecard
> 3:46 Results and awards
> 4:05 Settling up
> 4:20 Sharing the result
> 4:29 Handing the round to another phone
> 5:08 Playing offline
> 5:34 Adding Press to your home screen

---

## The cut

**https://d2ol7oe51mr4n9.cloudfront.net/user_3F6bhk8rFTvZgCk36sr2niTWDCv/eae6f4fc-8e77-4938-aba7-28bd72a1afd7.mp4**

1920×1080, 5:39, 24MB, H.264/AAC, scene titles in Oswald, captions burned in.
Assembled 2026-09-22 from the eighteen takes, the seventeen gated narration
clips and `press-tutorial.srt`. Ready to upload; the description and chapter
marks are below.

This link is the only durable copy. Earlier cuts were assembled in a sandbox
that is discarded seconds after the command finishes, which is how a previous
version of this video came to exist nowhere at all — the one artifact the whole
pipeline is for was the one thing never saved. Re-export and re-link after any
re-cut.

Oswald is not installed in that sandbox and has to be fetched each time:

```
curl -sSL -o ~/.fonts/Oswald.ttf \
  'https://github.com/google/fonts/raw/main/ofl/oswald/Oswald%5Bwght%5D.ttf' && fc-cache -f
```

Skip it and `fc-match` falls back to Montserrat without complaining, which is
how the first cut of this video shipped in the wrong typeface.

## How the cut was made

The finished video is assembled from three things, and only one of them is
generated:

| Piece | Where it comes from |
|---|---|
| Every frame of app footage | `npm run capture:video` — Chromium driving the production build |
| The narration | Higgsfield `seed_audio`, voice "Grady", one clip per scene |
| The 1920×1080 canvas, titles, cuts | ffmpeg in the Higgsfield sandbox: the 780×1688 take composited centre-left on `--green-900`, scene title and gold rule on the right |
| Captions | Whisper times the narration; the cue **text** comes from this script, not the transcript |

One thing the table does not say, and it cost a re-cut: **the captions have to
be timed against the assembled file, not against a model of it.** They were
first laid out on narration lengths plus a beat between scenes, and the edit
does not work that way — segments butt together, and each is as long as
whichever is longer, its take or its clip. Several takes outrun their
narration, so every scene after them landed early; by the close the captions
were ten seconds ahead of the voice. Cut the segments first, read their real
durations back, then time the cues.

The check for it is cheap and worth keeping: pull eight-second slices out of
the finished file, transcribe them, and compare each against whichever cue the
SRT puts on screen over the same span. Spread the probes across the whole
runtime, because the failure is drift that accumulates — a single probe near
the start passes on a video that is badly out by the end.

And then **write the corrected file back to the repo.** The first time this was
fixed it was fixed in the sandbox, burned into the video, and left there: the
video was right and `press-tutorial.srt` in git was the uncorrected one, up to
ten seconds adrift from the audio it describes. A caption track is a separate
deliverable from the burned-in one — it is what gets uploaded alongside the
video — so it is not done until it is committed.

That last row is deliberate, and it hides the one defect this video shipped
with. Taking the cue text from the script means the captions are always right —
*including when the audio is wrong.*

### What "Smosh Cisco Ash Eye" actually was

Not a mispronunciation. `seed_audio` intermittently emits a burst of
hallucinated speech — a few seconds of fluent, confident nonsense dropped into
an otherwise correct read. Measured by regenerating one line five times:

| take | duration | transcript |
|---|---|---|
| old wording | 18.2s | `and restom, and exciled, dumb M'flann.` then the line, clean |
| new, 1st | 21.1s | line, then `HubExibo slash rontd stock.` mid-sentence |
| new, 2nd | 14.4s | clean |
| new, 3rd | 23.3s | `Sprada Filonsad. When fear lies as a green whoop until to the stand…` |
| new, 4th | 15.0s | clean |

Two in five. And note what the old wording did: it read "the little i"
correctly — Whisper heard "the little **eye**", which is how the letter is
said — and put its garbage somewhere else entirely. The thing that got blamed
was never the problem.

Three consequences worth keeping:

**A burst inflates the clip.** Clean takes of that line run 14.4–15.0s; the
ones carrying a burst ran 18.2s and 23.3s. So a `target` measured off a bad
clip is padded with nonsense, and the take is cut to cover it. Scene 04's old
target was 18.0s against a clean 15.0s — three seconds of footage recorded to
sit under gibberish.

**Captions cannot show it.** The cue text comes from this file, so a burst
plays under a caption that reads perfectly. That is why it survived to the
finished video and why watching it back is the only thing that found it.

**So the gate is the transcript, and it runs both ways.** Transcribe every
take. A word the script does not contain is a reshoot; a word the script *does*
contain and the take does not is also a reshoot. `faster-whisper` on `small.en`
is enough — none of this is subtle once you look.

### The other three things it catches

Running all seventeen clips through that gate turned up three more failure
modes, none of which is a burst:

**The voice reads an em dash aloud, as the word "slash".** Scenes 05, 07 and 15
came back saying "match play *slash* singles or two-man best ball *slash*
skins". It is intermittent — eleven other clips with em dashes were fine — and
it is expensive: scene 05 was 39.8s with the dashes spoken and **24.8s
without**. Fifteen seconds of that clip was punctuation.

The fix is not to reroll until it behaves. An em dash is a mark for the eye, so
it comes out of the *prompt* and stays in the *caption*. The prompt for a
reshot scene replaces `—` with a comma or a full stop, whichever the sentence
wants; the script file below is unchanged, and the captions still read as
written. Removing them fixed all three on the first retake.

**It mispronounces a word it does not know.** "Stableford" came back as
"Stablefoot", roughly one take in three. Respelling it ("Stable ford") made it
worse — "stable forward" — so the answer was to reroll until the transcript
said "stableford", which took three.

**It drops a word.** One take of scene 05 read "one stroke per hole down the
*index*" where the script says "down the *stroke index*". Nothing stray, so
set-difference alone called it clean. That is why the gate checks both
directions.

### Two things the gate flags that are not defects

Both are the transcriber's doing, not the voice's, and the gate allows them:

- **A URL or possessive splitting up.** "pressgolf.netlify.app" comes back as
  "pressgolf.net littify.ap", and "link's" as "links". Every piece is a
  substring of a word the script has, which is the test.
- **A homophone.** "per whole" for "per hole", "goes too down" for "two down".
  Right in the audio, wrong only in the transcript — a real word in the
  script's own sentence, which a burst never is.

For the record, "goes too down" for "two down" and "per whole" for "per hole"
*are* the harmless kind: homophones, right in the audio and wrong only in the
transcript. Telling the two apart is what the set-difference does — a homophone
is a real word in the script's own sentence; a burst is not.

### Why the line still changed

"the info button" over "the little i" is now a clarity fix rather than a
pronunciation one. Said aloud, a bare "i" is "eye", so "behind the little eye"
is what a viewer hears, and there is no eye on screen. The button is the
thing; name it.

### Scene lengths

Each take is recorded to the length of the line it carries: `scripts/capture-tutorial.mjs`
holds a `target` per scene, measured from the generated narration, and keeps the
screen moving until the take covers it. Without that the editor is left holding a
frozen frame — on the worst scene, fourteen seconds of still image under half the
narration. Re-record after changing the script, and update the targets from the
new clip lengths; a take that is short by more than about a second shows.

### The clips that exist

All seventeen, generated 2026-09-17, voice Grady
(`e2a2d2e6-9ed2-59cd-82af-feaa27f8a678`), `seed_audio`, default rate. Every one
passed the two-way transcript gate. † marks a clip whose prompt has the em
dashes taken out; the caption text is unchanged.

| scene | length | job |
|---|---|---|
| 01 | 19.36s | `2a64d4cf-df05-40a4-95ce-d924362f241e` |
| 02 † | 16.88s | `f4e597cc-7069-4d00-8ec6-d4d2407db02a` |
| 03 | 26.10s | `d446e57d-0b56-4c59-b0c4-92c1b3d4c25d` |
| 04 | 14.96s | `4ec03bce-2732-4ad7-acef-87cedb1f59c3` |
| 05 † | 38.20s | `51628f9f-49ff-420e-93ba-a59adabb7883` |
| 06 | 12.68s | `79e7007d-ba35-4c21-a5d1-b4a451f1051d` |
| 07 † | 27.87s | `2579ede3-b49f-46d5-88c3-fa707daebe75` |
| 08 | 10.72s | `10a5841b-7e5d-41b9-a88d-1ea8f4a098c8` |
| 09 | 19.00s | `f4f28305-5192-450e-8656-633dafe1e204` |
| 10 | 21.10s | `1f333780-8d28-4afc-9e35-0ecb50d1ff75` |
| 11 |  8.94s | `6f26d830-364c-4f49-a4dd-79f92625fdd8` |
| 12 | 17.29s | `39520ce8-ac17-4b57-b594-a8f4fd991203` |
| 13 | 15.30s | `08a3bb72-9203-4914-ae42-165b56b2584d` |
| 14 |  7.57s | `0a356a5d-d5bb-4dfe-ad49-b372ffea5f7e` |
| 15 † | 38.20s | `1b72be73-4807-4352-af59-cc35630c13e2` |
| 16 | 25.28s | `371dcaad-6514-4e5d-9580-9dd88f41b88e` |
| 17 | 14.97s | `7f17c14b-7da9-4290-bda2-1828026f482a` |

334.4s of narration. With a 0.9s beat between scenes the cut runs 5:47.

**One clip worth an ear:** scene 17 says the URL, and both the takes of it
transcribe with the domain broken up ("pressgolf.net littify.ap", then
"pressgolf.netify.app"). Every phoneme maps to the real address and the gate
allows it as a split token, but the URL is the one thing in the video a viewer
has to get right, so listen to it before publishing rather than trusting the
transcript here.

Scene 15 is one clip across two takes: `15-qr` runs to 15.96s of it, where the
round stops being a code and starts arriving on the other phone, and
`16-arrival` carries the rest.

### Files

- `docs/video/tutorial-script.md` — this file; the narration is the source of truth
- `docs/video/press-tutorial.srt` — captions for the YouTube upload. Derived:
  the words come from this file, the times from the narration's own word
  positions. Scenes 03, 04 and 14 are timed off clips that exist and were
  checked; everything after them is shifted by what those scenes measured.
- `scripts/capture-tutorial.mjs` — the recorder; `video-out/` is gitignored
