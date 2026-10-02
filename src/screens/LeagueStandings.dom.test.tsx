// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { LeagueStandings } from './LeagueStandings';
import { LeagueSetup } from './LeagueSetup';
import { makeRound, player, holes, scoresFrom } from '../games/testFixtures';

/**
 * The season table on screen. The adding up is tested in
 * `games/leagueSeason.test.ts`; here is what only a screen has: that it says
 * where its numbers come from, that a night opens its results, and that the
 * Golf League screen offers the way in only once there is a season.
 */

function night(id: string, date: string, usScore: number, themScore: number): Round {
  const ps = [player(`${id}1`, 'Al'), player(`${id}2`, 'Bo'), player(`${id}3`, 'Cy'), player(`${id}4`, 'Di')];
  const hs = holes(9);
  const r = makeRound({
    players: ps,
    holes: hs,
    status: 'finished',
    scores: scoresFrom(hs, {
      [`${id}1`]: Array(9).fill(usScore),
      [`${id}2`]: Array(9).fill(usScore),
      [`${id}3`]: Array(9).fill(themScore),
      [`${id}4`]: Array(9).fill(themScore),
    }),
    options: {
      league: {
        teams: [
          { aId: `${id}1`, bId: `${id}2` },
          { aId: `${id}3`, bId: `${id}4` },
        ],
        pointsPerMatch: 1,
      },
    },
  });
  return { ...r, id, date, course: 'Rolling Hills' };
}

const store = (rounds: Round[]) => localStorage.setItem('press.rounds.v1', JSON.stringify(rounds));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('League standings', () => {
  it('ranks the teams on points and says where the numbers come from', () => {
    store([night('n1', '2026-06-04', 4, 5), night('n2', '2026-06-11', 4, 4)]);
    render(<LeagueStandings onBack={() => {}} onViewResults={() => {}} />);
    const rows = [...document.querySelectorAll('.standings-row')].slice(0, 2);
    expect(rows[0].textContent).toContain('Al & Bo');
    expect(rows[0].textContent).toContain('4½');
    expect(rows[0].textContent).toContain('1–0–1');
    expect(rows[1].textContent).toContain('Cy & Di');
    expect(screen.getByText(/2 league nights in 2026, from this phone/)).toBeTruthy();
  });

  it('opens a night’s results from the list', async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    store([night('n1', '2026-06-04', 4, 5)]);
    render(<LeagueStandings onBack={() => {}} onViewResults={(r) => opened.push(r.id)} />);
    await user.click(screen.getByRole('button', { name: /Rolling Hills/ }));
    expect(opened).toEqual(['n1']);
  });

  it('offers a season switch only when there is more than one season', async () => {
    const user = userEvent.setup();
    store([night('n1', '2026-06-04', 4, 5), night('n0', '2025-06-05', 5, 4)]);
    render(<LeagueStandings onBack={() => {}} onViewResults={() => {}} />);
    await user.click(screen.getByRole('button', { name: '2025' }));
    expect(screen.getByText(/in 2025/)).toBeTruthy();
    expect(document.querySelector('.standings-row')?.textContent).toContain('Cy & Di');
  });

  it('says so when there are no league nights', () => {
    store([{ ...makeRound(), status: 'finished' }]);
    render(<LeagueStandings onBack={() => {}} onViewResults={() => {}} />);
    expect(screen.getByText(/No league nights on this phone yet/)).toBeTruthy();
  });

  it('is offered on Golf League once a league night is finished', () => {
    const props = { onCancel: () => {}, onStart: () => {}, onStandings: () => {} };
    render(<LeagueSetup {...props} />);
    expect(screen.queryByRole('button', { name: /Season standings/ })).toBeNull();
    cleanup();
    store([night('n1', '2026-06-04', 4, 5)]);
    render(<LeagueSetup {...props} />);
    expect(screen.getByRole('button', { name: /Season standings/ })).toBeTruthy();
  });
});
