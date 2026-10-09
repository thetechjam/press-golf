// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { HoleView } from './HoleView';
import { makeRound, player, holes18 } from '../games/testFixtures';

/**
 * Fixing a wrong par on the hole. A course-search par off by one changes
 * every net score for the rest of the round, and the only fix used to be a
 * new round.
 */

const round = makeRound({ players: [player('p1', 'Al'), player('p2', 'Bo')], holes: holes18() });
const show = (onPar?: (holeNumber: number, par: number) => void) =>
  render(
    <HoleView
      round={round}
      hole={round.holes[2]}
      idx={2}
      dir="next"
      highlightId={null}
      holeComplete={round.holes.map(() => false)}
      onGo={() => {}}
      onScore={() => {}}
      onPickup={() => {}}
      onWolf={() => {}}
      onPresses={() => {}}
      onJunk={() => {}}
      onPar={onPar}
    />
  );

afterEach(cleanup);

describe('the hole’s par', () => {
  it('opens a picker rather than stepping on a tap, and writes the pick', () => {
    const calls: [number, number][] = [];
    show((h, p) => calls.push([h, p]));
    const par = screen.getByRole('button', { name: /^Par 4\. Change/ });
    fireEvent.click(par);
    expect(calls).toEqual([]);
    expect(par.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Par 5' }));
    expect(calls).toEqual([[3, 5]]);
    expect(screen.queryByRole('group', { name: 'Par for hole 3' })).toBeNull();
  });

  it('is plain text when the card cannot be edited', () => {
    show();
    expect(screen.queryByRole('button', { name: /Change this hole/ })).toBeNull();
    expect(document.querySelector('.hole-par')?.textContent).toContain('Par 4');
  });
});
