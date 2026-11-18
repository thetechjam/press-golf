// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { Play } from './Play';
import { holes18, scrambleRound } from '../games/testFixtures';

/**
 * A scramble on the Play screen: crediting a shot reaches the round, and the
 * banner that already asks about blank scores and missing Wolf calls asks
 * about tee shots too — at the two moments it matters.
 */

const teams = [
  { id: 't1', name: 'Hackers', members: ['Jesse', 'Sam'] },
  { id: 't2', name: 'Fore Play', members: ['Al', 'Bo'] },
];
const nine = holes18().slice(0, 9);
const everyHole = (s: number) =>
  Object.fromEntries(nine.map((h) => [h.number, { t1: s, t2: s }]));

/** Keeps every change, as App does, and reports the latest round. */
function show(start: Round) {
  let latest = start;
  let finished = 0;
  function Harness() {
    const [round, setRound] = useState(start);
    return (
      <Play
        round={round}
        onChange={(r) => {
          latest = r;
          setRound(r);
        }}
        onFinish={() => (finished += 1)}
        onExit={() => {}}
      />
    );
  }
  render(<Harness />);
  return { latest: () => latest, finished: () => finished };
}

const banner = () => screen.getByRole('alert');

afterEach(cleanup);

describe('scramble shots on the Hole tab', () => {
  it('credits a tee shot to the round, under the team it belongs to', async () => {
    const user = userEvent.setup();
    const play = show(scrambleRound({ teams, holes: nine }));
    const t2 = document.getElementById('player-row-t2')!;
    await user.click(within(t2).getByRole('button', { name: 'Tee shot, Bo' }));
    expect(play.latest().shots).toEqual({ 1: { t2: [1] } });
    await user.click(within(t2).getByRole('button', { name: 'Tee shot, Bo' }));
    expect(play.latest().shots).toBeUndefined();
  });

  it('has no shot rows outside a scramble', () => {
    show({ ...scrambleRound({ teams, holes: nine }), options: { stakes: {} } as Round['options'] });
    expect(screen.queryByRole('button', { name: /^Tee shot/ })).toBeNull();
  });
});

describe('the warning banner', () => {
  it('asks on Next when a team has scored the hole with no tee shot picked', async () => {
    const user = userEvent.setup();
    const round = scrambleRound({
      teams,
      holes: nine,
      minDrives: 1,
      scores: { 1: { t1: 4, t2: 4 } },
      shots: { 1: { t1: [0] } },
    });
    const play = show(round);
    await user.click(screen.getByRole('button', { name: /^Hole 1\b/ }));
    await user.click(screen.getByRole('button', { name: 'Next Hole →' }));
    expect(banner().textContent).toContain(
      'No tee shot picked for Fore Play. Move to the next hole anyway?'
    );

    // Keep scoring stays here: the scores are in, the drive is what is missing.
    await user.click(screen.getByRole('button', { name: 'Keep scoring' }));
    expect(screen.getByText('Hole 1')).toBeTruthy();
    expect(document.getElementById('player-row-t2')!.className).toContain('highlight');

    // Picking it clears the question.
    const t2 = document.getElementById('player-row-t2')!;
    await user.click(within(t2).getByRole('button', { name: /^Tee shot, Al/ }));
    await user.click(screen.getByRole('button', { name: 'Next Hole →' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Hole 2')).toBeTruthy();
    expect(play.latest().shots?.[1]).toEqual({ t1: [0], t2: [0] });
  });

  it('does not ask about tee shots when there is no minimum', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams, holes: nine, scores: { 1: { t1: 4, t2: 4 } } }));
    await user.click(screen.getByRole('button', { name: /^Hole 1\b/ }));
    await user.click(screen.getByRole('button', { name: 'Next Hole →' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says on Finish which team is short of the minimum, and who owes it', async () => {
    const user = userEvent.setup();
    const round = scrambleRound({
      teams,
      holes: nine,
      minDrives: 2,
      scores: everyHole(4),
      // Hackers used Jesse twice and Sam twice; Fore Play only ever used Al.
      shots: {
        1: { t1: [0], t2: [0] },
        2: { t1: [0], t2: [0] },
        3: { t1: [1], t2: [0] },
        4: { t1: [1], t2: [0] },
      },
    });
    const play = show(round);
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(banner().textContent).toContain(
      'Fore Play: tee-shot minimum not met (Bo 2). Finish the round anyway?'
    );
    expect(banner().textContent).not.toContain('Hackers');
    expect(banner().textContent).not.toContain('missing scores');

    // Every score is in, so Keep scoring opens the first hole Fore Play
    // played without picking a drive.
    await user.click(screen.getByRole('button', { name: 'Keep scoring' }));
    expect(screen.getByText('Hole 5')).toBeTruthy();
    expect(document.getElementById('player-row-t2')!.className).toContain('highlight');

    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await user.click(screen.getByRole('button', { name: 'Finish anyway' }));
    expect(play.finished()).toBe(1);
  });

  it('composes with the missing-scores sentence', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams: [teams[0]], holes: nine, minDrives: 1 }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(banner().textContent).toContain(
      '9 holes are missing scores. Hackers: tee-shot minimum not met (Jesse 1, Sam 1). Finish the round anyway?'
    );
  });
});

describe('the Board tab', () => {
  it('follows the Scramble board with the tee shots, and has no money card for one team', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams: [teams[0]], holes: nine, minDrives: 1 }));
    await user.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.queryByText(/No money on this round/)).toBeNull();
    expect(screen.getByRole('region', { name: 'Tee shots' })).toBeTruthy();
  });

  it('jumps to the tee shots once there are three cards', async () => {
    const user = userEvent.setup();
    show(scrambleRound({ teams, holes: nine, stake: 5 }));
    await user.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByRole('button', { name: 'Tee shots' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tee shots, Hackers' }).id).toBe('board-tee-shots');
  });
});
