# Approachable Round Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the New Round screen from 2.4 screens and 30 controls to Players plus four collapsed summary rows, and recall players from saved rounds so a returning group starts a round in two taps.

**Architecture:** Two new pure modules (`src/roster.ts`, `src/setupSummary.ts`) carry all the logic and all the tests. A new presentational `SetupRow` disclosure component wraps each collapsed section. `Setup.tsx` is rewired to use them; Match Play teams, Nassau teams and Options move inside the Games row rather than remaining top-level sections. No scoring code, no `Round` shape change, no new storage key.

**Tech Stack:** Vite + React 19 + TypeScript, vitest (node environment), oxlint. Plain CSS in `src/index.css`.

**Spec:** `docs/superpowers/specs/2026-08-25-press-setup-approachability-design.md`

## Global Constraints

- **Vitest runs in the `node` environment** and `include` is `['src/**/*.test.ts']` — `.ts` only. There is no jsdom and no React Testing Library. **Do not write component tests.** Pure modules get vitest; UI is verified in the browser.
- **Start Round must stay enabled at all times.** It is enabled on arrival today and that must not regress — it is the property this whole design protects.
- **Rows toggle independently.** Not an accordion; opening one must never close another.
- **Games starts expanded when `listRounds().length === 0`**, collapsed otherwise.
- **The crew chip replaces the player list wholesale**, it does not merge.
- **Roster cap is 12 entries.**
- **No new storage key.** Everything derives from `listRounds()`.
- Every task ends green on `npm run typecheck && npm run lint && npm test`.
- Commit messages: imperative mood, no `feat:`/`fix:` prefixes (match existing history), and end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `src/roster.ts` | Derive remembered players and the last crew from saved rounds. Pure. |
| Create `src/roster.test.ts` | Tests for the above. |
| Create `src/setupSummary.ts` | Format each collapsed row's summary string. Pure. |
| Create `src/setupSummary.test.ts` | Tests for the above. |
| Create `src/components/SetupRow.tsx` | Presentational disclosure row: label, summary, chevron, expanded children. |
| Create `src/components/RosterChips.tsx` | Crew chip + recent-player chips. |
| Modify `src/screens/Setup.tsx` | Rewire into Players + four `SetupRow`s; consolidate teams/options into Games. |
| Modify `src/index.css` | Styles for `SetupRow` and the chips. |

---

### Task 1: Roster derivation

**Files:**
- Create: `src/roster.ts`
- Test: `src/roster.test.ts`

**Interfaces:**
- Consumes: `Round`, `Player` from `src/types.ts`.
- Produces:
  - `interface RosterEntry { name: string; handicap?: number }`
  - `buildRoster(rounds: Round[]): RosterEntry[]`
  - `lastCrew(rounds: Round[]): RosterEntry[]`
  - `isFirstEverRound(rounds: Round[]): boolean`
  - `const ROSTER_LIMIT = 12`

`listRounds()` already returns rounds sorted newest-first by `updatedAt`. Every function here assumes that order and must not re-sort.

- [ ] **Step 1: Write the failing tests**

Create `src/roster.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildRoster, lastCrew, isFirstEverRound, ROSTER_LIMIT } from './roster';
import { makeRound, player, holes18 } from './games/testFixtures';
import type { Round } from './types';

/** Rounds newest-first, matching what listRounds() returns. */
function rounds(...players: ReturnType<typeof player>[][]): Round[] {
  return players.map((ps) => makeRound({ players: ps, holes: holes18() }));
}

describe('buildRoster', () => {
  it('lists distinct players most-recent-first', () => {
    const rs = rounds(
      [player('a', 'Marcus'), player('b', 'Dave')],
      [player('c', 'Jesse'), player('d', 'Big Tony')]
    );
    expect(buildRoster(rs).map((e) => e.name)).toEqual([
      'Marcus',
      'Dave',
      'Jesse',
      'Big Tony',
    ]);
  });

  it('skips blank and whitespace-only names', () => {
    // Abandoned rounds routinely carry the two default blank players.
    const rs = rounds([player('a', ''), player('b', '   '), player('c', 'Jesse')]);
    expect(buildRoster(rs).map((e) => e.name)).toEqual(['Jesse']);
  });

  it('trims surrounding whitespace off names it keeps', () => {
    const rs = rounds([player('a', '  Jesse  ')]);
    expect(buildRoster(rs)[0].name).toBe('Jesse');
  });

  it('dedupes case-insensitively, keeping the most recent spelling', () => {
    const rs = rounds([player('a', 'Big Tony')], [player('b', 'big tony')]);
    expect(buildRoster(rs).map((e) => e.name)).toEqual(['Big Tony']);
  });

  it('carries the handicap from the most recent round that had one', () => {
    const rs = rounds([player('a', 'Jesse')], [player('b', 'Jesse', 12)]);
    expect(buildRoster(rs)[0]).toEqual({ name: 'Jesse', handicap: 12 });
  });

  it('prefers a newer handicap over an older one', () => {
    const rs = rounds([player('a', 'Jesse', 10)], [player('b', 'Jesse', 12)]);
    expect(buildRoster(rs)[0].handicap).toBe(10);
  });

  it('omits handicap entirely for a player who has never had one', () => {
    const rs = rounds([player('a', 'Jesse')]);
    expect(buildRoster(rs)[0]).toEqual({ name: 'Jesse' });
  });

  it(`caps the roster at ${ROSTER_LIMIT} entries`, () => {
    const many = Array.from({ length: 30 }, (_, i) => [player(`p${i}`, `Player ${i}`)]);
    expect(buildRoster(rounds(...many))).toHaveLength(ROSTER_LIMIT);
  });

  it('returns an empty roster with no rounds', () => {
    expect(buildRoster([])).toEqual([]);
  });
});

describe('lastCrew', () => {
  it('returns the newest round players in order, with handicaps', () => {
    const rs = rounds(
      [player('a', 'Jesse', 12), player('b', 'Marcus', 4)],
      [player('c', 'Someone Else')]
    );
    expect(lastCrew(rs)).toEqual([
      { name: 'Jesse', handicap: 12 },
      { name: 'Marcus', handicap: 4 },
    ]);
  });

  it('returns [] with no rounds', () => {
    expect(lastCrew([])).toEqual([]);
  });

  it('returns [] when the newest round has fewer than two named players', () => {
    // A round abandoned at setup is not a crew worth offering.
    const rs = rounds([player('a', 'Jesse'), player('b', '')]);
    expect(lastCrew(rs)).toEqual([]);
  });
});

describe('isFirstEverRound', () => {
  it('is true only with no saved rounds', () => {
    expect(isFirstEverRound([])).toBe(true);
    expect(isFirstEverRound(rounds([player('a', 'Jesse')]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/roster.test.ts`
Expected: FAIL — `Failed to resolve import "./roster"`.

- [ ] **Step 3: Write the implementation**

Create `src/roster.ts`:

```ts
import type { Round } from './types';

/** A remembered player, derived from saved rounds rather than stored. */
export interface RosterEntry {
  name: string;
  /** Most recent handicap seen for this name; absent if never set. */
  handicap?: number;
}

/** The chip row is a shortcut, not a directory. */
export const ROSTER_LIMIT = 12;

/** Trimmed name, or '' for a player who was never named. */
const nameOf = (name: string): string => name.trim();

/**
 * Distinct players across every saved round, most-recent-first.
 *
 * Callers pass `listRounds()`, which is already sorted newest-first, so
 * "first seen while walking" means "most recent" throughout — that is what
 * makes both the spelling and the handicap rules below one-liners. Do not
 * sort here; re-sorting would silently invert both.
 */
export function buildRoster(rounds: Round[]): RosterEntry[] {
  const byKey = new Map<string, RosterEntry>();

  for (const round of rounds) {
    for (const p of round.players) {
      const name = nameOf(p.name);
      // Setup seeds every new round with two blank players, so abandoned
      // rounds are full of them. They must never reach the roster.
      if (!name) continue;

      const key = name.toLowerCase();
      const seen = byKey.get(key);

      if (!seen) {
        byKey.set(key, p.handicap == null ? { name } : { name, handicap: p.handicap });
      } else if (seen.handicap == null && p.handicap != null) {
        // Keeps a handicap alive for someone whose recent rounds were gross,
        // rather than dropping it because the newest round happened not to
        // carry one.
        seen.handicap = p.handicap;
      }
    }
  }

  return [...byKey.values()].slice(0, ROSTER_LIMIT);
}

/**
 * The players of the most recent round, in that round's order — the "same
 * crew" shortcut. Empty when there is nothing worth offering.
 */
export function lastCrew(rounds: Round[]): RosterEntry[] {
  const latest = rounds[0];
  if (!latest) return [];

  const named: RosterEntry[] = [];
  for (const p of latest.players) {
    const name = nameOf(p.name);
    if (!name) continue;
    named.push(p.handicap == null ? { name } : { name, handicap: p.handicap });
  }

  // One named player is a round someone abandoned during setup, not a crew.
  return named.length >= 2 ? named : [];
}

/** True when this user has never saved a round — drives first-run affordances. */
export function isFirstEverRound(rounds: Round[]): boolean {
  return rounds.length === 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/roster.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass; only the two pre-existing `TeamPicker` fast-refresh warnings from oxlint.

- [ ] **Step 6: Commit**

```bash
git add src/roster.ts src/roster.test.ts
git commit -m "Derive a player roster from saved rounds

Press stores every past round with its players' names and handicaps but
has never offered them back, so Setup opens with two blank name fields
even when you played with the same four people last week. This adds the
derivation; the UI follows.

Pure, and keyed off listRounds()'s existing newest-first order so that
'first seen while walking' means 'most recent' — which is what makes the
spelling and handicap rules one-liners rather than date comparisons.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Row summary formatters

**Files:**
- Create: `src/setupSummary.ts`
- Test: `src/setupSummary.test.ts`

**Interfaces:**
- Consumes: `Hole`, `GameType`, `Stakes` from `src/types.ts`; `gameMeta` from `src/games/index.ts`.
- Produces:
  - `courseSummary(course: string): string`
  - `holesSummary(holes: Hole[]): string`
  - `gamesSummary(games: GameType[]): string`
  - `stakesSummary(games: GameType[], stakes: Stakes): string`

These strings are the feature, not decoration: a row that says `18 holes · par 72` tells a newcomer the question is already answered. Every function must return something meaningful for the empty case — never `''`.

- [ ] **Step 1: Write the failing tests**

Create `src/setupSummary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  courseSummary,
  holesSummary,
  gamesSummary,
  stakesSummary,
} from './setupSummary';
import { holes, holes18 } from './games/testFixtures';

describe('courseSummary', () => {
  it('names the course when set', () => {
    expect(courseSummary('Prairie Landing')).toBe('Prairie Landing');
  });

  it('trims before deciding whether it is set', () => {
    expect(courseSummary('   ')).toBe('Not set');
    expect(courseSummary('  Prairie Landing ')).toBe('Prairie Landing');
  });

  it('says Not set when empty', () => {
    expect(courseSummary('')).toBe('Not set');
  });
});

describe('holesSummary', () => {
  it('counts holes and totals par', () => {
    expect(holesSummary(holes18())).toBe('18 holes · par 72');
  });

  it('handles a nine', () => {
    expect(holesSummary(holes(9))).toBe('9 holes · par 36');
  });

  it('reports no holes rather than an empty string', () => {
    expect(holesSummary([])).toBe('No holes');
  });
});

describe('gamesSummary', () => {
  it('names a single game', () => {
    expect(gamesSummary(['skins'])).toBe('Skins');
  });

  it('joins several in selection order', () => {
    expect(gamesSummary(['skins', 'wolf'])).toBe('Skins, Wolf');
  });

  it('says No games when none are selected', () => {
    expect(gamesSummary([])).toBe('No games');
  });
});

describe('stakesSummary', () => {
  it('says No stakes when nothing is staked', () => {
    expect(stakesSummary(['skins'], {})).toBe('No stakes');
  });

  it('treats a zero stake as unstaked', () => {
    // StakesEditor writes 0 when a field is cleared, so 0 and absent must read
    // the same or a cleared field would keep claiming money is on the line.
    expect(stakesSummary(['skins'], { skins: 0 })).toBe('No stakes');
  });

  it('lists staked games with their amounts', () => {
    expect(stakesSummary(['skins', 'wolf'], { skins: 5, wolf: 2 })).toBe(
      '$5 Skins · $2 Wolf'
    );
  });

  it('lists only staked games, skipping the rest', () => {
    expect(stakesSummary(['skins', 'wolf'], { skins: 5 })).toBe('$5 Skins');
  });

  it('ignores stakes for games no longer selected', () => {
    // Deselecting a game leaves its stake behind in options.stakes.
    expect(stakesSummary(['skins'], { skins: 5, wolf: 99 })).toBe('$5 Skins');
  });

  it('keeps a decimal stake readable', () => {
    expect(stakesSummary(['skins'], { skins: 2.5 })).toBe('$2.50 Skins');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/setupSummary.test.ts`
Expected: FAIL — `Failed to resolve import "./setupSummary"`.

- [ ] **Step 3: Write the implementation**

Create `src/setupSummary.ts`:

```ts
import type { Hole, GameType, Stakes } from './types';
import { gameMeta } from './games';

/**
 * One-line summaries for the collapsed rows on New Round.
 *
 * These carry real weight: a row showing "18 holes · par 72" tells a
 * first-time user the question is already answered, which is what makes
 * skipping it feel safe rather than negligent. Every function therefore
 * returns a meaningful string for the empty case — never ''.
 */

export function courseSummary(course: string): string {
  const name = course.trim();
  return name || 'Not set';
}

export function holesSummary(holes: Hole[]): string {
  if (holes.length === 0) return 'No holes';
  const par = holes.reduce((sum, h) => sum + h.par, 0);
  return `${holes.length} holes · par ${par}`;
}

export function gamesSummary(games: GameType[]): string {
  if (games.length === 0) return 'No games';
  return games.map((g) => gameMeta(g).label).join(', ');
}

/** `$5` for whole dollars, `$2.50` otherwise. */
function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export function stakesSummary(games: GameType[], stakes: Stakes): string {
  // Driven by `games`, not by the keys of `stakes`: deselecting a game leaves
  // its stake behind in options.stakes, and that money is not in play.
  const staked = games
    .filter((g) => (stakes?.[g] ?? 0) > 0)
    .map((g) => `${money(stakes[g] as number)} ${gameMeta(g).label}`);

  return staked.length === 0 ? 'No stakes' : staked.join(' · ');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/setupSummary.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/setupSummary.ts src/setupSummary.test.ts
git commit -m "Add row summaries for the New Round screen

Each collapsed row will name its own current value, so the screen reads
as four settled facts rather than four unanswered questions. Every
formatter returns something for the empty case — a row reading only
'Holes & pars ›' would restore exactly the anxiety the collapse removes.

stakesSummary is driven by the selected games rather than the keys of
options.stakes, because deselecting a game leaves its stake behind and
that money is not in play.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: SetupRow disclosure component

**Files:**
- Create: `src/components/SetupRow.tsx`
- Modify: `src/index.css` (append a `Setup rows` section near the other Setup styles)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SetupRow` with props
  `{ label: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode }`

There is no DOM test environment, so this task is verified in the browser, not by vitest.

- [ ] **Step 1: Write the component**

Create `src/components/SetupRow.tsx`:

```tsx
interface Props {
  /** Row title, e.g. "Holes & pars". */
  label: string;
  /** Current value, e.g. "18 holes · par 72". Never empty — see setupSummary.ts. */
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * One collapsible section of New Round: a tappable header showing the
 * section's current value, with its controls revealed in place.
 *
 * Expansion is controlled by the parent so rows toggle independently — this
 * is deliberately not an accordion. Opening Games must not silently close
 * Course; someone comparing two rows should not have to fight the screen.
 */
export function SetupRow({ label, summary, open, onToggle, children }: Props) {
  return (
    <div className={`setup-row${open ? ' open' : ''}`}>
      <button
        className="setup-row-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="setup-row-label">{label}</span>
        <span className="setup-row-summary">{summary}</span>
        <span className="setup-row-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      {open && <div className="setup-row-body">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Add the styles**

Append to `src/index.css`:

```css
/* ---- New Round collapsible rows -------------------------------------------
   Each row names its own current value so the screen reads as settled facts
   rather than unanswered questions. Grouped into one card so four rows read
   as a short list, not four separate panels. */
.setup-rows {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}
.setup-row + .setup-row {
  border-top: 1px solid var(--line);
}
.setup-row-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: var(--tap);
  padding: 10px 14px;
  text-align: left;
}
.setup-row-label {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.setup-row-summary {
  color: var(--muted);
  font-size: 0.88rem;
  text-align: right;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.setup-row-chevron {
  color: var(--muted);
  font-size: 1.2rem;
  line-height: 1;
  transition: transform 0.16s ease;
}
.setup-row.open .setup-row-chevron {
  transform: rotate(90deg);
}
.setup-row-body {
  padding: 0 14px 14px;
}
/* The row's own card supplies the frame, so nested sections must not draw a
   second one inside it. */
.setup-row-body .card {
  background: none;
  border: 0;
  border-radius: 0;
  padding: 0;
}
@media (prefers-reduced-motion: reduce) {
  .setup-row-chevron {
    transition: none;
  }
}
```

- [ ] **Step 3: Verify it typechecks and lints**

Run: `npm run typecheck && npm run lint`
Expected: PASS. The component is not yet rendered anywhere; that is Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/components/SetupRow.tsx src/index.css
git commit -m "Add the SetupRow disclosure component

A tappable header carrying the section's current value, with its
controls revealed in place. Expansion is controlled by the parent so
rows toggle independently rather than behaving as an accordion —
opening Games must not silently close Course.

Not wired up yet; Setup adopts it next.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Restructure Setup into rows

**Files:**
- Modify: `src/screens/Setup.tsx`

**Interfaces:**
- Consumes: `SetupRow` (Task 3); `courseSummary`, `holesSummary`, `gamesSummary`, `stakesSummary` (Task 2); `isFirstEverRound` (Task 1).
- Produces: no new exports.

The existing JSX for each section moves inside a row **unchanged** — same components, same handlers, same state. This task is a re-parenting, not a rewrite. Resist editing section internals here; a diff that also changes behaviour is one no reviewer can check.

- [ ] **Step 1: Add row state and the summaries**

In `src/screens/Setup.tsx`, add these imports alongside the existing ones:

```tsx
import { SetupRow } from '../components/SetupRow';
import { courseSummary, holesSummary, gamesSummary, stakesSummary } from '../setupSummary';
import { isFirstEverRound } from '../roster';
import { listRounds } from '../storage';
```

`listCourses` is already imported from `../storage`; extend that import rather than adding a second one.

Add near the other `useState` calls:

```tsx
// Which rows are expanded. Independent flags, not an accordion.
// Games opens on a first-ever round: collapsing it is the one part of this
// design that costs something real — a newcomer never learning Wolf or Nassau
// exist — and this buys that back for the only person who needs it, at no
// cost to every round after. Read once on mount; a round saved later in this
// session must not reshuffle the screen underneath the user.
const [openRows, setOpenRows] = useState<Record<string, boolean>>(() => ({
  games: isFirstEverRound(listRounds()),
}));

const toggleRow = (key: string) =>
  setOpenRows((rows) => ({ ...rows, [key]: !rows[key] }));
```

- [ ] **Step 2: Wrap the four sections in rows**

Replace the top-level sections in the returned JSX. Players stays exactly where it is, directly after the `<header className="bar">`. Everything after Players becomes:

```tsx
<div className="setup-rows">
  <SetupRow
    label="Course"
    summary={courseSummary(course)}
    open={!!openRows.course}
    onToggle={() => toggleRow('course')}
  >
    <CourseSearch value={course} onChange={setCourse} onPick={loadFromApi} />
    {/* the existing `courses.length > 0` saved-course block moves here verbatim */}
  </SetupRow>

  <SetupRow
    label="Games"
    summary={gamesSummary(games)}
    open={!!openRows.games}
    onToggle={() => toggleRow('games')}
  >
    {/* the existing Side games <section>, both TeamPickers, and the
        Options <section> all move here verbatim, in that order */}
  </SetupRow>

  <SetupRow
    label="Holes & pars"
    summary={holesSummary(holes)}
    open={!!openRows.holes}
    onToggle={() => toggleRow('holes')}
  >
    {/* the existing Holes <section> moves here verbatim */}
  </SetupRow>

  <SetupRow
    label="Money"
    summary={stakesSummary(games, options.stakes)}
    open={!!openRows.money}
    onToggle={() => toggleRow('money')}
  >
    {/* the existing Money <section> moves here verbatim */}
  </SetupRow>
</div>
```

The Money row renders unconditionally now. Its old `games.length > 0` guard is redundant: with no games `stakesSummary` reads `No stakes` and the expanded `StakesEditor` renders nothing, which is a truthful empty state rather than a vanished row.

Delete the now-duplicated `<h2>` headings inside the moved sections — the row label replaces them.

- [ ] **Step 3: Verify the gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. No test touches `Setup.tsx`, so the suite should be unchanged at its current count.

- [ ] **Step 4: Verify in the browser**

Start the preview (`preview_start` with the `press-golf-dev` config, never `npm run dev` in a shell) at 375×812 and check:

1. With saved rounds present: Players open; four collapsed rows reading `Not set`, `Skins`, `18 holes · par 72`, `No stakes`; Start Round enabled.
2. `document.documentElement.scrollHeight` is well under the 1912px baseline.
3. Tapping Course opens it; tapping Games then leaves Course open (independent toggling).
4. Changing the hole count to 9 updates the Holes summary to `9 holes · par 36` while collapsed.
5. Selecting Wolf updates the Games summary and reveals the Wolf options inside that row.
6. Selecting Nassau with 4 named players reveals the Nassau `TeamPicker` inside the Games row.
7. `localStorage.removeItem('press.rounds.v1')` then reload: Games is expanded.
8. Repeat 1 and 3 in light and glare, and in landscape.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Setup.tsx
git commit -m "Collapse New Round into Players plus four summary rows

Measured on a fresh install, New Round was 1912px — 2.4 screens — and 30
controls across nine sections, presented as though all 30 were decisions.
Most are not decisions that must be made now: pars and stroke indexes are
editable from the Card tab, handicaps from Edit handicaps, stakes from the
Board. The Money section already said so in its own hint.

Course, Games, Holes & pars and Money become rows naming their current
value, collapsed by default. Match Play teams, Nassau teams and Options
move inside Games, since they exist only as consequences of a game
selection — nine sections become four rows plus Players.

Section internals are re-parented unchanged. Start Round stays enabled
throughout, which is the property this whole change protects.

Games opens on a first-ever round so a newcomer still meets Wolf and
Nassau; the flag is read once on mount so saving a round mid-session
cannot reshuffle the screen underneath the user.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Player recall chips

**Files:**
- Create: `src/components/RosterChips.tsx`
- Modify: `src/screens/Setup.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `RosterEntry`, `buildRoster`, `lastCrew` (Task 1).
- Produces: `RosterChips` with props
  `{ crew: RosterEntry[]; recent: RosterEntry[]; onUseCrew: () => void; onAdd: (entry: RosterEntry) => void }`

- [ ] **Step 1: Write the component**

Create `src/components/RosterChips.tsx`:

```tsx
import type { RosterEntry } from '../roster';

interface Props {
  /** The last round's players. Empty hides the crew chip. */
  crew: RosterEntry[];
  /** Remembered players not already in the form. Empty hides the row. */
  recent: RosterEntry[];
  onUseCrew: () => void;
  onAdd: (entry: RosterEntry) => void;
}

/** At most this many names before the crew chip elides the rest. */
const CREW_NAMES_SHOWN = 3;

function crewLabel(crew: RosterEntry[]): string {
  const shown = crew.slice(0, CREW_NAMES_SHOWN).map((e) => e.name).join(', ');
  const rest = crew.length - CREW_NAMES_SHOWN;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

/**
 * Shortcuts that fill the player list from past rounds.
 *
 * Both groups render nothing when they have nothing to offer — on a
 * first-ever round this component is simply absent. An empty affordance
 * ("no saved players yet") is worse than an absent one.
 */
export function RosterChips({ crew, recent, onUseCrew, onAdd }: Props) {
  if (crew.length === 0 && recent.length === 0) return null;

  return (
    <>
      {crew.length > 0 && (
        <button className="crew-chip" onClick={onUseCrew}>
          <span className="crew-chip-title">Same crew</span>
          <span className="crew-chip-names">{crewLabel(crew)}</span>
        </button>
      )}
      {recent.length > 0 && (
        <div className="recent-chips">
          <span className="recent-chips-label">Recent</span>
          {recent.map((e) => (
            <button
              key={e.name}
              className="recent-chip"
              onClick={() => onAdd(e)}
              aria-label={`Add ${e.name}`}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Add the styles**

Append to `src/index.css`:

```css
/* ---- Player recall chips -------------------------------------------------- */
.crew-chip {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  min-height: var(--tap);
  margin-bottom: 10px;
  padding: 8px 14px;
  border: 1px dashed var(--green-600);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--fairway) 10%, transparent);
  text-align: left;
}
.crew-chip-title {
  font-family: var(--font-display);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--green-700);
  flex: 0 0 auto;
}
:root.dark .crew-chip-title {
  color: var(--fairway);
}
.crew-chip-names {
  color: var(--muted);
  font-size: 0.88rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.recent-chips-label {
  font-size: 0.78rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.recent-chip {
  min-height: 36px;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg);
  color: var(--ink);
  font-size: 0.88rem;
}
```

- [ ] **Step 3: Wire it into Setup**

In `src/screens/Setup.tsx`, add:

```tsx
import { RosterChips } from '../components/RosterChips';
import { buildRoster, lastCrew, isFirstEverRound, type RosterEntry } from '../roster';
```

(extend the Task 4 `roster` import rather than adding a second one).

Add near the other state, after `players`:

```tsx
// Read once on mount: the roster must not shift while the user is typing.
const [savedRounds] = useState(() => listRounds());
const crew = lastCrew(savedRounds);
const roster = buildRoster(savedRounds);

const inForm = new Set(players.map((p) => p.name.trim().toLowerCase()).filter(Boolean));
const recent = roster.filter((e) => !inForm.has(e.name.toLowerCase()));

// The crew chip is a shortcut, not a merge: replacing is predictable, merging
// is not. Hidden once the list already matches, so it never offers a no-op.
const crewMatches =
  crew.length === players.length &&
  crew.every((e, i) => e.name === players[i].name.trim());

const useCrew = () =>
  setPlayers(
    crew.map((e) => ({ id: uid(), name: e.name, handicap: e.handicap }))
  );

const addFromRoster = (e: RosterEntry) =>
  setPlayers((ps) => [...ps, { id: uid(), name: e.name, handicap: e.handicap }]);
```

`uid` is already imported from `../storage` for player ids; confirm it is in that import and add it if not.

Render inside the Players section — the crew chip above the player rows, the recent chips below `+ Add player`:

```tsx
<RosterChips
  crew={crewMatches ? [] : crew}
  recent={recent}
  onUseCrew={useCrew}
  onAdd={addFromRoster}
/>
```

Place this component once, immediately after `<h2>Players</h2>`. It renders the crew chip first and the recent row after; if the visual order needs the recent chips below `+ Add player` instead, split the two renders rather than reordering inside the component.

- [ ] **Step 4: Verify the gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 5: Verify in the browser**

With at least two saved rounds containing named players:

1. The crew chip shows the last round's names; tapping it fills the player list with those names and handicaps.
2. After tapping it, the chip disappears (the list now matches the crew).
3. Recent chips exclude anyone already in the form, and adding one appends them with their handicap.
4. `localStorage.removeItem('press.rounds.v1')` then reload: no crew chip, no recent row, no empty-state text.
5. A round whose players are all blank contributes no chips.
6. Start Round is still enabled at every point above.
7. Check the chips in light, dark and glare.

- [ ] **Step 6: Commit**

```bash
git add src/components/RosterChips.tsx src/screens/Setup.tsx src/index.css
git commit -m "Recall players from past rounds on New Round

The expensive part of setup on a first tee was never the dropdowns you
can scroll past — it was typing four names on a phone while the group
waits, names press.rounds.v1 was already holding.

A crew chip repeats the last round's players; recent chips offer anyone
else you have played with, minus those already in the form. The crew chip
replaces the list rather than merging into it, because replacing is
predictable and merging is not, and it hides once the list already
matches so it never offers a no-op.

Both groups are absent rather than empty on a first-ever round: an empty
affordance is worse than an absent one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Device verification and measurement

**Files:** none — this task produces evidence, not code.

- [ ] **Step 1: Measure the result against the baseline**

With the preview running at 375×812 and a fresh install (`localStorage.clear()`, reload), record:

- `document.documentElement.scrollHeight` (baseline: 1912px)
- Count of `input, select, [role=radio], .game-card` (baseline: 30)
- Whether Start Round is enabled on arrival (baseline: yes — must stay yes)

- [ ] **Step 2: Count taps for the returning-group case**

With saved rounds present, count taps from Home to hole 1 using the crew chip. The design target is two taps inside Setup (crew chip, Start Round).

- [ ] **Step 3: Verify on a real device**

Push the branch, open a PR, wait for the Netlify deploy preview, then **load it and reload once** — the service worker serves the previous build's shell on first load. Confirm the loaded `<link rel=stylesheet>` hash matches a cache-busted fetch of `/` before trusting anything you see.

Check on the phone: row tap targets, the crew chip, and that the screen reads as calm rather than sparse.

- [ ] **Step 4: Report**

Report the before/after numbers and the tap count. If the screen now reads as *too* empty — a real risk when four rows replace nine sections — say so rather than declaring success; that is a design signal worth acting on, not a defect to hide.

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Players open, four collapsed rows | 4 |
| Row summaries showing current value | 2, 4 |
| Rows toggle independently | 3 (parent-controlled), 4 |
| Teams + Options consolidated into Games | 4 |
| Games expanded on a first-ever round | 1 (`isFirstEverRound`), 4 |
| Crew chip, replacing not merging, hidden when matching | 1, 5 |
| Recent chips excluding names already in the form | 1, 5 |
| Roster: skip blanks, case-insensitive dedupe, recent handicap, cap 12 | 1 |
| `lastCrew` empty for no rounds / fewer than two named | 1 |
| No empty states on a first-ever round | 5 |
| No new storage key, no scoring change | all — nothing touches `src/games/*` or `storage.ts` |
| Device verification before calling it done | 6 |

No gaps.

**Placeholder scan:** none — every code step carries real code. The three `{/* moves here verbatim */}` markers in Task 4 point at existing blocks in a named file rather than describing work to invent, and Task 4 Step 2 states the order explicitly.

**Type consistency:** `RosterEntry` is defined in Task 1 and consumed with the same shape in Task 5. `buildRoster` / `lastCrew` / `isFirstEverRound` signatures match between Tasks 1, 4 and 5. `SetupRow`'s props in Task 3 match every call site in Task 4. The four summary functions in Task 2 match their Task 4 call sites, including `stakesSummary(games, options.stakes)` taking two arguments.
