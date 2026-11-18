// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScrambleSetup } from './ScrambleSetup';
import type { Round } from '../types';
import { scrambleRound } from '../games/testFixtures';

/**
 * Scramble setup: what a team looks like by the time it is a round.
 *
 * Each team is one `Player` named after the team, with its people beside it in
 * `options.scramble`. Everything downstream — the card, the board, the money —
 * reads the round this screen builds, so its shape is what is pinned here.
 */

type User = ReturnType<typeof userEvent.setup>;

const show = () => {
  const started: Round[] = [];
  render(<ScrambleSetup onCancel={() => {}} onStart={(r) => started.push(r)} />);
  return started;
};

/** The four member fields of a team, by its place (1-based) on the screen. */
// A field with a datalist is a combobox, not a textbox, so these are found by
// their names rather than by role.
const members = (team: number) => [
  ...document.querySelectorAll<HTMLInputElement>(`input[aria-label^="Team ${team}, player"]`),
];

async function fill(user: User, team: number, names: string[]) {
  const fields = members(team);
  for (const [i, n] of names.entries()) if (n) await user.type(fields[i], n);
}

const teeOff = (user: User) => user.click(screen.getByRole('button', { name: /Tee Off/ }));

const openRow = async (user: User, label: string) => {
  const head = [...document.querySelectorAll<HTMLElement>('.setup-row-head')].find((el) =>
    el.textContent?.includes(label)
  );
  if (head && head.getAttribute('aria-expanded') !== 'true') await user.click(head);
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('the round a scramble starts', () => {
  it('is one team player, stroke play, with its members beside it', async () => {
    const user = userEvent.setup();
    const started = show();
    await fill(user, 1, ['Jesse Smith', 'Sam', 'Al']);
    await teeOff(user);

    const r = started[0];
    expect(r).toBeTruthy();
    expect(r.games).toEqual(['strokePlay']);
    expect(r.players).toHaveLength(1);
    // Named by default from first names, the way the engine names a team.
    expect(r.players[0].name).toBe('Jesse, Sam +1');
    expect(r.options.scramble).toEqual({
      teams: [{ id: r.players[0].id, members: ['Jesse Smith', 'Sam', 'Al'] }],
    });
    // One team has nobody to play for money against.
    expect(r.options.stakes).toEqual({});
    expect(r.options.useNet).toBe(false);
    expect(r.scores).toEqual({});
    expect(r.wolf).toEqual({});
    expect(r.status).toBe('in_progress');
    expect(r.holes.map((h) => h.number)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    // Gross: nothing for a slope and rating to convert.
    expect(r.slope).toBeUndefined();
    expect(r.rating).toBeUndefined();
  });

  it('builds a round shaped like the engine’s own fixture', async () => {
    const user = userEvent.setup();
    const started = show();
    await fill(user, 1, ['Jesse', 'Sam', 'Al']);
    await teeOff(user);
    const fixture = scrambleRound();
    const r = started[0];
    expect(Object.keys(r.options.scramble!)).toEqual(Object.keys(fixture.options.scramble!));
    expect(r.options.scramble!.teams[0].members).toEqual(fixture.options.scramble!.teams[0].members);
  });

  it('carries two teams, a stake on stroke play, and a typed team name', async () => {
    const user = userEvent.setup();
    const started = show();
    await user.click(screen.getByRole('button', { name: '+ Add a team' }));
    await user.type(screen.getByRole('textbox', { name: 'Name of team 1 (optional)' }), 'Sandbaggers');
    await fill(user, 1, ['Jesse', 'Sam']);
    await fill(user, 2, ['Al', 'Bo', 'Cy', 'Di']);
    await openRow(user, 'Stake');
    await user.type(screen.getByRole('spinbutton'), '10');
    await teeOff(user);

    const r = started[0];
    expect(r.players.map((p) => p.name)).toEqual(['Sandbaggers', 'Al, Bo +2']);
    expect(r.options.stakes).toEqual({ strokePlay: 10 });
    expect(r.options.scramble!.teams).toEqual([
      { id: r.players[0].id, members: ['Jesse', 'Sam'] },
      { id: r.players[1].id, members: ['Al', 'Bo', 'Cy', 'Di'] },
    ]);
    expect(new Set(r.players.map((p) => p.id)).size).toBe(2);
  });

  it('leaves the stake off when it is blank', async () => {
    const user = userEvent.setup();
    const started = show();
    await user.click(screen.getByRole('button', { name: '+ Add a team' }));
    await fill(user, 1, ['Jesse', 'Sam']);
    await fill(user, 2, ['Al', 'Bo']);
    await teeOff(user);
    expect(started[0].options.stakes).toEqual({});
  });

  it('drops blank member fields, wherever they are', async () => {
    const user = userEvent.setup();
    const started = show();
    await fill(user, 1, ['', 'Sam', '', 'Al']);
    await user.type(members(1)[2], '   ');
    await teeOff(user);
    expect(started[0].options.scramble!.teams[0].members).toEqual(['Sam', 'Al']);
    expect(started[0].players[0].name).toBe('Sam & Al');
  });

  it('tells two teams with the same name apart', async () => {
    const user = userEvent.setup();
    const started = show();
    await user.click(screen.getByRole('button', { name: '+ Add a team' }));
    await fill(user, 1, ['Jesse', 'Sam']);
    await fill(user, 2, ['Jesse', 'Sam']);
    await teeOff(user);
    expect(started[0].players.map((p) => p.name)).toEqual(['Jesse & Sam', 'Jesse & Sam (2)']);
  });
});

describe('refusing a team that is short', () => {
  it('will not start with fewer than two named players, and says which team', async () => {
    const user = userEvent.setup();
    const started = show();
    await user.click(screen.getByRole('button', { name: '+ Add a team' }));
    await fill(user, 1, ['Jesse', 'Sam']);
    await fill(user, 2, ['Al']);
    await teeOff(user);

    expect(started).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toBe('Team 2 needs at least two players.');
    // And on the team itself, where the fix is made.
    const cards = document.querySelectorAll('.scramble-team');
    expect(cards[0].querySelector('.scramble-team-error')).toBeNull();
    expect(cards[1].querySelector('.scramble-team-error')?.textContent).toMatch(/at least two/);

    // Goes as soon as it is put right, without another press.
    await user.type(members(2)[1], 'Bo');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('.scramble-team-error')).toBeNull();
    await teeOff(user);
    expect(started).toHaveLength(1);
  });

  it('does not nag before Tee Off is pressed', async () => {
    const user = userEvent.setup();
    show();
    await fill(user, 1, ['Jesse']);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('.scramble-team-error')).toBeNull();
  });
});

describe('format', () => {
  it('rotates the holes so the starting hole is first', async () => {
    const user = userEvent.setup();
    const started = show();
    await fill(user, 1, ['Jesse', 'Sam']);
    await openRow(user, 'Format');
    await user.click(screen.getByRole('button', { name: 'Start on hole 5' }));
    await teeOff(user);
    const order = started[0].holes.map((h) => h.number);
    expect(order.slice(0, 3)).toEqual([5, 6, 7]);
    expect(order.at(-1)).toBe(4);
    expect(order).toHaveLength(18);
  });

  it('starts a nine on its first hole when the chosen one is no longer there', async () => {
    const user = userEvent.setup();
    const started = show();
    await fill(user, 1, ['Jesse', 'Sam']);
    await openRow(user, 'Format');
    await user.click(screen.getByRole('button', { name: 'Start on hole 14' }));
    await openRow(user, 'Holes & pars');
    await user.click(screen.getByRole('button', { name: '9 holes' }));
    await teeOff(user);
    expect(started[0].holes.map((h) => h.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('carries the tee shot minimum, and leaves it off for None', async () => {
    const user = userEvent.setup();
    const started = show();
    await fill(user, 1, ['Jesse', 'Sam']);
    await openRow(user, 'Format');
    await user.click(screen.getByRole('button', { name: 'At least 3 tee shots each' }));
    await teeOff(user);
    expect(started[0].options.scramble!.minDrives).toBe(3);

    await user.click(screen.getByRole('button', { name: 'No minimum' }));
    await teeOff(user);
    expect('minDrives' in started[1].options.scramble!).toBe(false);
  });

  it('does not ask for a slope or rating', async () => {
    const user = userEvent.setup();
    show();
    await openRow(user, 'Holes & pars');
    expect(screen.queryByText('Slope')).toBeNull();
    expect(screen.queryByText('Rating')).toBeNull();
  });
});

describe('teams', () => {
  it('starts with one, adds up to four, and never removes the last', async () => {
    const user = userEvent.setup();
    show();
    const cards = () => document.querySelectorAll('.scramble-team').length;
    expect(cards()).toBe(1);
    // Nothing to remove while there is only one team.
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();

    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: '+ Add a team' }));
    expect(cards()).toBe(4);
    expect(screen.queryByRole('button', { name: '+ Add a team' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Remove team 2' }));
    expect(cards()).toBe(3);
    expect(screen.getByRole('button', { name: '+ Add a team' })).toBeTruthy();
    for (const n of [1, 1]) await user.click(screen.getByRole('button', { name: `Remove team ${n}` }));
    expect(cards()).toBe(1);
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });

  it('removes the team asked for, with what was typed in the others intact', async () => {
    const user = userEvent.setup();
    const started = show();
    await user.click(screen.getByRole('button', { name: '+ Add a team' }));
    await user.click(screen.getByRole('button', { name: '+ Add a team' }));
    await fill(user, 1, ['Jesse', 'Sam']);
    await fill(user, 2, ['Al', 'Bo']);
    await fill(user, 3, ['Cy', 'Di']);
    await user.click(screen.getByRole('button', { name: 'Remove team 2' }));
    await teeOff(user);
    expect(started[0].players.map((p) => p.name)).toEqual(['Jesse & Sam', 'Cy & Di']);
  });

  it('shows the default name a team will get as its placeholder', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: '+ Add a team' }));
    const name = (n: number) =>
      screen.getByRole('textbox', { name: `Name of team ${n} (optional)` }) as HTMLInputElement;
    expect(name(1).placeholder).toBe('Team 1');
    expect(name(2).placeholder).toBe('Team 2');
    await fill(user, 2, ['Al Jones', 'Bo']);
    expect(name(2).placeholder).toBe('Al & Bo');
  });

  it('only offers a stake with two or more teams', async () => {
    const user = userEvent.setup();
    show();
    const stakeRow = () =>
      [...document.querySelectorAll('.setup-row-head')].some((el) => el.textContent?.includes('Stake'));
    expect(stakeRow()).toBe(false);
    await user.click(screen.getByRole('button', { name: '+ Add a team' }));
    expect(stakeRow()).toBe(true);
  });
});

describe('recall chips', () => {
  const past = scrambleRound({
    teams: [{ name: 'The Old Firm', members: ['Jesse', 'Sam'] }],
  });

  it('offer the people from earlier rounds, never a team name', () => {
    localStorage.setItem('press.rounds.v1', JSON.stringify([past]));
    show();
    const chips = screen.getByRole('group', { name: 'Recent players' });
    expect(chips.textContent).toContain('Jesse');
    expect(chips.textContent).not.toContain('The Old Firm');
    const suggestions = [...document.querySelectorAll('#press-known-names option')].map(
      (o) => (o as HTMLOptionElement).value
    );
    expect(suggestions).not.toContain('The Old Firm');
  });

  it('fill the first blank slot of the team last touched', async () => {
    localStorage.setItem('press.rounds.v1', JSON.stringify([past]));
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: '+ Add a team' }));
    await user.type(members(1)[0], 'Al');
    // Touch team 2's third field, leaving its first two blank.
    await user.click(members(2)[2]);
    await user.click(screen.getByRole('button', { name: 'Add Sam' }));
    expect(members(2).map((el) => el.value)).toEqual(['Sam', '', '', '']);
    expect(members(1)[1].value).toBe('');
    // Once on the card, it is not offered again.
    expect(screen.queryByRole('button', { name: 'Add Sam' })).toBeNull();
  });
});
