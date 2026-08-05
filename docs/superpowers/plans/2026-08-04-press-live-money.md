# Press Live Money + Play-Screen Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bet money visible during the round instead of only at Results, and fix six measured defects on the Play screen.

**Architecture:** Play grows from two tabs to three (`Hole | Board | Card`). The Hole tab becomes scoring-only and fits one viewport; the Board tab absorbs the four live leaderboards plus a new money panel. Every new value is a pure function of an existing `Round` — no scoring engine is modified, and nothing new is persisted beyond `options.stakes`, which already exists in the type and in `localStorage`.

**Tech Stack:** Vite 8 + React 19 + TypeScript 6, Vitest 4 (node environment), oxlint, plain CSS with custom properties. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-04-press-live-money-design.md`

## Global Constraints

- **No new dependencies.** `package.json` gains nothing. If a task seems to need a library, it is the wrong task.
- **No DOM test environment.** `vite.config.ts` sets `environment: 'node'` and `include: ['src/**/*.test.ts']`. Only `.ts` files are collected, and there is no jsdom or testing-library. Do **not** add one. Pure logic gets Vitest; UI, layout, and contrast get browser measurement steps, which this plan supplies verbatim.
- **No scoring engine is modified.** `strokePlay.ts`, `matchPlay.ts`, `skins.ts`, `stableford.ts`, `wolf.ts`, `nassau.ts`, `settlement.ts`, `handicap.ts`, `util.ts` are read-only for this plan. `src/games/money.ts` is new and layers on top of `computeSettlement`.
- **No backend, accounts, or network calls.** Press stays local-only and offline-first.
- **League rounds have no money.** `Results.tsx:117` already routes league rounds past `Settlement`. `MoneyBoard`, `MoneyTicker`, and the swing line must all be suppressed when `round.options.league` is set.
- **Brand tokens only.** Colors come from the custom properties in `src/index.css` (`--gold`, `--under`, `--over-strong`, `--muted`, `--ink`, `--card`, `--line`, `--bg`). No hardcoded hex in components. Display type is `var(--font-display)` (Oswald).
- **No The Tech JAM branding.** `BRAND.md` is explicit: Press is its own thing.
- **Every task ends green.** `npm run typecheck && npm run lint && npm run test && npm run build` all pass before the commit step.
- **Branch:** all work lands on `live-money-and-play-fixes`, which already exists and holds the spec commit.

## Browser verification harness

Several tasks verify in a real browser. Use this exact procedure — it is how the original defects were measured.

Start the dev server:

```bash
cd ~/projects/press-golf && npm run dev
```

Open `http://localhost:5173/`, set the viewport to **375×812**, and seed a realistic round by pasting this into the browser console:

```js
const ids = ['al','bo','cy','dee'];
const names = {al:'Al',bo:'Bo',cy:'Cy',dee:'Dee'};
const hcp = {al:4,bo:12,cy:0,dee:20};
const PARS=[4,4,3,5,4,4,3,4,5,4,4,3,5,4,4,3,4,5];
const holes = PARS.map((p,i)=>({number:i+1,par:p,strokeIndex:((i*7)%18)+1}));
const scores={};
for(let h=1;h<=11;h++){scores[h]={};ids.forEach((id,i)=>{scores[h][id]=holes[h-1].par+[0,1,-1,2,0,1][(h+i)%6];});}
const wolf={};
holes.forEach(h=>{wolf[h.number]={wolfPlayerId:ids[(h.number-1)%4],choice:h.number<=11?(h.number%4===0?{type:'lone'}:{type:'partner',partnerId:ids[(h.number)%4]}):null};});
localStorage.setItem('press.rounds.v1',JSON.stringify([{
  id:'seed1',course:'Pine Hollow',date:'2026-08-04',createdAt:Date.now(),updatedAt:Date.now(),
  players:ids.map(id=>({id,name:names[id],handicap:hcp[id]})),holes,
  games:['skins','nassau','wolf','strokePlay'],
  options:{useNet:true,stablefordMode:'standard',loneWolfMultiplier:2,blindWolfMultiplier:3,
    stakes:{skins:5,nassau:20,wolf:2,strokePlay:10},
    nassau:{mode:'2v2',teamA:['al','bo'],teamB:['cy','dee']}},
  scores,wolf,presses:[7],status:'in_progress'}]));
location.reload();
```

Then tap the "Pine Hollow" round card to land on Play at hole 12.

**Clean up after verifying:** `localStorage.clear(); location.reload();`

---

### Task 1: Pure money helpers

**Files:**
- Create: `src/games/money.ts`
- Test: `src/games/money.test.ts`

**Interfaces:**
- Consumes: `computeSettlement` from `src/games/settlement.ts`; `Round` from `src/types.ts`; test fixtures `makeRound`, `player`, `holes`, `scoresFrom` from `src/games/testFixtures.ts`.
- Produces: `lastCompletedHole(round: Round): number | null` and `holeSwing(round: Round, holeNumber: number): Record<string, number>` (playerId → dollars, rounded to cents). Tasks 6 consumes both.

- [ ] **Step 1: Write the failing tests**

Create `src/games/money.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lastCompletedHole, holeSwing } from './money';
import { makeRound, player, holes, scoresFrom } from './testFixtures';

/** 2 players, 3 holes, $5 per skin. Al wins h1; h2 halved and carries; Bo takes h3 worth 2 skins. */
function skinsRound() {
  const hs = holes(3);
  return makeRound({
    players: [player('p1', 'Al'), player('p2', 'Bo')],
    holes: hs,
    games: ['skins'],
    options: { stakes: { skins: 5 } },
    scores: scoresFrom(hs, { p1: [4, 5, 5], p2: [5, 5, 4] }),
  });
}

describe('lastCompletedHole', () => {
  it('returns null when no hole is fully scored', () => {
    const hs = holes(3);
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      scores: scoresFrom(hs, { p1: [4, 4, 4], p2: [] }),
    });
    expect(lastCompletedHole(round)).toBeNull();
  });

  it('returns the highest fully-scored hole', () => {
    expect(lastCompletedHole(skinsRound())).toBe(3);
  });

  it('ignores a partially-scored hole after a complete one', () => {
    const hs = holes(3);
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      scores: scoresFrom(hs, { p1: [4, 4, 4], p2: [5, 5, undefined] }),
    });
    expect(lastCompletedHole(round)).toBe(2);
  });
});

describe('holeSwing', () => {
  it('attributes the carried skins pot to the hole that won it', () => {
    // With h3: Al 1 skin, Bo 2 → Al −$5, Bo +$5.
    // Without h3: Al 1 skin, Bo 0 → Al +$5, Bo −$5.
    expect(holeSwing(skinsRound(), 3)).toEqual({ p1: -10, p2: 10 });
  });

  it('is zero-sum', () => {
    const swing = holeSwing(skinsRound(), 3);
    const sum = Object.values(swing).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(0, 2);
  });

  it('returns all zeros when no stake is set', () => {
    const hs = holes(3);
    const round = makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['skins'],
      scores: scoresFrom(hs, { p1: [4, 5, 5], p2: [5, 5, 4] }),
    });
    expect(holeSwing(round, 3)).toEqual({ p1: 0, p2: 0 });
  });

  it('leaves the source round untouched', () => {
    const round = skinsRound();
    const before = JSON.stringify(round);
    holeSwing(round, 3);
    expect(JSON.stringify(round)).toBe(before);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/projects/press-golf && npx vitest run src/games/money.test.ts`
Expected: FAIL — `Failed to resolve import "./money"`.

- [ ] **Step 3: Write the implementation**

Create `src/games/money.ts`:

```ts
import type { Round } from '../types';
import { computeSettlement } from './settlement';

/**
 * Highest hole number where every player has a score, or null when no hole is
 * complete. Gates which hole may display a money swing.
 */
export function lastCompletedHole(round: Round): number | null {
  let last: number | null = null;
  for (const h of round.holes) {
    const complete = round.players.every((p) => round.scores[h.number]?.[p.id] != null);
    if (complete) last = h.number;
  }
  return last;
}

/**
 * Per-player money delta attributable to one hole: the settlement as-is minus
 * the settlement with that hole's scores removed.
 *
 * Only exact for the most recently completed hole. Removing an earlier hole
 * changes skins carry-over on every hole after it, which makes the delta a
 * counterfactual ("what if this hole had never been played") rather than that
 * hole's value. Callers MUST gate on `lastCompletedHole`.
 */
export function holeSwing(round: Round, holeNumber: number): Record<string, number> {
  const withHole = computeSettlement(round).totals;
  const scores = { ...round.scores };
  delete scores[holeNumber];
  const withoutHole = computeSettlement({ ...round, scores }).totals;

  const swing: Record<string, number> = {};
  for (const p of round.players) {
    const delta = (withHole[p.id] ?? 0) - (withoutHole[p.id] ?? 0);
    swing[p.id] = Math.round(delta * 100) / 100;
  }
  return swing;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/projects/press-golf && npx vitest run src/games/money.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full gate**

Run: `cd ~/projects/press-golf && npm run typecheck && npm run lint && npm run test`
Expected: all pass, no new warnings.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/press-golf
git add src/games/money.ts src/games/money.test.ts
git commit -m "Add pure per-hole money swing helpers

lastCompletedHole and holeSwing derive from computeSettlement without
touching any scoring engine. holeSwing is only exact for the most recent
completed hole, since removing an earlier hole changes skins carry-over
downstream — the doc comment says so and callers must gate on it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Shared StakesEditor + stakes at Setup

**Files:**
- Create: `src/components/StakesEditor.tsx`
- Modify: `src/components/Settlement.tsx:1-69` (consume the extraction)
- Modify: `src/screens/Setup.tsx` (add the Money card)
- Modify: `src/index.css` (no new rules needed; verify existing `.stakes-editor` styles still apply)

**Interfaces:**
- Consumes: `STAKE_UNIT` from `src/games/settlement.ts`; `gameMeta` from `src/games/index.ts`; `GameType`, `Stakes` from `src/types.ts`.
- Produces: `<StakesEditor games={GameType[]} stakes={Stakes} onChange={(stakes: Stakes) => void} />`. Task 4 consumes it.

The editor takes `games` and `stakes` rather than a `Round`, because Setup has no `Round` yet — only local `games` and `options` state. This is the only interface that serves both callers.

- [ ] **Step 1: Create the shared component**

Create `src/components/StakesEditor.tsx`:

```tsx
import type { GameType, Stakes } from '../types';
import { STAKE_UNIT } from '../games/settlement';
import { gameMeta } from '../games';

interface Props {
  games: GameType[];
  stakes: Stakes;
  onChange: (stakes: Stakes) => void;
}

/**
 * One `$` input per game in play. Takes games + stakes rather than a Round so
 * Setup (which has no Round yet) and Results can share one implementation.
 */
export function StakesEditor({ games, stakes, onChange }: Props) {
  return (
    <div className="stakes-editor">
      {games.map((gt) => (
        <label key={gt} className="stake-row">
          <span className="stake-label">{gameMeta(gt).label}</span>
          <span className="stake-input">
            <span className="dollar">$</span>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={stakes?.[gt] ?? ''}
              placeholder="0"
              onChange={(e) =>
                onChange({ ...stakes, [gt]: e.target.value === '' ? 0 : Number(e.target.value) })
              }
            />
            <span className="per">per {STAKE_UNIT[gt]}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Consume it in Settlement.tsx**

In `src/components/Settlement.tsx`, delete the local `setStake` function and the whole `{editing && onChange && (<div className="stakes-editor">…</div>)}` block, and replace that block with:

```tsx
{editing && onChange && (
  <StakesEditor
    games={round.games}
    stakes={round.options.stakes ?? {}}
    onChange={(stakes) => onChange({ ...round, options: { ...round.options, stakes } })}
  />
)}
```

Add `import { StakesEditor } from './StakesEditor';` and remove the now-unused imports `GameType`, `STAKE_UNIT`, and `gameMeta` if nothing else in the file uses them (oxlint will flag any that remain).

- [ ] **Step 3: Add the Money card to Setup**

In `src/screens/Setup.tsx`, add `import { StakesEditor } from '../components/StakesEditor';`, then insert this section immediately **after** the `{(showStableford || showWolf) && (…)}` Options section and **before** `{error && <p className="error">{error}</p>}`:

```tsx
{games.length > 0 && (
  <section className="card">
    <h2>Money</h2>
    <StakesEditor
      games={games}
      stakes={options.stakes}
      onChange={(stakes) => setOptions({ ...options, stakes })}
    />
    <p className="hint">
      Optional — leave blank to play for nothing. You can add or change stakes later from the
      Board.
    </p>
  </section>
)}
```

- [ ] **Step 4: Run the gate**

Run: `cd ~/projects/press-golf && npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all pass. The existing `settlement.test.ts` suite still passes — this task changed no math.

- [ ] **Step 5: Verify in the browser**

Start the dev server per the harness above. From Home tap **Start New Round**, name two players, pick **Skins** and **Nassau**, and scroll to the Money card. Confirm:
- It lists exactly Skins and Nassau, and updates when you toggle a game off.
- Typing `5` into Skins persists across a game toggle.
- Leaving both blank still starts a round normally.

Then open a finished round's Results and confirm **Edit stakes** renders the same editor and still updates the settlement.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/press-golf
git add src/components/StakesEditor.tsx src/components/Settlement.tsx src/screens/Setup.tsx
git commit -m "Set stakes at setup via a shared StakesEditor

Extracts the stake inputs out of Settlement so Setup, the Board tab, and
Results share one implementation. Takes games + stakes rather than a Round,
because Setup has no Round until you press Start.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Three-tab Play shell + HoleView extraction

**Files:**
- Create: `src/screens/HoleView.tsx`
- Modify: `src/screens/Play.tsx` (tab state, tab buttons, move the boards)
- Modify: `src/index.css:595-615` (view-toggle button padding)

**Interfaces:**
- Consumes: everything `Play.tsx` already imports.
- Produces: `type PlayMode = 'hole' | 'board' | 'card'` and `<HoleView />` with the props block below. Tasks 5, 6, and 7 modify `HoleView`.

**The tab labels must be `Hole`, `Board`, `Card` — not `Scorecard`.** At 375px the screen has 343px of usable width; the two icon toggles take 96px (`flex: 0 0 var(--tap)`) and four 8px gaps take 32px, leaving **71px per tab button**. "SCORECARD" in uppercase display type needs roughly 96px and will overflow or wrap the row.

- [ ] **Step 1: Extract HoleView**

Create `src/screens/HoleView.tsx` holding the current hole-scoring body verbatim — the `hole-nav`, `hole-dots`, and `hole-body` blocks from `Play.tsx:209-275`, plus the touch handlers:

```tsx
import { useRef } from 'react';
import type { Round, Hole, WolfChoice } from '../types';
import { HoleStepper } from '../components/HoleStepper';
import { WolfControls } from '../components/WolfControls';
import { NassauControls } from '../components/NassauControls';
import { strokeIndexMap, strokesReceivedOnHole } from '../games/handicap';
import { playerColor } from '../player';

interface Props {
  round: Round;
  hole: Hole;
  idx: number;
  dir: 'next' | 'prev';
  highlightId: string | null;
  holeComplete: boolean[];
  onGo: (index: number) => void;
  onScore: (playerId: string, value: number | null) => void;
  onWolf: (choice: WolfChoice) => void;
  onPresses: (presses: number[]) => void;
}

export function HoleView({
  round, hole, idx, dir, highlightId, holeComplete, onGo, onScore, onWolf, onPresses,
}: Props) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const siMap = strokeIndexMap(round);
  const last = idx === round.holes.length - 1;

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    // Only decisively horizontal swipes navigate — a diagonal scroll must not flip holes.
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      onGo(idx + (dx < 0 ? 1 : -1));
    }
    touchStart.current = null;
  };

  return (
    <div className="hole-view" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="hole-nav">
        <button className="nav-arrow" onClick={() => onGo(idx - 1)} disabled={idx === 0} aria-label="Previous hole">‹</button>
        <div className="hole-head">
          <div className="hole-num">Hole {hole.number}</div>
          <div className="hole-par">Par {hole.par}</div>
        </div>
        <button className="nav-arrow" onClick={() => onGo(idx + 1)} disabled={last} aria-label="Next hole">›</button>
      </div>

      <div className="hole-dots" aria-label="Hole progress">
        {round.holes.map((h, i) => (
          <button
            key={h.number}
            className={`hole-dot${i === idx ? ' current' : ''}${holeComplete[i] ? ' done' : ''}`}
            onClick={() => onGo(i)}
            aria-label={`Hole ${h.number}${holeComplete[i] ? ', complete' : ''}`}
            aria-current={i === idx ? 'true' : undefined}
          />
        ))}
      </div>

      <div key={hole.number} className={`hole-body slide-${dir}`}>
        {round.games.includes('wolf') && (
          <WolfControls round={round} hole={hole} onChange={onWolf} />
        )}
        {round.games.includes('nassau') && (
          <NassauControls round={round} hole={hole} onChange={onPresses} />
        )}
        <section className="steppers">
          {round.players.map((p, i) => (
            <HoleStepper
              key={p.id}
              id={`stepper-${p.id}`}
              highlight={highlightId === p.id}
              name={p.name}
              color={playerColor(i)}
              par={hole.par}
              value={round.scores[hole.number]?.[p.id] ?? null}
              handicap={round.options.league ? p.handicap : undefined}
              strokesReceived={
                round.options.useNet
                  ? strokesReceivedOnHole(p.handicap ?? 0, siMap[hole.number], round.holes.length)
                  : 0
              }
              onChange={(v) => onScore(p.id, v)}
            />
          ))}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewire Play.tsx to three tabs**

In `src/screens/Play.tsx`:

1. Change the mode state and add the type:

```tsx
export type PlayMode = 'hole' | 'board' | 'card';

const [mode, setMode] = useState<PlayMode>(round.status === 'finished' ? 'card' : 'hole');
```

2. Replace the two `seg-btn` buttons with three:

```tsx
{(['hole', 'board', 'card'] as const).map((m) => (
  <button
    key={m}
    className={`seg-btn${mode === m ? ' active' : ''}`}
    onClick={() => setMode(m)}
  >
    {m === 'hole' ? 'Hole' : m === 'board' ? 'Board' : 'Card'}
  </button>
))}
```

3. Replace the `{mode === 'hole' ? (…) : (<Scorecard … />)}` ternary and the always-rendered `<section className="boards">` with an explicit three-way render. The boards move inside the Board tab:

```tsx
{mode === 'hole' && (
  <HoleView
    round={round}
    hole={hole}
    idx={idx}
    dir={dir}
    highlightId={highlightId}
    holeComplete={holeComplete}
    onGo={go}
    onScore={setScore}
    onWolf={setWolf}
    onPresses={setPresses}
  />
)}

{mode === 'board' && (
  <section className="boards">
    {round.options.league ? (
      <LeagueBoard round={round} />
    ) : (
      results.map((r) => (
        <Leaderboard key={r.gameType} result={r} colorOf={(id) => colors[id]} />
      ))
    )}
  </section>
)}

{mode === 'card' && (
  <Scorecard
    round={round}
    currentHole={hole.number}
    onJumpToHole={(i) => {
      setIdx(i);
      setMode('hole');
    }}
  />
)}
```

4. In `keepScoring`, change `setMode('hole')` — it already targets `'hole'`, so no edit is needed, but confirm it still compiles against `PlayMode`.

5. Delete from `Play.tsx` the now-unused imports and locals that moved into `HoleView`: `HoleStepper`, `WolfControls`, `NassauControls`, `strokeIndexMap`, `strokesReceivedOnHole`, `playerColor`, `touchStart`, `onTouchStart`, `onTouchEnd`, `siMap`, and `last` if the Finish/Next branch no longer needs it. **Keep `last`** — the footer CTA still uses it. Add `import { HoleView } from './HoleView';`.

- [ ] **Step 3: Tighten the view-toggle so three buttons fit**

In `src/index.css`, add after the `.seg.view-toggle` rule at line 613:

```css
/* Three tabs + two icon toggles share 343px at 375px wide — ~71px per tab. */
.view-toggle .seg-btn {
  padding: 12px 4px;
  letter-spacing: 0.03em;
}
```

- [ ] **Step 4: Run the gate**

Run: `cd ~/projects/press-golf && npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all pass. oxlint must report no unused imports in `Play.tsx`.

- [ ] **Step 5: Verify the toggle row does not overflow**

Start the dev server and seed the round per the harness. On Play at 375×812, paste into the console:

```js
(()=>{const row=document.querySelector('.view-toggle');const btns=[...row.querySelectorAll('.seg-btn')];
return JSON.stringify({rowWidth:Math.round(row.getBoundingClientRect().width),
 rowHeight:Math.round(row.getBoundingClientRect().height),
 wrapped:row.getBoundingClientRect().height>72,
 btnWidths:btns.map(b=>Math.round(b.getBoundingClientRect().width)),
 anyClipped:btns.some(b=>b.scrollWidth>b.clientWidth+1)})})()
```

Expected: `wrapped: false` and `anyClipped: false`. If either is true, reduce `.view-toggle .seg-btn` padding to `12px 2px` and re-measure.

Also confirm by eye: tapping **Board** shows the four leaderboards, tapping **Card** shows the scorecard, tapping a scorecard cell jumps back to **Hole** on that hole.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/press-golf
git add src/screens/HoleView.tsx src/screens/Play.tsx src/index.css
git commit -m "Split Play into Hole / Board / Card tabs

The four live leaderboards move off the scoring surface and into a Board
tab, and the hole-scoring body moves out of Play.tsx into HoleView so the
screen file stays focused. Third tab is labelled Card, not Scorecard —
three tabs plus the two icon toggles leave ~71px each at 375px wide.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: MoneyBoard on the Board tab

**Files:**
- Create: `src/components/MoneyBoard.tsx`
- Modify: `src/screens/Play.tsx` (render it above the boards)
- Modify: `src/index.css` (append the money-board rules)

**Interfaces:**
- Consumes: `StakesEditor` from Task 2; `computeSettlement`, `formatMoney` from `src/games/settlement.ts`; `colorMap` from `src/player.ts`; `PlayerAvatar`; `CoinIcon` from `src/icons.tsx`.
- Produces: `<MoneyBoard round={Round} onChange={(round: Round) => void} />`.

This renders `Settlement.perGame` — the per-game breakdown that `settlement.ts:187` computes today and nothing displays.

- [ ] **Step 1: Create the component**

Create `src/components/MoneyBoard.tsx`:

```tsx
import { useState } from 'react';
import type { Round } from '../types';
import { computeSettlement, formatMoney } from '../games/settlement';
import { colorMap } from '../player';
import { PlayerAvatar } from './PlayerAvatar';
import { StakesEditor } from './StakesEditor';
import { CoinIcon } from '../icons';

interface Props {
  round: Round;
  onChange: (round: Round) => void;
}

const tone = (n: number) => (n > 0 ? ' up' : n < 0 ? ' down' : '');

/** Live money for the Board tab: net per player, then the per-game breakdown. */
export function MoneyBoard({ round, onChange }: Props) {
  const settlement = computeSettlement(round);
  const [editing, setEditing] = useState(!settlement.active);
  const colors = colorMap(round);

  const netSorted = round.players
    .map((p) => ({ id: p.id, name: p.name, net: settlement.totals[p.id] ?? 0 }))
    .sort((a, b) => b.net - a.net);

  return (
    <section className="board money-board">
      <div className="board-head">
        <span className="board-title">
          <CoinIcon size={16} /> Money
        </span>
        <button className="link-btn" onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done' : 'Edit stakes'}
        </button>
      </div>

      {editing && (
        <StakesEditor
          games={round.games}
          stakes={round.options.stakes ?? {}}
          onChange={(stakes) => onChange({ ...round, options: { ...round.options, stakes } })}
        />
      )}

      {!settlement.active ? (
        <div className="board-note">No money on this round. Set a stake above to keep a tally.</div>
      ) : (
        <>
          <ol className="board-list net-list">
            {netSorted.map((p) => (
              <li key={p.id} className="net-row">
                <PlayerAvatar name={p.name} color={colors[p.id]} size={22} />
                <span className="net-name">{p.name}</span>
                <span className={`net-amount${tone(p.net)}`}>
                  {p.net === 0 ? '—' : formatMoney(p.net)}
                </span>
              </li>
            ))}
          </ol>

          <div className="pergame-list">
            {settlement.perGame.map((g) => (
              <div key={g.gameType} className="pergame">
                <div className="pergame-head">
                  <span className="pergame-label">{g.label}</span>
                  <span className="pergame-stake">
                    {formatMoney(g.stake)} per {g.unit}
                  </span>
                </div>
                <div className="pergame-nets">
                  {round.players.map((p) => {
                    const n = g.net[p.id] ?? 0;
                    return (
                      <span key={p.id} className={`pg-net${tone(n)}`}>
                        <span className="pg-name">{p.name}</span>
                        {n === 0 ? '—' : formatMoney(n)}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Render it on the Board tab**

In `src/screens/Play.tsx`, add `import { MoneyBoard } from '../components/MoneyBoard';` and change the Board branch so money sits above the standings, suppressed for league rounds:

```tsx
{mode === 'board' && (
  <>
    {!round.options.league && <MoneyBoard round={round} onChange={onChange} />}
    <section className="boards">
      {round.options.league ? (
        <LeagueBoard round={round} />
      ) : (
        results.map((r) => (
          <Leaderboard key={r.gameType} result={r} colorOf={(id) => colors[id]} />
        ))
      )}
    </section>
  </>
)}
```

- [ ] **Step 3: Add the styles**

Append to `src/index.css`:

```css
/* ---- Money board (Play → Board tab) ---- */
.money-board {
  margin-bottom: 12px;
}
.pergame-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.pergame-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.pergame-label {
  font-family: var(--font-display);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.82rem;
}
.pergame-stake {
  color: var(--muted);
  font-size: 0.74rem;
}
.pergame-nets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 4px;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
}
.pg-name {
  color: var(--muted);
  margin-right: 4px;
}
.pg-net.up {
  color: var(--under);
}
.pg-net.down {
  color: var(--over-strong);
}
```

- [ ] **Step 4: Run the gate**

Run: `cd ~/projects/press-golf && npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all pass.

- [ ] **Step 5: Verify in the browser**

Seed the round per the harness, tap **Board**, and confirm:
- Net per player is sorted with the biggest winner first.
- A breakdown row appears for each of Skins, Nassau, Wolf, Stroke Play, showing that game's stake and each player's net from that game alone.
- Each breakdown row sums to zero across the four players (check one by hand).
- **Edit stakes** opens the shared editor and the numbers update live.
- Clearing every stake to `0` shows the "No money on this round" note and the leaderboards still render below.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/press-golf
git add src/components/MoneyBoard.tsx src/screens/Play.tsx src/index.css
git commit -m "Render live money and the per-game breakdown on the Board tab

settlement.ts has always computed a per-game net per player; nothing
displayed it. Board tab now shows the running net plus what each game
contributed, and stakes stay editable mid-round.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: MoneyTicker on the Hole tab

**Files:**
- Create: `src/components/MoneyTicker.tsx`
- Modify: `src/screens/Play.tsx` (render under the tab row)
- Modify: `src/index.css` (append ticker rules)

**Interfaces:**
- Consumes: `computeSettlement`, `formatMoney`, `colorMap`.
- Produces: `<MoneyTicker round={Round} />`, rendering `null` when there is no money.

**Fixed player order, never sorted.** Stroke play and Stableford move on partial holes, so sorting would re-shuffle the line on individual stepper taps — while the user is reading it and pressing a button underneath. Fixed order maps 1:1 to the steppers below. Sorted standings are `MoneyBoard`'s job.

- [ ] **Step 1: Create the component**

Create `src/components/MoneyTicker.tsx`:

```tsx
import type { Round } from '../types';
import { computeSettlement, formatMoney } from '../games/settlement';
import { colorMap } from '../player';

/**
 * Glanceable money line for the Hole tab. Player order is fixed, never sorted,
 * so it maps 1:1 to the steppers below and never reshuffles mid-entry.
 * Renders nothing when no stake is set — a friendly round shows no dead $0 bar.
 */
export function MoneyTicker({ round }: { round: Round }) {
  const settlement = computeSettlement(round);
  if (!settlement.active) return null;
  const colors = colorMap(round);

  return (
    <div className="money-ticker" aria-label="Money so far">
      {round.players.map((p) => {
        const net = settlement.totals[p.id] ?? 0;
        return (
          <span key={p.id} className={`tick${net > 0 ? ' up' : net < 0 ? ' down' : ''}`}>
            <span className="tick-dot" style={{ background: colors[p.id] }} aria-hidden="true" />
            <span className="tick-name">{p.name}</span>
            <span className="tick-net">{net === 0 ? '—' : formatMoney(net)}</span>
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Render it on the Hole tab**

In `src/screens/Play.tsx`, add `import { MoneyTicker } from '../components/MoneyTicker';` and insert immediately after the closing `</div>` of the `seg view-toggle` block:

```tsx
{mode === 'hole' && !round.options.league && <MoneyTicker round={round} />}
```

- [ ] **Step 3: Add the styles**

Append to `src/index.css`:

```css
/* ---- Money ticker (Play → Hole tab) ---- */
.money-ticker {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 6px 2px;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.money-ticker::-webkit-scrollbar {
  display: none;
}
.tick {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
}
.tick-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.tick-name {
  font-family: var(--font-display);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.tick-net {
  font-weight: 700;
}
.tick.up .tick-net {
  color: var(--under);
}
.tick.down .tick-net {
  color: var(--over-strong);
}
```

- [ ] **Step 4: Run the gate**

Run: `cd ~/projects/press-golf && npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all pass.

- [ ] **Step 5: Verify in the browser**

Seed the round per the harness. On the Hole tab confirm:
- The ticker shows `Al … Bo … Cy … Dee …` in that order — the same order as the steppers below.
- Tapping a stepper `+` changes a number but **does not reorder** the line.
- Clearing every stake from the Board tab hides the ticker completely (not a row of `$0`).

Then measure that it costs less than one stepper of height:

```js
(()=>{const t=document.querySelector('.money-ticker');
return JSON.stringify({height:Math.round(t.getBoundingClientRect().height),
 scrollable:t.scrollWidth>t.clientWidth})})()
```

Expected: `height` ≤ 40. `scrollable` may be either — with four short names it should be `false`.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/press-golf
git add src/components/MoneyTicker.tsx src/screens/Play.tsx src/index.css
git commit -m "Show a live money ticker while scoring

One glanceable line above the steppers, in fixed player order so it maps
1:1 to them and never reshuffles under your thumb mid-entry. Hidden
entirely when no stake is set.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Per-hole swing line

**Files:**
- Modify: `src/screens/HoleView.tsx` (render under the steppers)
- Modify: `src/index.css` (append swing rules)

**Interfaces:**
- Consumes: `lastCompletedHole`, `holeSwing` from Task 1; `computeSettlement`, `formatMoney`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Compute the gated swing in HoleView**

In `src/screens/HoleView.tsx`, add the imports:

```tsx
import { computeSettlement, formatMoney } from '../games/settlement';
import { lastCompletedHole, holeSwing } from '../games/money';
```

and inside the component, above the `return`:

```tsx
// Only the most recently completed hole gets a swing. For any earlier hole the
// delta is a counterfactual — removing it changes skins carry-over downstream —
// so showing it would display a number that hole never actually produced.
const swing = (() => {
  if (round.options.league) return null;
  if (!computeSettlement(round).active) return null;
  if (lastCompletedHole(round) !== hole.number) return null;
  const s = holeSwing(round, hole.number);
  return Object.values(s).some((v) => v !== 0) ? s : null;
})();
```

- [ ] **Step 2: Render it under the steppers**

Immediately after the closing `</section>` of `.steppers` and before the closing `</div>` of `.hole-body`:

```tsx
{swing && (
  <div className="swing" aria-label={`Money swing on hole ${hole.number}`}>
    <span className="swing-label">Hole {hole.number}</span>
    {round.players.map((p) => {
      const n = swing[p.id] ?? 0;
      return (
        <span key={p.id} className={`swing-net${n > 0 ? ' up' : n < 0 ? ' down' : ''}`}>
          {p.name} {n === 0 ? '—' : formatMoney(n)}
        </span>
      );
    })}
  </div>
)}
```

- [ ] **Step 3: Add the styles**

Append to `src/index.css`:

```css
/* ---- Per-hole money swing (Play → Hole tab) ---- */
.swing {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--card);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}
.swing-label {
  font-family: var(--font-display);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.swing-net.up {
  color: var(--under);
}
.swing-net.down {
  color: var(--over-strong);
}
```

- [ ] **Step 4: Run the gate**

Run: `cd ~/projects/press-golf && npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all pass.

- [ ] **Step 5: Verify the gating in the browser**

Seed the round per the harness. The seed scores holes 1–11, so hole 11 is the last complete one.

- Navigate to **hole 11** → the swing line appears.
- Navigate back to **hole 5** → no swing line (it is not the most recent complete hole). This is the correctness gate; if a line appears here, the guard is wrong.
- Navigate to **hole 12** (blank) → no swing line.
- Enter all four scores on hole 12 → the swing line appears on hole 12, and disappears from hole 11 when you navigate back.
- Confirm the four numbers on the line sum to zero.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/press-golf
git add src/screens/HoleView.tsx src/index.css
git commit -m "Show what the current hole was worth

Renders only on the most recently completed hole. Removing an earlier hole
changes skins carry-over on every hole after it, so its delta answers 'what
if this had never been played' rather than 'what was this worth' — showing
it would be a quietly wrong number.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Fit the Hole tab in one screen

**Files:**
- Modify: `src/components/WolfControls.tsx` (collapse once answered)
- Modify: `src/components/NassauControls.tsx` (collapse once answered)
- Modify: `src/index.css:890-896` (single-row progress strip), `:1258-1260` (sticky footer), plus new collapse rules

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

**Acceptance criterion:** at 375×812 on the seeded 4-player round with Wolf and Nassau active and the Wolf call already made, **all four steppers and the CTA are visible without scrolling when you arrive at a hole**. Entering scores adds score-mark rings that grow each stepper ~26px, so the fourth can drop below the fold once filled in. The original defect was 2 of 4 steppers with the CTA at y=1877.

Baseline measured before this task: ~892px of content against 812px of viewport. Wolf ~145px, Nassau ~135px, wrapped hole dots 50px.

**Two React traps in this task — read before editing:**

1. **`NassauControls` has an early return before any hook.** Line 14 is
   `if (round.players.length < 2) return null;`. A `useState` placed after it is
   a conditional hook and React will throw. The `useState` must go **above** that
   early return.
2. **Both cards remount per hole, and this task depends on that.** `HoleView`
   renders the hole body inside `<div key={hole.number}>`, so navigating holes
   remounts the subtree and re-runs each `useState` initializer. That is what
   makes Wolf re-open on a hole whose call has not been made yet. Do not
   "optimize" that key away.

- [ ] **Step 1: Collapse WolfControls once the call is made**

In `src/components/WolfControls.tsx`, add `import { useState } from 'react';`, and inside the component:

```tsx
const [open, setOpen] = useState(choice == null);
const partnerName =
  choice?.type === 'partner'
    ? round.players.find((p) => p.id === choice.partnerId)?.name
    : undefined;
const summary =
  choice == null
    ? null
    : choice.type === 'partner'
      ? `${wolf?.name} + ${partnerName}`
      : choice.type === 'lone'
        ? `${wolf?.name} — Lone Wolf ×${round.options.loneWolfMultiplier}`
        : `${wolf?.name} — Blind ×${round.options.blindWolfMultiplier}`;
```

Then wrap the render so an answered card is one line:

```tsx
if (!open && summary) {
  return (
    <button className="wolf collapsed" onClick={() => setOpen(true)}>
      <PawIcon size={14} />
      <span className="collapsed-text">{summary}</span>
      <span className="collapsed-hint">Change</span>
    </button>
  );
}
```

Place this immediately before the existing `return (<div className="wolf">…)`.

In the expanded card, make each of the three choice buttons collapse after picking. Replace the three `onClick` handlers exactly:

```tsx
// partner chip (inside the others.map)
onClick={() => { onChange({ type: 'partner', partnerId: p.id }); setOpen(false); }}

// Lone Wolf chip
onClick={() => { onChange({ type: 'lone' }); setOpen(false); }}

// Blind chip
onClick={() => { onChange({ type: 'blind' }); setOpen(false); }}
```

- [ ] **Step 2: Collapse NassauControls once past the press decision**

In `src/components/NassauControls.tsx`, add `import { useState } from 'react';`, then put the hook **above** the existing `if (round.players.length < 2) return null;` on line 14 — a hook after that early return is conditional and React will throw:

```tsx
export function NassauControls({ round, hole, onChange }: Props) {
  const [open, setOpen] = useState(false);
  if (round.players.length < 2) return null;
  // …existing body unchanged…
```

Then, immediately before the existing `return (<div className="nassau">…)`:

```tsx
if (!open) {
  return (
    <button className="nassau collapsed" onClick={() => setOpen(true)}>
      <FlagIcon size={14} />
      <span className="collapsed-text">
        {nineLabel}: {seg.status}
      </span>
      <span className="collapsed-hint">{presses.length ? `${presses.length} press` : 'Press'}</span>
    </button>
  );
}
```

Place it immediately before the existing `return (<div className="nassau">…)`. Nassau defaults to collapsed because it is a status readout, not a required input — unlike Wolf, which must be answered before the hole is scored.

- [ ] **Step 3: Add the collapsed styles**

Append to `src/index.css`:

```css
/* ---- Collapsed game cards (Play → Hole tab) ---- */
.wolf.collapsed,
.nassau.collapsed {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 0;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--ink);
  font-size: 0.82rem;
  text-align: left;
}
.collapsed-text {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.collapsed-hint {
  flex: 0 0 auto;
  color: var(--green-600);
  font-family: var(--font-display);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.7rem;
}
```

- [ ] **Step 4: Make the hole dots a single row**

Replace the `.hole-dots` rule at `src/index.css:890-896` with:

```css
.hole-dots {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  gap: 1px;
  margin-top: -6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.hole-dots::-webkit-scrollbar {
  display: none;
}
```

Leave `.hole-dot` at 24×24 — it meets the WCAG 2.2 target-size minimum, and a single row is what recovers the height.

- [ ] **Step 5: Fix the sticky footer**

Replace the `.play-foot` rule at `src/index.css:1258-1260` with:

```css
/* The CTA's own `position: sticky` cannot work here — its containing block is
   this element, which is only as tall as the button, so it has no room to move.
   Stick the footer itself instead; its containing block is the tall .screen. */
.play-foot {
  position: sticky;
  bottom: 0;
  z-index: 3;
  margin-top: 4px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  background: var(--bg);
}
```

Leave `.btn-primary.sticky` at `:157` alone — Setup depends on it and it works correctly there.

- [ ] **Step 6: Run the gate**

Run: `cd ~/projects/press-golf && npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all pass.

- [ ] **Step 7: Measure the acceptance criterion**

Seed the round per the harness, go to **hole 12**, make the Wolf call (tap any partner chip) so the card collapses, scroll to the very top, and paste:

```js
(()=>{window.scrollTo(0,0);const vh=window.innerHeight;
const btn=document.querySelector('.play-foot .btn-primary');
const br=btn.getBoundingClientRect();
const steps=[...document.querySelectorAll('.stepper')];
return JSON.stringify({vh,
 ctaVisible:br.top>=0&&br.bottom<=vh,
 ctaTop:Math.round(br.top),
 steppersFullyVisible:steps.filter(s=>{const r=s.getBoundingClientRect();
   return r.top>=0&&r.bottom<=br.top;}).length,
 docHeight:document.documentElement.scrollHeight})})()
```

Expected: **`ctaVisible: true` and `steppersFullyVisible: 4`.**

Baseline for comparison was `ctaTop: 1877`, `steppersFullyVisible: 2`.

If `steppersFullyVisible` is 3, reclaim the last rows by reducing `.hole-nav` vertical padding — do not shrink the steppers themselves; they are the primary touch target.

Also confirm the footer background hides content scrolling underneath it rather than letting text show through.

- [ ] **Step 8: Commit**

```bash
cd ~/projects/press-golf
git add src/components/WolfControls.tsx src/components/NassauControls.tsx src/index.css
git commit -m "Fit the Hole tab in one screen

Game cards collapse to one line once answered, the 18 hole dots stop
wrapping into a ragged two-row block, and .play-foot becomes the sticky
element instead of the button inside it — the button's own containing
block was only as tall as itself, so it never had room to pin.

All four steppers and the CTA now sit above the fold at 375x812 with Wolf
and Nassau active; previously it was two steppers and a CTA at y=1877.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Sunlight-mode gold contrast

**Files:**
- Modify: `src/index.css:28` (add `--gold-ink`), `:52-61` (remap in sunlight), and the five foreground uses at `:1226`, `:1335`, `:1589`, `:1663`, `:1850`

**Interfaces:** none.

`--gold #e7b53c` is used as a foreground `color` in five places. Measured on the light theme, `.hcp-dots` renders at **1.9:1** against white — WCAG 2.2 AA wants 4.5:1 at that size. Those dots are the only indicator of who receives a handicap stroke, and sunlight mode is precisely the mode for reading in direct sun.

A **separate `--gold-ink` token for foreground text only**, so the `color-mix` tints and borders that build the gold surfaces keep the bright value.

- [ ] **Step 1: Add the token**

In `src/index.css`, in the `:root` block beside `--gold: #e7b53c;` at line 28, add:

```css
  /* Foreground-only gold. Split from --gold so the light theme can darken text
     without muddying the color-mix tints and borders built on --gold. */
  --gold-ink: var(--gold);
```

In the `:root.sunlight` block (line 52), add:

```css
  /* #e7b53c is 1.9:1 on white. #8a6410 is 5.37:1 — clears AA with headroom. */
  --gold-ink: #8a6410;
```

- [ ] **Step 2: Point the five foreground uses at it**

Change `color: var(--gold);` to `color: var(--gold-ink);` at exactly these five rules — and nowhere else:

| Line | Selector |
|---|---|
| 1226 | `.board-row.leader .board-rank` |
| 1335 | `.lmatch-strokes` |
| 1589 | `.winner-emoji` |
| 1663 | `.hcp-dots` |
| 1850 | `.sc-dots` |

Leave every `color-mix(in srgb, var(--gold) …)` background and border untouched.

- [ ] **Step 3: Run the gate**

Run: `cd ~/projects/press-golf && npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all pass.

- [ ] **Step 4: Measure the contrast**

Seed the round, turn **sunlight mode on** (the ☀ button beside the tabs), go to a hole where a player shows stroke dots (Bo and Dee do at hole 12), and paste:

```js
(()=>{
const lum=c=>{const[r,g,b]=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});
 return 0.2126*r+0.7152*g+0.0722*b};
const parse=s=>s.match(/\d+(\.\d+)?/g).slice(0,3).map(Number);
const ratio=(f,b)=>{const L1=lum(parse(f)),L2=lum(parse(b));const[hi,lo]=L1>L2?[L1,L2]:[L2,L1];
 return +((hi+0.05)/(lo+0.05)).toFixed(2)};
const bgOf=el=>{let n=el;while(n&&n!==document.documentElement){
 const bg=getComputedStyle(n).backgroundColor;
 if(bg&&bg!=='rgba(0, 0, 0, 0)'&&!bg.startsWith('color('))return bg;n=n.parentElement}
 return getComputedStyle(document.body).backgroundColor};
const out={};
for(const sel of ['.hcp-dots','.sc-dots','.board-row.leader .board-rank']){
 const el=document.querySelector(sel);
 out[sel]=el?ratio(getComputedStyle(el).color,bgOf(el)):'(not on screen)';}
return JSON.stringify(out,null,1)})()
```

Expected: every measured ratio **≥ 4.5**. Baseline for `.hcp-dots` was 1.9.

Check `.sc-dots` on the **Card** tab and `.board-rank` on the **Board** tab — they are not all on one screen. Then check `.winner-emoji` by eye on a finished round's Results: it sits on the gold-tinted winner hero rather than white, so measure it there rather than trusting the figure above.

Finally toggle sunlight **off** and confirm the dark theme is visually unchanged — `--gold-ink` falls back to `--gold` there.

- [ ] **Step 5: Commit**

```bash
cd ~/projects/press-golf
git add src/index.css
git commit -m "Fix invisible handicap dots in sunlight mode

--gold was never remapped for the light theme, so the stroke dots rendered
at 1.9:1 on white — in the one mode built for reading in direct sun, and on
the only indicator of who gets a stroke. Splits out a foreground-only
--gold-ink so the gold tints and borders keep the bright value.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Browser history handling

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: the existing `View` union.
- Produces: nothing consumed downstream.

There is no `pushState` or `popstate` anywhere in `src`. On an installed Android PWA the back gesture exits the app mid-round instead of stepping back a screen.

- [ ] **Step 1: Add the history sync**

In `src/App.tsx`, add `useEffect` to the React import, then above the component:

```tsx
/** Where the back gesture lands from each view. `null` = let the browser leave. */
const BACK_TO: Record<View, View | null> = {
  home: null,
  setup: 'home',
  leagueSetup: 'home',
  play: 'home',
  results: 'play',
};
```

Inside the component, after the `view` state:

```tsx
// Without this, the Android back gesture exits an installed PWA mid-round.
useEffect(() => {
  const onPop = () => setView((v) => BACK_TO[v] ?? v);
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}, []);

const goTo = (next: View) => {
  setView(next);
  if (next !== 'home') window.history.pushState({ view: next }, '');
};
```

Then replace **all twelve** `setView(...)` calls with `goTo(...)`. Eleven are in the JSX, one is in `finish()`:

| Where | Call |
|---|---|
| `Home` `onNew` | `setView('setup')` |
| `Home` `onNewLeague` | `setView('leagueSetup')` |
| `Home` `onResume` | `setView('play')` |
| `Home` `onViewResults` | `setView('results')` |
| `Setup` `onCancel` | `setView('home')` |
| `Setup` `onStart` | `setView('play')` |
| `LeagueSetup` `onCancel` | `setView('home')` |
| `LeagueSetup` `onStart` | `setView('play')` |
| `Play` `onExit` | `setView('home')` |
| `Results` `onHome` | `setView('home')` |
| `Results` `onBackToPlay` | `setView('play')` |
| `finish()` | `setView('results')` |

Leave the `setRound(...)` and `update(...)` calls beside them alone. After the edit, `setView` should appear only inside `goTo` and the `popstate` handler — grep to confirm: `grep -n "setView" src/App.tsx` should return exactly two lines.

Known limitation, accepted: the history stack is not a perfect mirror of the view stack, so a deep path can leave a spare entry. What it guarantees is the actual bug — back from a non-home view never exits the app.

- [ ] **Step 2: Run the gate**

Run: `cd ~/projects/press-golf && npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all pass.

- [ ] **Step 3: Verify in the browser**

Seed the round per the harness, then:
- Home → tap the round → Play. Press the browser **Back** button. Expected: you land on **Home**, still in the app.
- Home → Start New Round → Back. Expected: **Home**.
- Play → Finish → Results → Back. Expected: **Play**.
- On Home, press Back. Expected: the browser leaves the app — correct behavior, not a bug.
- Confirm an in-progress round still resumes at the right hole after a back-and-forward cycle.

- [ ] **Step 4: Commit**

```bash
cd ~/projects/press-golf
git add src/App.tsx
git commit -m "Keep the back gesture inside the app

App.tsx was a plain useState view switcher with no history integration, so
on an installed Android PWA the back gesture left the app mid-round. Pushes
a history entry per forward transition and maps popstate back a screen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Scorecard keyboard access + doc correction

**Files:**
- Modify: `src/components/Scorecard.tsx:26-34` (hole header cells), `:68-77` (score cells)
- Modify: `README.md:24-26`
- Modify: `CHANGELOG.md`

**Interfaces:** none.

The tap-to-jump cells carry `onClick` with no role, tab stop, or key handler. Separately, README and CHANGELOG both claim handicap strokes are "capped at one stroke per hole", but `handicap.ts:22-32` awards two when the handicap exceeds the hole count and `handicap.test.ts:45-49` asserts exactly that. The engine is right; the prose is wrong.

- [ ] **Step 1: Add the keyboard path**

In `src/components/Scorecard.tsx`, above the `return`:

```tsx
const jumpProps = (i: number) =>
  onJumpToHole
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: () => onJumpToHole(i),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onJumpToHole(i);
          }
        },
      }
    : {};
```

Replace `onClick={() => onJumpToHole?.(i)}` with `{...jumpProps(i)}` on both the `<th className={\`sc-hole…\`}>` and the `<td className={\`sc-cell…\`}>`.

- [ ] **Step 2: Correct the docs**

In `README.md`, replace:

> Net scoring with per-hole handicap strokes is supported throughout (capped at one
> stroke per hole).

with:

> Net scoring with per-hole handicap strokes is supported throughout — one stroke
> per hole down the stroke index, and a second on the hardest holes when a
> handicap exceeds the hole count.

In `CHANGELOG.md`, under `## [0.1.0]`, replace:

> - Net/handicap scoring with per-hole stroke allocation, capped at one stroke
>   per hole.

with:

> - Net/handicap scoring with per-hole stroke allocation down the stroke index,
>   including a second stroke on the hardest holes when a handicap exceeds the
>   hole count.

- [ ] **Step 3: Add the Unreleased CHANGELOG entry**

Under `## [Unreleased]` → `### Added`, prepend:

```markdown
- Live money during the round: stakes are set at setup, a ticker shows each
  player's running net while scoring, a new **Board** tab carries the live
  standings plus a per-game money breakdown, and each completed hole shows what
  it was worth.
```

Under `### Fixed`, prepend:

```markdown
- The Play screen's primary button never pinned — its `position: sticky` had no
  room to move inside a containing block only as tall as itself, leaving the
  CTA below four leaderboards.
- Scoring sat below the fold with multiple games active; the Hole tab now fits
  one screen.
- Handicap stroke dots were unreadable in sunlight mode (1.9:1 on white).
- The back gesture exited the installed PWA mid-round instead of stepping back
  a screen.
- Scorecard tap-to-jump cells were unreachable by keyboard.
- README and CHANGELOG described a one-stroke-per-hole handicap cap the engine
  has never had.
```

- [ ] **Step 4: Run the gate**

Run: `cd ~/projects/press-golf && npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all pass.

- [ ] **Step 5: Verify keyboard access**

Seed the round, open the **Card** tab, press `Tab` until a score cell is focused, and press `Enter`. Expected: the app switches to the **Hole** tab on that hole. Repeat with `Space`.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/press-golf
git add src/components/Scorecard.tsx README.md CHANGELOG.md
git commit -m "Keyboard access for scorecard jump cells; correct handicap docs

The tap-to-jump cells had onClick with no role or tab stop. Separately,
README and CHANGELOG both claimed strokes are capped at one per hole;
handicap.ts awards two above the hole count and its tests assert it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Final verification

After Task 10, run the full gate once more and re-measure the two headline claims on a freshly seeded round:

```bash
cd ~/projects/press-golf && npm run typecheck && npm run lint && npm run test && npm run build
```

| Claim | Baseline | Target | How |
|---|---|---|---|
| Steppers fully visible at arrival (before scored) | 2 of 4 | **4 of 4** | Task 7 Step 7 probe |
| CTA visible at scroll-top | no (y=1877) | **yes** | Task 7 Step 7 probe |
| `.hcp-dots` contrast in sunlight | 1.9:1 | **≥ 4.5:1** | Task 8 Step 4 probe |
| Swing on a non-latest hole | n/a | **absent** | Task 6 Step 5 |
| Back from Play | exits app | **Home** | Task 9 Step 3 |

Then clear the seeded data: `localStorage.clear(); location.reload();`
