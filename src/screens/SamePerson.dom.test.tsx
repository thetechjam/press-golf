// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { Setup } from './Setup';
import { getAliases, listRounds, mergePeople } from '../storage';
import { makeRound, player } from '../games/testFixtures';

/**
 * "Al" typed on a phone that knows an Alex. New Round asks once, at Start,
 * and the answer decides whether Stats, trips and standings see one person or
 * two. The matching itself is tested in `people.test.ts`.
 */

const past = (names: string[]): Round => ({
  ...makeRound({ players: names.map((n, i) => player(`old${i}`, n)) }),
  id: 'old',
  status: 'finished',
});

const start = async (names: string[]) => {
  const user = userEvent.setup();
  const started: Round[] = [];
  render(<Setup onCancel={() => {}} onStart={(r) => started.push(r)} />);
  for (const [i, n] of names.entries()) {
    await user.type(screen.getByRole('combobox', { name: `Name of player ${i + 1}` }), n);
  }
  await user.click(screen.getByRole('button', { name: /Start Round/ }));
  return { user, started };
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('press.rounds.v1', JSON.stringify([past(['Alex', 'Sam'])]));
});
afterEach(cleanup);

describe('is this the same person?', () => {
  it('asks before starting, and "yes" plays them as the known name and remembers it', async () => {
    const { user, started } = await start(['Al', 'Sam']);
    expect(started).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toContain('Is “Al” Alex');

    await user.click(screen.getByRole('button', { name: 'Yes, Alex' }));
    expect(started[0].players.map((p) => p.name)).toEqual(['Alex', 'Sam']);
    expect(getAliases()).toEqual({ al: 'Alex' });
  });

  it('"no" starts with the name as typed and does not ask again', async () => {
    const { user, started } = await start(['Al', 'Sam']);
    await user.click(screen.getByRole('button', { name: 'No, someone new' }));
    expect(started[0].players.map((p) => p.name)).toEqual(['Al', 'Sam']);
    expect(getAliases()).toEqual({});
  });

  it('does not ask about a name the phone already knows', async () => {
    const { started } = await start(['Alex', 'Sam']);
    expect(started).toHaveLength(1);
  });

  it('does not offer a name that is already somebody else in this round', async () => {
    // Al and Alex both playing: plainly two people.
    const { started } = await start(['Al', 'Alex']);
    expect(started).toHaveLength(1);
  });

  it('brings a merged spelling into line without asking', async () => {
    mergePeople('Al', 'Alex');
    const { started } = await start(['al', 'Sam']);
    expect(started[0].players[0].name).toBe('Alex');
  });

  it('suggests known names as the name is typed', () => {
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    const options = [...document.querySelectorAll('#press-known-names option')].map(
      (o) => (o as HTMLOptionElement).value
    );
    expect(options).toEqual(['Alex', 'Sam']);
    expect(listRounds()).toHaveLength(1);
  });
});
