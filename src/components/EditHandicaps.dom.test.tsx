// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { makeRound, player, realCard18 } from '../games/testFixtures';
import { EditHandicaps } from './EditHandicaps';

afterEach(cleanup);

const show = (round: Round) => {
  const saved: Round[] = [];
  render(<EditHandicaps round={round} onChange={(r) => saved.push(r)} onClose={() => {}} />);
  return saved;
};

describe('editing handicaps', () => {
  it('shows a decimal stroke count as the whole strokes it will be kept as', async () => {
    const user = userEvent.setup();
    const saved = show(makeRound({ players: [player('p1', 'Al'), player('p2', 'Bo')] }));
    const al = screen.getByLabelText<HTMLInputElement>('Handicap for Al');
    const bo = screen.getByLabelText<HTMLInputElement>('Handicap for Bo');
    await user.type(al, '12.7');
    await user.type(bo, '-2.5');
    await user.tab();
    expect(al.value).toBe('13');
    expect(bo.value).toBe('-2');
    await user.click(screen.getByRole('button', { name: 'Save handicaps' }));
    expect(saved[0].players.map((p) => p.handicap)).toEqual([13, -2]);
  });

  it('leaves the decimal in an Index on a rated course', async () => {
    const user = userEvent.setup();
    show(makeRound({ holes: realCard18(), slope: 128, rating: 72.4 }));
    const al = screen.getByLabelText<HTMLInputElement>('Handicap Index for Al');
    await user.type(al, '12.7');
    await user.tab();
    expect(al.value).toBe('12.7');
  });
});
