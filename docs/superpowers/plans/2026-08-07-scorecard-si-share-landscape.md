# Scorecard Stroke Index, Scorecard Sharing, and Landscape Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stroke-index row to the scorecard, make the scorecard shareable as a brand-matched PNG alongside the existing results card, and let the app expand in landscape — all working identically for regular and league rounds.

**Architecture:** A new pure module `scorecardModel.ts` computes the entire grid — hole/par/SI header, per-cell scores and stroke markers, per-player totals — from a `Round`. Both the on-screen `Scorecard.tsx` and the new `scorecardCard.ts` canvas renderer consume that one model, so the shared PNG cannot drift from what the screen shows. Canvas chrome shared by both share cards moves to `shareCanvas.ts`. Landscape needs two changes, not one: the CSS width cap *and* the PWA manifest's orientation lock.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4 (`environment: 'node'`), Canvas 2D API, vite-plugin-pwa.

## Global Constraints

- **Vitest runs in `environment: 'node'` with `include: ['src/**/*.test.ts']`.** There is no jsdom and no React Testing Library. Component rendering and canvas drawing are **not unit-testable** in this project. All automated tests go against pure functions in `.test.ts` files. Do not add jsdom, RTL, or `.test.tsx` files — that is a toolchain change outside this plan's scope.
- **This is why `scorecardModel.ts` exists.** The spec called for unit tests of "SI row values" and "league stroke markers on the scorecard". Those are only testable if the logic lives outside the component. Extracting the model is what makes the spec's stated test plan achievable — it is not gold-plating.
- **Stroke index is always visible.** Not gated on `usesHandicaps(round)` or on whether real course indexes were provided.
- **League parity is a requirement, not a nice-to-have.** Every change ships working for both `options.league` rounds and regular rounds.
- **Brand constants are fixed** and must be identical across both share cards: `BG #0b3d2e`, `CREAM #f4f7f2`, `MUTED rgba(244, 247, 242, 0.62)`, `GOLD #e7b53c`, `BRIGHT #57d9a3`, `RED #ff8a7e`. Display face is Oswald; numerics are `ui-monospace, Menlo, monospace`.
- **Verify layout at 874×390 (phone landscape) and 402×554 (the viewport real Safari reports).** Not the 375×812 emulator default, which is 258px taller than the device actually reports. See `docs/superpowers/specs/2026-08-06-press-attribution-feedback-design.md:342`.
- **Commands:** `npm test` (vitest run), `npm run typecheck`, `npm run lint` (oxlint), `npm run build`.
- Every task ends with `npm test && npm run typecheck && npm run lint` passing before its commit.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/scorecardModel.ts` | Create | Pure: `Round` → grid model (holes with SI, per-cell score/mark/markers, per-player totals). Single source of truth for both renderers. |
| `src/scorecardModel.test.ts` | Create | Unit tests for the above. |
| `src/components/Scorecard.tsx` | Modify | Renders the model. Gains the SI row and league chips; loses its own computation. |
| `src/shareCanvas.ts` | Create | Brand chrome shared by both share cards: colors, font helpers, `fit`, `dashedRule`, header block, crop-and-frame tail. |
| `src/shareCard.ts` | Modify | Keeps standings/settlement/league layout; imports chrome from `shareCanvas.ts`. |
| `src/scorecardCard.ts` | Create | Renders the grid model to a landscape PNG. |
| `src/screens/Results.tsx` | Modify | `shareImage()` helper extracted from the inline pipeline; paired primary share buttons. |
| `src/index.css` | Modify | SI row styling, scorecard chip styling, paired-button row, landscape media query. |
| `vite.config.ts` | Modify | PWA manifest `orientation`. |
| `CHANGELOG.md` | Modify | Unreleased entry. |

---

## Task 1: Scorecard model

The pure core. Everything else depends on it.

**Files:**
- Create: `src/scorecardModel.ts`
- Test: `src/scorecardModel.test.ts`

**Interfaces:**
- Consumes: `strokeIndexMap`, `strokesReceivedOnHole`, `usesHandicaps` from `src/games/handicap.ts`; `leagueStrokesOnHole` and type `LeagueMatchKey` from `src/games/league.ts`; `scoreMarkClass` from `src/scoreMark.ts`; types from `src/types.ts`.
- Produces:
  ```ts
  export interface ScorecardHole { number: number; par: number; strokeIndex: number }
  export interface ScorecardCell {
    holeNumber: number;
    score: number | null;
    toPar: number;              // 0 when score is null
    markClass: string;          // '' when score is null
    dots: number;               // non-league net rounds; 0 otherwise
    chips: LeagueMatchKey[];    // league rounds; [] otherwise
  }
  export interface ScorecardRow {
    playerId: string;
    name: string;
    handicap: number;
    cells: ScorecardCell[];
    gross: number | null;       // null when no holes played
    toPar: number | null;       // vs par of played holes only; null when none played
  }
  export interface ScorecardModel {
    holes: ScorecardHole[];
    parTotal: number;
    showHandicap: boolean;
    rows: ScorecardRow[];
  }
  export function buildScorecard(round: Round): ScorecardModel
  export function formatToPar(n: number): string
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/scorecardModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildScorecard, formatToPar } from './scorecardModel';
import { makeRound, player, holes, scoresFrom } from './games/testFixtures';
import type { LeagueSetup } from './types';

const FOUR = [
  player('p1', 'Al', 9),
  player('p2', 'Bo', 4),
  player('p3', 'Cy', 12),
  player('p4', 'Di', 2),
];

function league(pointsPerMatch = 2): LeagueSetup {
  return {
    teams: [
      { name: 'Team 1', aId: 'p1', bId: 'p2' },
      { name: 'Team 2', aId: 'p3', bId: 'p4' },
    ],
    pointsPerMatch,
  };
}

describe('buildScorecard — stroke index row', () => {
  it('uses the real course stroke indexes when every hole has one', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, strokeIndex: 7 },
        { number: 2, par: 5, strokeIndex: 1 },
        { number: 3, par: 3, strokeIndex: 15 },
      ],
    });
    expect(buildScorecard(round).holes.map((h) => h.strokeIndex)).toEqual([7, 1, 15]);
  });

  it('falls back to sequential indexing by hole number when none are provided', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4 },
        { number: 2, par: 5 },
        { number: 3, par: 3 },
      ],
    });
    expect(buildScorecard(round).holes.map((h) => h.strokeIndex)).toEqual([1, 2, 3]);
  });

  it('falls back when only some holes have a stroke index', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4, strokeIndex: 7 },
        { number: 2, par: 5 },
        { number: 3, par: 3, strokeIndex: 15 },
      ],
    });
    expect(buildScorecard(round).holes.map((h) => h.strokeIndex)).toEqual([1, 2, 3]);
  });

  it('keeps play order, not hole-number order, for a rotated start', () => {
    const round = makeRound({
      holes: [
        { number: 3, par: 4, strokeIndex: 15 },
        { number: 1, par: 4, strokeIndex: 7 },
        { number: 2, par: 5, strokeIndex: 1 },
      ],
    });
    const model = buildScorecard(round);
    expect(model.holes.map((h) => h.number)).toEqual([3, 1, 2]);
    expect(model.holes.map((h) => h.strokeIndex)).toEqual([15, 7, 1]);
  });

  it('pairs the fallback index with the right hole when play order is rotated', () => {
    const round = makeRound({
      holes: [
        { number: 3, par: 4 },
        { number: 1, par: 4 },
        { number: 2, par: 5 },
      ],
    });
    const model = buildScorecard(round);
    expect(model.holes.map((h) => h.number)).toEqual([3, 1, 2]);
    // strokeIndexMap ranks by ascending hole number, so hole 3 ranks 3rd.
    expect(model.holes.map((h) => h.strokeIndex)).toEqual([3, 1, 2]);
  });
});

describe('buildScorecard — stroke markers', () => {
  it('gives dots and no chips on a net non-league round', () => {
    const hs = holes(9);
    const round = makeRound({
      players: [player('p1', 'Al', 9)],
      holes: hs,
      options: { useNet: true },
    });
    const row = buildScorecard(round).rows[0];
    expect(row.cells.map((c) => c.dots)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(row.cells.every((c) => c.chips.length === 0)).toBe(true);
  });

  it('gives no markers on a gross round', () => {
    const round = makeRound({
      players: [player('p1', 'Al', 9)],
      holes: holes(9),
      options: { useNet: false },
    });
    const row = buildScorecard(round).rows[0];
    expect(row.cells.every((c) => c.dots === 0 && c.chips.length === 0)).toBe(true);
  });

  // Regression guard: league rounds ship useNet: false but still score net.
  // Gating markers on useNet showed a league round zero stroke allocation.
  it('gives chips on a league round despite useNet being false', () => {
    const hs = holes(9);
    const round = makeRound({
      players: FOUR,
      holes: hs,
      options: { league: league() },
    });
    expect(round.options.useNet).toBe(false);
    const model = buildScorecard(round);
    const cy = model.rows.find((r) => r.playerId === 'p3')!;
    expect(cy.cells.some((c) => c.chips.length > 0)).toBe(true);
    expect(cy.cells.every((c) => c.dots === 0)).toBe(true);
  });

  it('matches leagueStrokesOnHole exactly, hole for hole', async () => {
    const { leagueStrokesOnHole } = await import('./games/league');
    const hs = holes(9);
    const round = makeRound({ players: FOUR, holes: hs, options: { league: league() } });
    const model = buildScorecard(round);
    for (const row of model.rows) {
      hs.forEach((h, i) => {
        expect(row.cells[i].chips).toEqual(leagueStrokesOnHole(round, h)[row.playerId]);
      });
    }
  });
});

describe('buildScorecard — totals and header', () => {
  it('totals gross and to-par over played holes only', () => {
    const hs = holes(9, 4);
    const scores = scoresFrom(hs, { p1: [5, 3, 4, undefined, undefined, undefined, undefined, undefined, undefined] });
    const round = makeRound({ players: [player('p1', 'Al')], holes: hs, scores });
    const row = buildScorecard(round).rows[0];
    expect(row.gross).toBe(12);
    // 3 played holes of par 4 = 12; 12 - 12 = E
    expect(row.toPar).toBe(0);
  });

  it('reports null totals when nothing is scored', () => {
    const round = makeRound({ players: [player('p1', 'Al')], holes: holes(9) });
    const row = buildScorecard(round).rows[0];
    expect(row.gross).toBeNull();
    expect(row.toPar).toBeNull();
  });

  it('sums par across every hole', () => {
    const round = makeRound({
      holes: [
        { number: 1, par: 4 },
        { number: 2, par: 5 },
        { number: 3, par: 3 },
      ],
    });
    expect(buildScorecard(round).parTotal).toBe(12);
  });

  it('marks scores with the golf circle/square convention', () => {
    const hs = holes(3, 4);
    const scores = scoresFrom(hs, { p1: [3, 4, 6] });
    const round = makeRound({ players: [player('p1', 'Al')], holes: hs, scores });
    const cells = buildScorecard(round).rows[0].cells;
    expect(cells[0].markClass).toBe('mark mark-circle');
    expect(cells[1].markClass).toBe('');
    expect(cells[2].markClass).toBe('mark mark-square mark-double');
  });

  it('shows handicaps for net and league rounds, not for gross', () => {
    const net = makeRound({ options: { useNet: true } });
    const lg = makeRound({ players: FOUR, options: { league: league() } });
    const gross = makeRound({ options: { useNet: false } });
    expect(buildScorecard(net).showHandicap).toBe(true);
    expect(buildScorecard(lg).showHandicap).toBe(true);
    expect(buildScorecard(gross).showHandicap).toBe(false);
  });

  it('defaults a missing handicap to 0', () => {
    const round = makeRound({ players: [player('p1', 'Al')], options: { useNet: true } });
    expect(buildScorecard(round).rows[0].handicap).toBe(0);
  });
});

describe('formatToPar', () => {
  it('renders even, over, and under', () => {
    expect(formatToPar(0)).toBe('E');
    expect(formatToPar(3)).toBe('+3');
    expect(formatToPar(-2)).toBe('-2');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- scorecardModel`
Expected: FAIL — `Failed to resolve import "./scorecardModel"`.

- [ ] **Step 3: Write the implementation**

Create `src/scorecardModel.ts`:

```ts
import type { Round } from './types';
import { strokeIndexMap, strokesReceivedOnHole, usesHandicaps } from './games/handicap';
import { leagueStrokesOnHole, type LeagueMatchKey } from './games/league';
import { scoreMarkClass } from './scoreMark';

/**
 * The scorecard grid, computed once from a Round. Both the on-screen table and
 * the shareable PNG render from this, so the image can't drift from the screen.
 */

export interface ScorecardHole {
  number: number;
  par: number;
  strokeIndex: number;
}

export interface ScorecardCell {
  holeNumber: number;
  score: number | null;
  /** 0 when there's no score. */
  toPar: number;
  /** '' when there's no score. */
  markClass: string;
  /** Handicap strokes received — non-league net rounds only. */
  dots: number;
  /** Which matches give a stroke here — league rounds only. */
  chips: LeagueMatchKey[];
}

export interface ScorecardRow {
  playerId: string;
  name: string;
  handicap: number;
  cells: ScorecardCell[];
  /** null when the player has no scores yet. */
  gross: number | null;
  /** Against the par of played holes only. null when none played. */
  toPar: number | null;
}

export interface ScorecardModel {
  holes: ScorecardHole[];
  parTotal: number;
  showHandicap: boolean;
  rows: ScorecardRow[];
}

export const formatToPar = (n: number): string =>
  n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`;

export function buildScorecard(round: Round): ScorecardModel {
  const siMap = strokeIndexMap(round);
  const isLeague = round.options.league != null;
  const useNet = round.options.useNet;
  const total = round.holes.length;

  // League strokes come off three baselines, so a dot count would be ambiguous
  // about which match a stroke applies to — HoleView names the matches with
  // chips for the same reason. leagueStrokesOnHole recomputes its baselines on
  // every call, so build the whole map once rather than calling per cell.
  const chipsByHole: Record<number, Record<string, LeagueMatchKey[]>> = {};
  if (isLeague) {
    for (const h of round.holes) chipsByHole[h.number] = leagueStrokesOnHole(round, h);
  }

  const holes: ScorecardHole[] = round.holes.map((h) => ({
    number: h.number,
    par: h.par,
    strokeIndex: siMap[h.number],
  }));

  const rows: ScorecardRow[] = round.players.map((p) => {
    const handicap = p.handicap ?? 0;
    let gross = 0;
    let playedPar = 0;
    let played = 0;

    const cells: ScorecardCell[] = round.holes.map((h) => {
      const score = round.scores[h.number]?.[p.id] ?? null;
      if (score != null) {
        gross += score;
        playedPar += h.par;
        played += 1;
      }
      return {
        holeNumber: h.number,
        score,
        toPar: score == null ? 0 : score - h.par,
        markClass: score == null ? '' : scoreMarkClass(score - h.par),
        dots:
          !isLeague && useNet
            ? strokesReceivedOnHole(handicap, siMap[h.number], total)
            : 0,
        chips: isLeague ? (chipsByHole[h.number][p.id] ?? []) : [],
      };
    });

    return {
      playerId: p.id,
      name: p.name,
      handicap,
      cells,
      gross: played ? gross : null,
      toPar: played ? gross - playedPar : null,
    };
  });

  return {
    holes,
    parTotal: round.holes.reduce((s, h) => s + h.par, 0),
    showHandicap: usesHandicaps(round),
    rows,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- scorecardModel`
Expected: PASS, 16 tests.

- [ ] **Step 5: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass, no regressions in the existing suites.

- [ ] **Step 6: Commit**

```bash
git add src/scorecardModel.ts src/scorecardModel.test.ts
git commit -m "Extract the scorecard grid into a testable model"
```

---

## Task 2: Scorecard renders the model, with SI row and league chips

**Files:**
- Modify: `src/components/Scorecard.tsx` (full rewrite of the render body)
- Modify: `src/index.css` (add `.sc-si-row`, `.sc-chips`, `.sc-chip`; move the header border)

**Interfaces:**
- Consumes: `buildScorecard`, `formatToPar`, type `ScorecardModel` from Task 1.
- Produces: no new exports. `Scorecard`'s props are unchanged, so `Play.tsx` needs no edit.

**Note:** No unit test — this is a component, and the project has no DOM test environment (see Global Constraints). Task 1 covers the logic; Task 7 covers the visual verification.

- [ ] **Step 1: Rewrite the component**

Replace the whole of `src/components/Scorecard.tsx`:

```tsx
import { useState } from 'react';
import type { Round } from '../types';
import { buildScorecard, formatToPar } from '../scorecardModel';
import { clampScore } from '../scoreEntry';

interface Props {
  round: Round;
  currentHole?: number;
  onJumpToHole?: (index: number) => void;
  onScore?: (holeNumber: number, playerId: string, value: number | null) => void;
}

/** Full-round grid: holes across, players down. Tap a cell to type a score directly. */
export function Scorecard({ round, currentHole, onJumpToHole, onScore }: Props) {
  const model = buildScorecard(round);
  const [editing, setEditing] = useState<{ playerId: string; holeNumber: number } | null>(null);

  // Clamped to the same 1..15 range the stepper enforces; empty clears the score.
  const commit = (playerId: string, holeNumber: number, raw: string) => {
    if (!onScore) return;
    const value = clampScore(raw);
    if (value === undefined) return;
    onScore(holeNumber, playerId, value);
  };

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

  return (
    <div className="card-scroll">
      <table className="scorecard">
        <thead>
          <tr>
            <th className="sc-corner">Hole</th>
            {model.holes.map((h, i) => (
              <th
                key={h.number}
                className={`sc-hole${h.number === currentHole ? ' current' : ''}`}
                {...jumpProps(i)}
              >
                {h.number}
              </th>
            ))}
            <th className="sc-total">Tot</th>
            <th className="sc-total">+/−</th>
          </tr>
          <tr className="sc-par-row">
            <th className="sc-corner">Par</th>
            {model.holes.map((h) => (
              <td key={h.number}>{h.par}</td>
            ))}
            <td className="sc-total">{model.parTotal}</td>
            <td className="sc-total" />
          </tr>
          {/* Stroke index is a fact about the course, so it shows in gross play too. */}
          <tr className="sc-si-row">
            <th className="sc-corner" title="Stroke index — hole difficulty rank">
              SI
            </th>
            {model.holes.map((h) => (
              <td key={h.number}>{h.strokeIndex}</td>
            ))}
            <td className="sc-total" />
            <td className="sc-total" />
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <tr key={row.playerId}>
              <th className="sc-name">
                <span className="sc-name-text">{row.name}</span>
                {model.showHandicap && (
                  <span className="sc-hcp" aria-label={`Handicap ${row.handicap}`}>
                    {row.handicap}
                  </span>
                )}
              </th>
              {row.cells.map((cell) => {
                const tone =
                  cell.score == null
                    ? ''
                    : cell.toPar < 0
                      ? ' under'
                      : cell.toPar > 0
                        ? ' over'
                        : ' even';
                const isEditing =
                  editing?.playerId === row.playerId && editing?.holeNumber === cell.holeNumber;
                return (
                  <td
                    key={cell.holeNumber}
                    className={`sc-cell${tone}${cell.holeNumber === currentHole ? ' current' : ''}`}
                  >
                    {isEditing ? (
                      <input
                        className="sc-input"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={15}
                        autoFocus
                        defaultValue={cell.score ?? ''}
                        onBlur={(e) => {
                          commit(row.playerId, cell.holeNumber, e.target.value);
                          setEditing(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                    ) : (
                      <button
                        className="sc-cell-btn"
                        onClick={() =>
                          onScore &&
                          setEditing({ playerId: row.playerId, holeNumber: cell.holeNumber })
                        }
                        aria-label={`${row.name}, hole ${cell.holeNumber}${
                          cell.score != null ? `, ${cell.score}` : ', no score'
                        }`}
                      >
                        {cell.score != null && (
                          <span className={cell.markClass}>{cell.score}</span>
                        )}
                        {cell.dots > 0 && (
                          <span className="sc-dots">{'•'.repeat(cell.dots)}</span>
                        )}
                        {cell.chips.length > 0 && (
                          <span
                            className="sc-chips"
                            aria-label={`Gets a stroke in: ${cell.chips.join(', ')}`}
                          >
                            {cell.chips.map((k) => (
                              <span key={k} className="sc-chip">
                                {k}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                );
              })}
              <td className="sc-total">{row.gross ?? ''}</td>
              <td className="sc-total">{row.toPar == null ? '' : formatToPar(row.toPar)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Move the header border and add the new styles**

In `src/index.css`, find the `.sc-par-row` block (near line 1861) and **remove `border-bottom` from it**, so it reads:

```css
.sc-par-row td,
.sc-par-row th {
  color: var(--muted);
  font-size: 0.75rem;
}
```

Immediately after it, add:

```css
/* The header block closes under SI, not under Par — the border moved down when
   the stroke-index row was added. */
.sc-si-row td,
.sc-si-row th {
  color: var(--muted);
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  border-bottom: 1px solid var(--line);
}
```

Then find the `.sc-dots` block (near line 1893) and add after it:

```css
/* League strokes come off three baselines, so the cell names the matches
   instead of counting dots — same convention as HoleStepper's .lg-chip. */
.sc-chips {
  position: absolute;
  top: 1px;
  right: 2px;
  display: inline-flex;
  gap: 1px;
  line-height: 1;
}
.sc-chip {
  font-size: 0.44rem;
  font-weight: 700;
  line-height: 1;
  padding: 1px 2px;
  border-radius: 2px;
  color: var(--gold-ink);
  border: 1px solid currentColor;
}
:root.dark .sc-chip {
  color: var(--gold);
}
```

- [ ] **Step 3: Run the gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. The `strokeIndexMap` / `strokesReceivedOnHole` / `usesHandicaps` / `scoreMarkClass` imports are gone from `Scorecard.tsx`; oxlint will flag them if any were left behind.

- [ ] **Step 4: Commit**

```bash
git add src/components/Scorecard.tsx src/index.css
git commit -m "Show stroke index on the scorecard and fix missing league strokes

The Card tab gated stroke markers on useNet, but league rounds ship
useNet: false while still scoring net — so a league round showed handicap
badges beside every name and not one stroke marker in the grid. It now
branches like HoleView does, naming the matches with chips."
```

---

## Task 3: Extract shared canvas chrome

Pure refactor. No behavior change — the results card must render identically before and after.

**Files:**
- Create: `src/shareCanvas.ts`
- Modify: `src/shareCard.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export const BG: string, CREAM: string, MUTED: string, GOLD: string, BRIGHT: string, RED: string
  export function disp(weight: number, size: number): string
  export function mono(size: number): string
  export function setLS(ctx: CanvasRenderingContext2D, px: number): void
  export function up(s: string): string
  export function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string
  export function dashedRule(ctx: CanvasRenderingContext2D, y: number, x0: number, x1: number): void
  export function loadDisplayFonts(): Promise<unknown>
  export interface HeaderOpts {
    ctx: CanvasRenderingContext2D; width: number; pad: number;
    title: string; meta: string; y: number;
  }
  export function drawHeader(o: HeaderOpts): number   // returns the new y
  export function finishCard(work: HTMLCanvasElement, width: number, height: number): Promise<Blob>
  ```

- [ ] **Step 1: Capture the "before" reference image**

The results card has no automated test — the only way to prove this refactor is behavior-neutral is to compare renders.

```bash
npm run dev
```

In the browser: open a saved round → Results → **Share results**. Save the produced PNG as `/tmp/press-results-before.png`. If no saved round exists, create a 4-player round with stakes set and a few holes scored so the card includes standings *and* a settlement block. Also capture a **league** round's card as `/tmp/press-league-before.png` — `shareCard.ts` has a separate league branch and both must be checked.

- [ ] **Step 2: Create the shared module**

Create `src/shareCanvas.ts`:

```ts
/**
 * Brand chrome shared by every shareable card: the clubhouse-scoreboard look —
 * dark green board, gold trim, condensed caps. Layout lives in the individual
 * card renderers; only the frame and the type live here.
 */

export const BG = '#0b3d2e';
export const CREAM = '#f4f7f2';
export const MUTED = 'rgba(244, 247, 242, 0.62)';
export const GOLD = '#e7b53c';
export const BRIGHT = '#57d9a3';
export const RED = '#ff8a7e';

export const disp = (weight: number, size: number) => `${weight} ${size}px Oswald, sans-serif`;
export const mono = (size: number) => `${size}px ui-monospace, Menlo, monospace`;

export const setLS = (ctx: CanvasRenderingContext2D, px: number) => {
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
};

export const up = (s: string) => s.toUpperCase();

/** Truncates with an ellipsis so text never collides with a right column. */
export function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

export function dashedRule(
  ctx: CanvasRenderingContext2D,
  y: number,
  x0: number,
  x1: number
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(231, 181, 60, 0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.restore();
}

/** The display face must be resident before canvas text is measured. */
export const loadDisplayFonts = () =>
  Promise.all([document.fonts.load('500 52px Oswald'), document.fonts.load('600 72px Oswald')]);

export interface HeaderOpts {
  ctx: CanvasRenderingContext2D;
  width: number;
  pad: number;
  title: string;
  meta: string;
  y: number;
}

/** Wordmark, course title shrunk to one line, meta line, gold rule. Returns the new y. */
export function drawHeader({ ctx, width, pad, title, meta, y }: HeaderOpts): number {
  const maxw = width - pad * 2;

  ctx.fillStyle = GOLD;
  ctx.font = disp(600, 34);
  setLS(ctx, 9);
  ctx.textAlign = 'center';
  ctx.fillText('PRESS', width / 2, y);
  setLS(ctx, 0);
  y += 78;

  const t = up(title);
  let size = 72;
  ctx.font = disp(600, size);
  setLS(ctx, 3);
  while (size > 44 && ctx.measureText(t).width > maxw) {
    size -= 4;
    ctx.font = disp(600, size);
  }
  ctx.fillStyle = CREAM;
  ctx.fillText(t, width / 2, y);
  setLS(ctx, 0);
  y += 54;

  ctx.fillStyle = MUTED;
  ctx.font = disp(500, 28);
  setLS(ctx, 3);
  ctx.fillText(up(meta), width / 2, y);
  setLS(ctx, 0);
  y += 44;

  ctx.strokeStyle = 'rgba(231, 181, 60, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(width - pad, y);
  ctx.stroke();
  y += 24;

  ctx.textAlign = 'left';
  return y;
}

/** Crops the oversized work canvas to `height`, frames it in gold, and encodes. */
export function finishCard(
  work: HTMLCanvasElement,
  width: number,
  height: number
): Promise<Blob> {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const octx = out.getContext('2d')!;
  octx.drawImage(work, 0, 0);
  octx.strokeStyle = 'rgba(231, 181, 60, 0.6)';
  octx.lineWidth = 3;
  octx.strokeRect(26, 26, width - 52, height - 52);
  octx.strokeStyle = 'rgba(231, 181, 60, 0.25)';
  octx.lineWidth = 1.5;
  octx.strokeRect(38, 38, width - 76, height - 76);

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas toBlob failed'))),
      'image/png'
    );
  });
}
```

- [ ] **Step 3: Rewire `shareCard.ts` onto it**

In `src/shareCard.ts`:

1. Delete lines 12–52 (the `BG`/`CREAM`/… constants, `disp`, `mono`, `setLS`, `up`, `fmtPts`'s neighbours `fit` and `dashedRule`) — but **keep `fmtPts`**, which is results-specific.
2. Replace the import block at the top with:

```ts
import type { Round } from './types';
import { activeResults } from './games';
import { computeLeague } from './games/league';
import { computeSettlement, formatMoney } from './games/settlement';
import {
  CREAM, MUTED, GOLD, BRIGHT, RED, BG,
  disp, mono, setLS, up, fit, dashedRule,
  loadDisplayFonts, drawHeader, finishCard,
} from './shareCanvas';

/**
 * Renders round results as a clubhouse-scoreboard PNG for sharing.
 * Draws on an oversized canvas while tracking y, then crops to fit.
 */

const W = 1080;
const PAD = 84;
const MAXW = W - PAD * 2;

const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
```

3. Replace the function's opening (old lines 54–113, from `export async function` through `ctx.textAlign = 'left';`) with:

```ts
export async function renderShareCard(round: Round): Promise<Blob> {
  await loadDisplayFonts();

  const work = document.createElement('canvas');
  work.width = W;
  work.height = 3200;
  const ctx = work.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, work.width, work.height);
  ctx.textBaseline = 'alphabetic';

  let y = drawHeader({
    ctx,
    width: W,
    pad: PAD,
    title: round.course || 'Golf round',
    meta: `${round.date} · ${round.players.length} players · ${round.holes.length} holes`,
    y: PAD + 36,
  });
```

4. Update all three `dashedRule(ctx, y)` call sites to `dashedRule(ctx, y, PAD, W - PAD)`.

5. Replace the tail (old lines 261–280, from `// Crop to content and frame it` to the end) with:

```ts
  return finishCard(work, W, y);
}
```

- [ ] **Step 4: Verify the render is unchanged**

```bash
npm test && npm run typecheck && npm run lint
```

Then `npm run dev`, share the **same** round again, and compare against `/tmp/press-results-before.png`. Repeat for the league round against `/tmp/press-league-before.png`.

Expected: visually identical. Any difference means the refactor changed something it shouldn't have — fix it before committing rather than accepting the new output.

- [ ] **Step 5: Commit**

```bash
git add src/shareCanvas.ts src/shareCard.ts
git commit -m "Extract shared share-card chrome into shareCanvas"
```

---

## Task 4: Scorecard PNG renderer

**Files:**
- Create: `src/scorecardCard.ts`

**Interfaces:**
- Consumes: `buildScorecard`, `formatToPar`, types `ScorecardModel`/`ScorecardRow` from Task 1; everything from `shareCanvas.ts` in Task 3.
- Produces: `export async function renderScorecardCard(round: Round): Promise<Blob>`

**Note:** No unit test — canvas drawing is not testable in `environment: 'node'`. Verified visually in this task's Step 3.

- [ ] **Step 1: Write the renderer**

Create `src/scorecardCard.ts`:

```ts
import type { Round } from './types';
import { buildScorecard, formatToPar, type ScorecardModel } from './scorecardModel';
import {
  BG, CREAM, MUTED, GOLD,
  disp, mono, setLS, up, fit,
  loadDisplayFonts, drawHeader, finishCard,
} from './shareCanvas';

/**
 * Renders the hole-by-hole grid as a landscape PNG in the same clubhouse livery
 * as the results card. Width scales with hole count so a 9-hole league night
 * doesn't come out half empty.
 */

const PAD = 64;
const NAME_W = 250;
const TOTAL_W = 96;
const ROW_H = 74;
const HEAD_ROW_H = 46;

/** Column width per hole, floored so 9-hole rounds stay proportionate. */
const holeColWidth = (count: number) => (count > 12 ? 56 : 78);

function boardWidth(model: ScorecardModel): number {
  const cols = model.holes.length * holeColWidth(model.holes.length);
  return PAD * 2 + NAME_W + cols + TOTAL_W * 2;
}

/** Centers text in a column. */
function center(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

export async function renderScorecardCard(round: Round): Promise<Blob> {
  await loadDisplayFonts();

  const model = buildScorecard(round);
  const holeW = holeColWidth(model.holes.length);
  const W = boardWidth(model);

  const work = document.createElement('canvas');
  work.width = W;
  work.height = 600 + model.rows.length * ROW_H + 400;
  const ctx = work.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, work.width, work.height);
  ctx.textBaseline = 'alphabetic';

  let y = drawHeader({
    ctx,
    width: W,
    pad: PAD,
    title: round.course || 'Golf round',
    meta: `${round.date} · ${round.players.length} players · ${model.holes.length} holes`,
    y: PAD + 36,
  });

  const gridX = PAD + NAME_W;
  const colX = (i: number) => gridX + i * holeW + holeW / 2;
  const totX = gridX + model.holes.length * holeW + TOTAL_W / 2;
  const parX = totX + TOTAL_W;

  // ---- Header rows: Hole, Par, SI ----
  y += HEAD_ROW_H;
  ctx.font = disp(600, 30);
  ctx.fillStyle = GOLD;
  setLS(ctx, 2);
  ctx.fillText('HOLE', PAD, y);
  model.holes.forEach((h, i) => center(ctx, `${h.number}`, colX(i), y));
  center(ctx, 'TOT', totX, y);
  center(ctx, '+/−', parX, y);
  setLS(ctx, 0);

  y += HEAD_ROW_H - 6;
  ctx.font = disp(500, 26);
  ctx.fillStyle = MUTED;
  setLS(ctx, 2);
  ctx.fillText('PAR', PAD, y);
  model.holes.forEach((h, i) => center(ctx, `${h.par}`, colX(i), y));
  center(ctx, `${model.parTotal}`, totX, y);
  setLS(ctx, 0);

  y += HEAD_ROW_H - 8;
  ctx.font = disp(500, 24);
  ctx.fillStyle = MUTED;
  setLS(ctx, 2);
  ctx.fillText('SI', PAD, y);
  model.holes.forEach((h, i) => center(ctx, `${h.strokeIndex}`, colX(i), y));
  setLS(ctx, 0);

  y += 20;
  ctx.strokeStyle = 'rgba(231, 181, 60, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  // ---- Player rows ----
  for (const row of model.rows) {
    const base = y + ROW_H - 22;

    // Name, with handicap when the round scores net.
    ctx.font = disp(500, 36);
    ctx.fillStyle = CREAM;
    setLS(ctx, 2);
    const hcpText = model.showHandicap ? `  ${row.handicap}` : '';
    let hcpW = 0;
    if (hcpText) {
      ctx.font = mono(26);
      hcpW = ctx.measureText(hcpText).width;
      ctx.font = disp(500, 36);
    }
    ctx.fillText(fit(ctx, up(row.name), NAME_W - 20 - hcpW), PAD, base);
    if (hcpText) {
      const nameW = ctx.measureText(fit(ctx, up(row.name), NAME_W - 20 - hcpW)).width;
      setLS(ctx, 0);
      ctx.font = mono(26);
      ctx.fillStyle = MUTED;
      ctx.fillText(hcpText, PAD + nameW, base);
      setLS(ctx, 2);
    }
    setLS(ctx, 0);

    // Per-hole scores.
    row.cells.forEach((cell, i) => {
      const cx = colX(i);
      if (cell.score != null) {
        // Circle under par, square over, doubled at ±2 — the same convention
        // scoreMark.ts encodes as CSS classes for the screen.
        const mark = cell.markClass;
        if (mark) {
          ctx.strokeStyle = cell.toPar < 0 ? GOLD : 'rgba(255, 138, 126, 0.85)';
          ctx.lineWidth = 2;
          const r = 22;
          const drawMark = (rr: number) => {
            ctx.beginPath();
            if (cell.toPar < 0) ctx.arc(cx, base - 11, rr, 0, Math.PI * 2);
            else ctx.rect(cx - rr, base - 11 - rr, rr * 2, rr * 2);
            ctx.stroke();
          };
          drawMark(r);
          if (mark.includes('mark-double')) drawMark(r - 6);
        }
        ctx.font = mono(32);
        ctx.fillStyle = cell.toPar < 0 ? GOLD : CREAM;
        center(ctx, `${cell.score}`, cx, base);
      }

      // Stroke markers, top-right of the cell — dots for net, match keys for league.
      if (cell.dots > 0) {
        ctx.font = mono(20);
        ctx.fillStyle = GOLD;
        center(ctx, '•'.repeat(cell.dots), cx + holeW / 2 - 12, base - 30);
      } else if (cell.chips.length > 0) {
        ctx.font = disp(600, 18);
        ctx.fillStyle = GOLD;
        center(ctx, cell.chips.join(''), cx + holeW / 2 - 14, base - 30);
      }
    });

    // Totals.
    ctx.font = mono(34);
    ctx.fillStyle = CREAM;
    center(ctx, row.gross == null ? '' : `${row.gross}`, totX, base);
    ctx.fillStyle = row.toPar != null && row.toPar < 0 ? GOLD : CREAM;
    center(ctx, row.toPar == null ? '' : formatToPar(row.toPar), parX, base);

    y += ROW_H;
  }

  // ---- Footer ----
  y += 40;
  ctx.font = disp(500, 25);
  ctx.fillStyle = GOLD;
  setLS(ctx, 7);
  ctx.textAlign = 'center';
  ctx.fillText('SCORED WITH PRESS', W / 2, y);
  setLS(ctx, 0);
  ctx.textAlign = 'left';
  y += PAD - 20;

  return finishCard(work, W, y);
}
```

- [ ] **Step 2: Run the gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: pass. (No new tests — this task's verification is Step 3.)

- [ ] **Step 3: Verify the render by eye**

`npm run dev`. Temporarily wire the renderer to the existing Results share button to see output before Task 5 builds the real UI — in `src/screens/Results.tsx`, change the import of `renderShareCard` to `renderScorecardCard` from `../scorecardCard` and call it in `share()`. **Revert this before committing.**

Render and inspect four rounds:

1. **18-hole net non-league round, 4 players, most holes scored** — dots present on the right players' holes, circles on birdies, squares on bogeys, doubled ring on an eagle or double bogey. Board is ~1400px wide.
2. **9-hole league round, 4 players** — `A`/`B`/`T` chips present, board ~1000px wide and not half empty.
3. **A round with only 2 holes scored** — Tot and +/− reflect played holes only; unscored cells are blank, not `0`.
4. **A long course name and a long player name** — both truncate with an ellipsis rather than overlapping the grid.

Check specifically that stroke markers don't collide with the score digit at the narrower 56px column used for 18 holes. If they do, shrink the marker rather than dropping it.

- [ ] **Step 4: Revert the temporary wiring and commit**

```bash
git checkout src/screens/Results.tsx
git add src/scorecardCard.ts
git commit -m "Render the scorecard grid as a shareable PNG"
```

---

## Task 5: Paired share buttons on Results

**Files:**
- Modify: `src/screens/Results.tsx:115-256`
- Modify: `src/index.css` (add `.share-row`)

**Interfaces:**
- Consumes: `renderScorecardCard` from Task 4; `renderShareCard` from `src/shareCard.ts` (unchanged export).
- Produces: no new exports.

- [ ] **Step 1: Extract the share pipeline and add the second button**

In `src/screens/Results.tsx`:

1. Add to the imports:

```ts
import { renderScorecardCard } from '../scorecardCard';
```

2. Replace the `share` function (lines 147–176) with a parameterized helper plus two callers:

```ts
  // Scoreboard PNG first; falls back to a download, then to the text path.
  // The busy state covers only the canvas render — the share sheet can stay
  // open (or hang, on some desktop browsers) without freezing the button.
  const shareImage = async (
    render: () => Promise<Blob>,
    filename: string,
    setBusy: (v: boolean) => void
  ) => {
    setBusy(true);
    let file: File;
    let blobUrl: string;
    try {
      const blob = await render();
      file = new File([blob], filename, { type: 'image/png' });
      blobUrl = URL.createObjectURL(blob);
    } catch {
      setBusy(false);
      await shareText();
      return;
    }
    setBusy(false);
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Golf round results' });
      } else {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.click();
      }
    } catch (err) {
      // User closed the share sheet — not a failure, don't fall through.
      if ((err as Error)?.name !== 'AbortError') await shareText();
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  };

  const shareResults = () =>
    shareImage(() => renderShareCard(round), 'press-results.png', setRendering);
  const shareScorecard = () =>
    shareImage(() => renderScorecardCard(round), 'press-scorecard.png', setRenderingCard);
```

3. Add the second busy state next to the existing one (line 117):

```ts
  const [rendering, setRendering] = useState(false);
  const [renderingCard, setRenderingCard] = useState(false);
```

4. Replace the single share button (lines 238–246) with the paired row:

```tsx
      <div className="share-row">
        <button className="btn-primary big" onClick={shareResults} disabled={rendering}>
          {rendering ? (
            'Building…'
          ) : (
            <>
              <ShareIcon size={18} /> Share results
            </>
          )}
        </button>
        <button className="btn-primary big" onClick={shareScorecard} disabled={renderingCard}>
          {renderingCard ? (
            'Building…'
          ) : (
            <>
              <ShareIcon size={18} /> Share scorecard
            </>
          )}
        </button>
      </div>
```

- [ ] **Step 2: Style the row**

In `src/index.css`, immediately before the existing `.share-text` block (near line 1900), add:

```css
/* Two share CTAs of equal weight — results and the hole-by-hole card. */
.share-row {
  display: flex;
  gap: 10px;
}
.share-row .btn-primary {
  flex: 1;
  min-width: 0;
}
```

- [ ] **Step 3: Run the gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: pass.

- [ ] **Step 4: Verify both buttons**

`npm run dev`, open a finished round → Results. At the 402px-wide viewport, confirm:

- Both buttons fit side by side without their labels wrapping or truncating. If "Share scorecard" wraps at 402px, shorten the labels to "Results" and "Scorecard" under a shared `<ShareIcon>` rather than letting them clip.
- Each button renders its own card and opens the share sheet.
- Closing the share sheet without sharing does **not** fall through to the text/clipboard path.
- One button spinning does not disable the other.
- Both buttons appear on a **league** round too.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Results.tsx src/index.css
git commit -m "Add a scorecard share button beside the results one"
```

---

## Task 6: Landscape

**Files:**
- Modify: `vite.config.ts:41`
- Modify: `src/index.css`

**Interfaces:** none — CSS and build config only.

**Why two changes, not one:** the spec identified `.app { max-width: 540px }` as the cause. That's half of it. The PWA manifest at `vite.config.ts:41` sets `orientation: 'portrait'`, which locks the **installed** app to portrait — it will not rotate at all, no matter what the CSS says. Since the installed PWA is this project's documented target (see the 2026-08-06 spec), that lock is very likely the behavior actually being reported. Both must change.

- [ ] **Step 1: Unlock rotation in the manifest**

In `vite.config.ts`, change line 41 from:

```ts
        orientation: 'portrait',
```

to:

```ts
        // 'portrait' locked the installed app so it would not rotate at all,
        // regardless of CSS. Landscape is supported now — see the landscape
        // media query in index.css.
        orientation: 'any',
```

- [ ] **Step 2: Widen the layout in landscape**

In `src/index.css`, immediately after the `.app` block (near line 98), add:

```css
/* A phone in landscape is ~874px wide. 900px is effectively full width there
   while still capping line length on a tablet or desktop browser, where an
   uncapped Setup or Results screen would stretch text to an unreadable measure.
   The scorecard is the real beneficiary: 18 holes fit without horizontal scroll. */
@media (orientation: landscape) {
  .app {
    max-width: 900px;
  }
}
```

Then find the `.sheet` block (near line 2060) and add immediately after it:

```css
/* Sheets carry their own cap and must track .app's, or they look pinched
   against a wider page in landscape. */
@media (orientation: landscape) {
  .sheet {
    max-width: 900px;
  }
}
```

- [ ] **Step 3: Run the gate**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: pass. `npm run build` matters here — it regenerates `dist/manifest.webmanifest`; confirm it now contains `"orientation":"any"`.

- [ ] **Step 4: Verify**

`npm run dev`, then at 874×390:

- The layout fills the width instead of sitting in a 540px column.
- Play → Card shows all 18 holes with no horizontal scroll on an 18-hole round.
- Home, Setup, Results, and the settings sheet all still read sensibly at 900px.
- At 402×554 (portrait) nothing changed — the media query must not leak.

Expect the Hole tab to remain vertically cramped at 390px tall. That is the documented, accepted limitation — do not compress the scoring UI to fix it.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts src/index.css
git commit -m "Let the app expand in landscape

Two things pinned it portrait: .app's 540px cap, and the PWA manifest's
orientation: 'portrait', which stopped the installed app rotating at all
regardless of CSS."
```

---

## Task 7: Full verification pass and changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run the whole gate clean**

```bash
npm test && npm run typecheck && npm run lint && npm run build
```

- [ ] **Step 2: Walk both round types end to end**

`npm run dev`. For a **regular net round** and a **league round**, at 402×554 and again at 874×390:

| Check | Where |
|---|---|
| SI row present, values correct | Play → Card |
| SI row present on a course with no stroke indexes (sequential fallback) | Play → Card |
| League round shows `A`/`B`/`T` chips in cells | Play → Card, league round |
| Net non-league round shows dots | Play → Card |
| Chips/dots don't collide with the score digit | Play → Card |
| Tapping a cell still opens the inline editor and saves | Play → Card |
| Tapping a hole header still jumps to that hole | Play → Card |
| Both share buttons render and open the share sheet | Results |
| Scorecard PNG matches what the Card tab shows | Results → Share scorecard |
| Results PNG unchanged from before this work | Results → Share results |
| Layout fills the width | landscape, every screen |

- [ ] **Step 3: Write the changelog entry**

In `CHANGELOG.md`, under `## [Unreleased]` → `### Added`, add at the top of the list:

```markdown
- **Stroke index on the scorecard**: the Card tab now carries an SI row under
  Hole and Par, showing each hole's difficulty rank — the number that decides
  where handicap strokes fall. It shows in gross rounds too, since it's a fact
  about the course rather than about how you're scoring.
- **Share the scorecard**: Results now has two share buttons. "Share results"
  is the existing standings-and-settlement scoreboard; "Share scorecard" is new
  — the full hole-by-hole grid as a landscape PNG in the same clubhouse livery,
  with pars, stroke indexes, every player's card, and circle/square marks. The
  board widens with the hole count, so a 9-hole league night doesn't come out
  half empty.
- **Landscape**: turning the phone sideways now expands the app across the
  screen instead of leaving it in a narrow column — the scorecard fits all 18
  holes without scrolling sideways. The installed app was previously locked to
  portrait by its manifest and wouldn't rotate at all.
```

Then add a `### Fixed` section after `### Added` (or add to it if one exists):

```markdown
- **League rounds showed no handicap strokes on the scorecard**: the Card tab
  decided whether to draw stroke markers from the `useNet` flag, which league
  rounds don't set even though they score net. The result was a card showing
  each player's handicap beside their name and not a single stroke marker in
  the grid. It now names the matches a stroke applies to — `A`, `B`, `T` — the
  same way the Hole view already did.
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "Document the scorecard, sharing, and landscape work"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1. Stroke index row | 1 (logic), 2 (render + CSS) |
| 2. League stroke markers | 1 (logic + regression test), 2 (render + CSS) |
| 3. `shareCanvas.ts` extraction | 3 |
| 3. `scorecardCard.ts` | 4 |
| 3. Results paired buttons + `shareImage` extraction | 5 |
| 4. Landscape | 6 |
| Testing — unit | 1 |
| Testing — manual/canvas | 3 (Step 4), 4 (Step 3), 5 (Step 4), 6 (Step 4), 7 (Step 2) |
| Viewport verification at 874×390 and 402×554 | 6, 7 |

**Deviations from the spec, both deliberate:**

1. **`scorecardModel.ts` is new** — the spec described modifying `Scorecard.tsx` in place. But the spec's own test plan ("SI row values", "league stroke markers resolve to the same match keys") is impossible against a component in a project with `environment: 'node'` and no RTL. Extracting the model is what makes those tests writable, and it has the side benefit of guaranteeing the PNG matches the screen. Recorded in Global Constraints.

2. **Landscape needs the manifest change too** — the spec identified only the CSS cap. `vite.config.ts:41` sets `orientation: 'portrait'`, which locks the installed PWA against rotating regardless of CSS. Since the installed PWA is the documented target, this is likely the actual reported cause. Added to Task 6 with a note.

**Placeholder scan:** no TBDs, no "add error handling", no "similar to Task N". Every code step carries the actual code.

**Type consistency:** `buildScorecard` / `formatToPar` / `ScorecardModel` / `ScorecardRow` / `ScorecardCell` / `ScorecardHole` are defined in Task 1 and used with those exact names in Tasks 2 and 4. `dashedRule` gains `x0`/`x1` params in Task 3 and all three call sites are updated in the same task. `renderScorecardCard` is defined in Task 4 and consumed in Task 5. `shareImage(render, filename, setBusy)` is defined and both callers written in Task 5.
