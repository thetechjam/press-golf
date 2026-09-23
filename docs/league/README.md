# League rollout kit

Material for introducing Press to the Thursday league. Parked in September 2026,
after the season ended; the league starts again in mid-April 2027.

| File | What it is |
|---|---|
| `press-league-flyer.pdf` | Print-ready US Letter flyer (pro shop / league night) |
| `press-league-flyer.png` | The same flyer as an image, for texts and email |
| `flyer.html` | Source of the flyer — edit this, then re-export |
| `qr.svg` | QR code for https://pressgolf.netlify.app/, made with `src/qr.ts` |
| `make-qr.mjs` | Regenerates `qr.svg` (`node docs/league/make-qr.mjs`) |
| `email-to-league-director.md` | Draft email introducing the app to the league director |

## Before the season

1. **Get the new rule sheet** and check it against the app's league mode. The
   2025 sheet is what `src/games/league.ts` and `src/games/leagueHandicap.ts`
   implement: strokes off the foursome's low handicap (max 9 a match, one a
   hole), max score 9, X for a pick-up, the darkness rule after 5 holes, a team
   one short, and 70% / 90% handicaps.
2. **Update the flyer** — the year in the "Thursday League · 2025 Rules" line
   and any rule bullet that changed — and the email.
3. **Try it with your own foursome** for a night or two and check it matches
   the signed cards.
4. Send the email with the PDF, and ask the pro shop before putting the flyer
   up.

## Re-exporting the flyer

Open `flyer.html` in Chrome from this folder (it loads the font and logo from
`public/`), then Print → Save as PDF, paper size Letter, margins None,
background graphics on. For the PNG, screenshot the page at 2x.
