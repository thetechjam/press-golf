# Publishing the tutorial to YouTube

Everything needed to upload, and the fields to paste into each box. Written to
be followed top to bottom with YouTube Studio open in the other window.

The numbers here come from the cut that exists — chapter marks are derived from
`press-tutorial.srt`, not typed by hand. If the video is re-cut, re-derive them
before publishing rather than reusing what is below.

---

## 1. The assets

| Asset | Where | Notes |
|---|---|---|
| **Video** | [press-tutorial.mp4](https://d2ol7oe51mr4n9.cloudfront.net/user_3F6bhk8rFTvZgCk36sr2niTWDCv/eae6f4fc-8e77-4938-aba7-28bd72a1afd7.mp4) | 1920×1080, 5:39, 24MB, H.264/AAC |
| **Thumbnail** | `docs/video/thumbnail-settle-it-on-18.png` | 1280×720, 352KB — see §2 |
| **Alt thumbnail** | `docs/video/thumbnail-nobody-plays-free.png` | same spec, brand-voice headline |
| **Captions** | `docs/video/press-tutorial.srt` | 119 cues, English |
| **Script** | `docs/video/tutorial-script.md` | narration, for reference |

Download the video first — the link is a CDN copy, not a permanent home, and
YouTube needs a local file.

**Not included:** channel avatar and banner. Those are channel-level art, not
per-video, and this repo has never had them. `public/app-icon.svg` renders
cleanly at 800×800 if you want an avatar from the existing mark.

---

## 2. Which thumbnail

**Use `thumbnail-settle-it-on-18.png`.** Its second line reads
"SKINS · NASSAU · WOLF · VEGAS", and on a tutorial that is doing real work:
somebody scanning search results for "golf skins app" can see the formats
without reading the title.

`thumbnail-nobody-plays-free.png` is the stronger brand line and the better
choice if this ever becomes channel art or a trailer. For a how-to, naming the
games wins.

Both follow the brief in `tutorial-script.md`: felt green, the flag mark, a
phone showing the Board with money on it, gold Oswald, no face, no arrows, no
red circles.

⚠️ YouTube overlays the **duration badge** in the bottom-right corner. On both
thumbnails that lands on the lower part of the phone — skins rows, nothing
load-bearing. Nothing needs moving.

---

## 3. Title

Paste this:

```
Golf skins, Nassau and Wolf — all tracked from one phone | Press
```

62 characters, so it survives mobile truncation. The searchable words
("golf skins", "Nassau", "Wolf") are at the front, which is where they count.

Alternatives, if you want a different angle:

- `Track every golf side game from one phone — Press (free, no account)`
- `How to track skins, Nassau and Wolf on the course — Press walkthrough`
- `The free app that settles your golf bets on 18 — Press, full tour`

---

## 4. Description

Paste the whole block. The timestamps become chapters automatically **as long
as the first one is `0:00` and there are at least three** — both true here.

```
Press is a free web app for tracking golf side games — skins, Nassau, Wolf,
Vegas, Stableford, Quota, match play and a league format — from one phone. It
does the math while you play and settles the whole group into the fewest
payments at the end. No account, no app store, works with no signal, and
everything stays on your device.

▶️ pressgolf.netlify.app

0:00 What Press is
0:19 Adding players and handicaps
0:36 Loading a course, and checking the card
1:03 Picking your games
1:18 Every format, and net scoring
1:56 Setting the stakes
2:08 Scoring a hole
2:36 The live money ticker
2:48 Junk, Wolf and presses
3:07 The Board
3:28 The scorecard
3:39 Results and awards
3:57 Settling up
4:11 Sharing the result
4:20 Handing the round to another phone
4:59 Playing offline
5:24 Adding Press to your home screen

WHAT IT PLAYS
Stroke play · Match play (singles or two-man best ball) · Skins · Stableford ·
Wolf · Vegas · Quota · Nassau with presses · Thursday-night league format
Junk: greenies, sandies, barkies, arnies, chip-ins and polies

HOW IT WORKS
One phone keeps score for the group. Net scoring runs through every format,
off the stroke index. The money updates live as holes close out. At the end it
resolves everyone into the fewest payments that settle the group, and you can
hand the whole round to another phone with a QR code — nothing is uploaded and
no server ever sees it.

Press is free and has no ads. If it saves you an argument in the car park:
buymeacoffee.com/thetechjam
```

**Check before publishing:** the description says "no ads" and "free". Both are
still true — keep them accurate if that ever changes.

---

## 5. Tags

Paste as a comma-separated list into the Tags field (Studio → Show more):

```
golf, golf app, golf side games, skins game, nassau golf, wolf golf game, golf betting, golf scorecard app, stableford, golf quota game, vegas golf game, golf handicap, free golf app, golf with friends, golf tracker, press golf
```

Tags matter far less than the title and description for ranking — do not spend
long here.

---

## 6. Upload, step by step

1. **studio.youtube.com** → **Create** → **Upload videos**, and drop in the
   downloaded `press-tutorial.mp4`.

2. **Details**
   - **Title** — paste from §3.
   - **Description** — paste from §4.
   - **Thumbnail** — upload from §2. It only appears once processing is far
     enough along; if the button is greyed out, wait and come back.
   - **Playlist** — make one ("Press — how to") even for one video. It is the
     unit you add to later.
   - **Audience** — **"No, it's not made for kids."** This is a legal
     declaration under COPPA, not a preference, and getting it wrong is the one
     mistake on this page with consequences. This video is not directed at
     children.
   - **Age restriction** — no.

3. **Show more** — the fields that matter here:
   - **Paid promotion** — leave unticked. There is none.
   - **Tags** — paste from §5.
   - **Language** — English. **Caption certification** — "has not aired on TV".
   - **Recording date / location** — optional, skip.
   - **Category** — *Sports* is the better fit than *Science & Technology*;
     the audience you want is golfers, not developers.
   - **Comments** — leave on. This is a tool; questions are useful.
   - **⚠️ Altered or synthetic content** — see §7 before deciding.

4. **Video elements** — skip cards. Add an **end screen** only if you have
   another video to point at; on a channel's first upload it points nowhere.

5. **Checks** — copyright scan runs on its own. The narration and footage are
   original, so this should pass clean.

6. **Visibility** — **Public**, or **Schedule** it for a morning. If you want
   a chat window on release, **Premiere** works, but it is overkill for a
   tutorial nobody is waiting for.

7. **Publish.**

---

## 7. The synthetic-media disclosure ⚠️

YouTube asks whether the video contains *altered or synthetic content that
looks realistic*. This one needs a decision rather than a default, because the
answer is not obvious:

- **The footage is real.** Every frame is the actual app running in a real
  browser. Nothing is mocked up or generated.
- **The narration is not.** It is a synthetic voice (`seed_audio`, voice
  "Grady"). It does not imitate a real person and says nothing a real person
  did not write.

My reading is that this sits outside what the policy is aimed at — the
disclosure targets synthetic media that could mislead about real people or real
events, and a narrator reading a script about a golf app is neither. **But I am
not certain, YouTube's guidance here has changed more than once, and I would
not want you relying on my memory of it.** Read the current wording on the
disclosure screen itself before you answer.

**Recommendation: tick it anyway.** For a video on a non-sensitive topic the
label appears only in the expanded description, not as an overlay on the
player, so the cost is close to zero and it removes the question entirely.

---

## 8. Captions

The video has **captions burned into the picture** — a deliberate choice, so it
reads in a silent autoplay feed.

Upload `press-tutorial.srt` as well, under **Subtitles → Add language →
English → Upload file → With timing**. Two reasons: YouTube indexes caption
text for search, and an accurate track is better than the auto-generated one it
will otherwise produce.

⚠️ **The trade-off:** a viewer who turns CC on will see two sets of subtitles —
the burned-in ones and the uploaded track. There is no way to have both the
silent-feed legibility and a clean CC experience from a single file.

If that bothers you, say so and I will export a **clean master with no burned
captions** in about ten minutes. The pre-burn file (`joined.mp4`) is a step in
the existing pipeline, so it is a re-render, not a re-cut.

---

## 9. After publishing

- **Pin a comment** with the link: `pressgolf.netlify.app`. Descriptions get
  collapsed; pinned comments do not.
- **Check the chapters rendered.** They appear as segments on the progress bar
  within a few minutes. If they did not, the usual cause is the first timestamp
  not being exactly `0:00`.
- **Watch the first thirty seconds on a phone** before sharing it anywhere. It
  is the only way to catch a burned-in caption sitting under the YouTube
  control bar.
- **Listen to 5:24 onward.** Scene 17 speaks the URL, and it is the one line in
  the video a viewer has to hear correctly. It has never been confirmed by ear
  — see the note in `tutorial-script.md`.

---

## If the video is re-cut

Do not reuse the numbers above. Chapter marks and the runtime are derived from
`press-tutorial.srt`, and that file is re-timed against the assembled cut's own
segment durations. Re-derive both, then update §4 here and the description
block in `tutorial-script.md` together — they have drifted apart before.
