// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { Round, SavedCourse } from './types';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { LeagueSetup } from './screens/LeagueSetup';
import { Results } from './screens/Results';
import { History } from './screens/History';
import { Stats } from './screens/Stats';
import { Scorecard } from './components/Scorecard';

/**
 * Every control on every screen says what it is.
 *
 * This is the guard, not the fix. The fixes are in the screens; what keeps
 * them true is a test that walks the rendered DOM and refuses a control whose
 * accessible name is missing — or, just as bad and much easier to miss, a
 * control whose name is a bare number. Eighteen buttons announced as "1"
 * through "18" each had a name and none of them said what pressing it did.
 *
 * Written against the DOM rather than against a list of components, so a field
 * added to any of these screens is covered the day it is added.
 */

const holes = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5][i],
  strokeIndex: i + 1,
}));

const round: Round = {
  id: 'r1',
  course: 'Torrey Pines South',
  date: '2026-09-12',
  createdAt: 1,
  updatedAt: 2,
  players: [
    { id: 'p1', name: 'Alex', handicap: 8 },
    { id: 'p2', name: 'Sam', handicap: 14 },
  ],
  holes,
  games: ['skins'],
  options: {
    useNet: true,
    stablefordMode: 'standard',
    loneWolfMultiplier: 2,
    blindWolfMultiplier: 3,
    stakes: { skins: 5 },
  },
  scores: Object.fromEntries(holes.map((h) => [h.number, { p1: 4, p2: 5 }])),
  wolf: {},
  slope: 129,
  rating: 74.6,
  status: 'finished',
};

const course: SavedCourse = { id: 'c1', name: 'Torrey Pines South', holes, slope: 129, rating: 74.6 };

/** What a screen reader would call this control, by the same order browsers use. */
function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();
  const ref = el.getAttribute('aria-labelledby');
  if (ref) return (document.getElementById(ref)?.textContent ?? '').trim();
  const title = el.getAttribute('title');
  if (title) return title.trim();
  const text = (el.textContent ?? '').trim();
  if (text) return text;
  const label = el.closest('label');
  return label ? (label.textContent ?? '').trim() : '';
}

const CONTROLS = 'button, a[href], input, select, textarea, [role=button], [role=radio]';
/** A name made only of digits or a lone glyph names nothing. */
const VAGUE = /^[\d.,:+\-–—✓✕×⋯‹›«»▾▴]{1,3}$/;

function unnamed(): string[] {
  return [...document.querySelectorAll(CONTROLS)]
    .filter((el) => !accessibleName(el))
    .map((el) => `${el.tagName}.${el.className || '(no class)'}`);
}

function vaguelyNamed(): string[] {
  return [...document.querySelectorAll(CONTROLS)]
    .map((el) => [el, accessibleName(el)] as const)
    .filter(([, n]) => n && VAGUE.test(n))
    .map(([el, n]) => `"${n}" on ${el.tagName}.${String(el.className).split(' ')[0]}`);
}

/** Opens every collapsible row so its controls are in the DOM to be checked. */
function openEveryRow() {
  for (const head of document.querySelectorAll<HTMLElement>('.setup-row-head')) {
    if (head.getAttribute('aria-expanded') !== 'true') head.click();
  }
}

beforeEach(() => {
  localStorage.setItem('press.rounds.v1', JSON.stringify([round]));
  localStorage.setItem('press.courses.v1', JSON.stringify([course]));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const noop = () => {};

describe('every control says what it is', () => {
  it('on Home', () => {
    render(
      <Home
        onNew={noop}
        onNewLeague={noop}
        onResume={noop}
        onViewResults={noop}
        onStats={noop}
        onHistory={noop}
      />
    );
    expect(unnamed()).toEqual([]);
    expect(vaguelyNamed()).toEqual([]);
  });

  it('on New Round, with every row open', () => {
    render(<Setup onCancel={noop} onStart={noop} />);
    openEveryRow();
    expect(unnamed()).toEqual([]);
    expect(vaguelyNamed()).toEqual([]);
  });

  it('on Golf League', () => {
    // The starting-hole grid here is nine buttons whose visible text is a
    // number under a heading a screen reader reaches separately.
    render(<LeagueSetup onCancel={noop} onStart={noop} />);
    expect(unnamed()).toEqual([]);
    expect(vaguelyNamed()).toEqual([]);
  });

  it('on Results', () => {
    render(<Results round={round} onChange={noop} onHome={noop} onBackToPlay={noop} />);
    expect(unnamed()).toEqual([]);
    expect(vaguelyNamed()).toEqual([]);
  });

  it('on Rounds', () => {
    render(<History onBack={noop} onResume={noop} onViewResults={noop} />);
    expect(unnamed()).toEqual([]);
    expect(vaguelyNamed()).toEqual([]);
  });

  it('on Stats', () => {
    render(<Stats onBack={noop} />);
    expect(unnamed()).toEqual([]);
    expect(vaguelyNamed()).toEqual([]);
  });

  it('on the scorecard grid, where the hole headers jump to a hole', () => {
    render(<Scorecard round={round} onScore={noop} currentHole={1} onJumpToHole={noop} />);
    expect(unnamed()).toEqual([]);
    // Each header's visible text is the hole number; the name has to be the
    // sentence, or eighteen buttons announce as "1" through "18".
    expect(vaguelyNamed()).toEqual([]);
    expect(
      document.querySelector('.sc-hole')?.getAttribute('aria-label')
    ).toBe('Go to hole 1');
  });
});
