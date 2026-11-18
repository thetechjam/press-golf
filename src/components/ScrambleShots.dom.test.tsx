// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { ScrambleShots } from './ScrambleShots';
import { creditShot } from '../games/scramble';
import { scrambleRound } from '../games/testFixtures';

/**
 * Saying whose ball was played, under a scramble team's score.
 *
 * The bookkeeping is tested in `games/scramble.test.ts`. What is here is what
 * only exists on screen: a tap credits one named person and a second tap takes
 * it back, the hidden rows follow the score, and the count against the
 * minimum is on the button you are about to press.
 */

const team = { id: 't1', name: 'Jesse & Sam', members: ['Jesse', 'Sam Ortega', 'Al'] };

/** Renders hole 3 of a live round, keeping every change the way Play does. */
function Harness({ start }: { start: Round }) {
  const [round, setRound] = useState(start);
  return (
    <>
      <ScrambleShots
        round={round}
        hole={round.holes[2]}
        teamId="t1"
        onCredit={(shot, member) => setRound(creditShot(round, 3, 't1', shot, member))}
      />
      <output data-testid="shots">{JSON.stringify(round.shots ?? null)}</output>
    </>
  );
}
const show = (r: Round) => render(<Harness start={r} />);
const saved = () => JSON.parse(screen.getByTestId('shots').textContent!);

afterEach(cleanup);

describe('the tee shot row', () => {
  it('credits the member tapped, and a second tap clears it', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams: [team] }));

    const sam = screen.getByRole('button', { name: 'Tee shot, Sam' });
    expect(sam.getAttribute('aria-pressed')).toBe('false');
    await user.click(sam);
    expect(sam.getAttribute('aria-pressed')).toBe('true');
    expect(saved()).toEqual({ 3: { t1: [1] } });

    // Moving the credit to somebody else is one tap, not clear-then-pick.
    await user.click(screen.getByRole('button', { name: 'Tee shot, Al' }));
    expect(saved()).toEqual({ 3: { t1: [2] } });
    expect(sam.getAttribute('aria-pressed')).toBe('false');

    await user.click(screen.getByRole('button', { name: 'Tee shot, Al' }));
    // Untapped reads exactly like untouched — see creditShot.
    expect(saved()).toBeNull();
  });

  it('shows each member’s count against the minimum, and only when there is one', () => {
    const shots = { 1: { t1: [0] }, 2: { t1: [0] }, 4: { t1: [1] } };
    const scores = { 1: { t1: 4 }, 2: { t1: 4 }, 4: { t1: 4 } };
    show(scrambleRound({ teams: [team], minDrives: 2, shots, scores }));
    const jesse = screen.getByRole('button', { name: 'Tee shot, Jesse, 2 of 2' });
    expect(jesse.textContent).toBe('Jesse2/2');
    expect(jesse.className).toContain('met');
    expect(screen.getByRole('button', { name: 'Tee shot, Sam, 1 of 2' }).className).not.toContain(
      'met'
    );
    cleanup();

    show(scrambleRound({ teams: [team], shots, scores }));
    expect(screen.getByRole('button', { name: 'Tee shot, Jesse' }).textContent).toBe('Jesse');
  });
});

describe('all shots', () => {
  const rowLabels = () =>
    screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'));

  it('is a closed disclosure that opens a row per remaining shot, par’s worth before a score', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams: [team] }));
    const more = screen.getByRole('button', { name: /^All shots/ });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(rowLabels()).toEqual(['Tee shot']);

    await user.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    // Par 4: the tee shot plus three more.
    expect(rowLabels()).toEqual(['Tee shot', 'Shot 2', 'Shot 3', 'Shot 4']);

    await user.click(screen.getByRole('button', { name: 'Shot 3, Jesse' }));
    expect(saved()).toEqual({ 3: { t1: [-1, -1, 0] } });
  });

  it('follows the posted score, and calls the last one holed', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams: [team], scores: { 3: { t1: 3 } } }));
    await user.click(screen.getByRole('button', { name: /^All shots/ }));
    expect(rowLabels()).toEqual(['Tee shot', 'Shot 2', 'Holed']);
    cleanup();

    show(scrambleRound({ teams: [team], scores: { 3: { t1: 6 } } }));
    await user.click(screen.getByRole('button', { name: /^All shots/ }));
    expect(rowLabels()).toEqual(['Tee shot', 'Shot 2', 'Shot 3', 'Shot 4', 'Shot 5', 'Holed']);
  });

  it('says when something is credited behind it while closed', () => {
    show(scrambleRound({ teams: [team], shots: { 3: { t1: [0, 1, 1] } } }));
    expect(screen.getByRole('button', { name: /^All shots/ }).textContent).toContain('2');
  });
});
