// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JunkClaims, Round } from '../types';
import { JunkControls } from './JunkControls';
import { makeRound, player, holes18 } from '../games/testFixtures';

/**
 * Claiming junk on the hole it happened on.
 *
 * The counting is tested without a DOM in `games/junk.test.ts`. What is here is
 * what only exists on screen, and what money depends on: a tap credits a
 * specific person, so the panel has to say who before it is tapped and has to
 * still be saying it after.
 */

const four = [
  player('p1', 'Al'),
  player('p2', 'Bo'),
  player('p3', 'Cy'),
  player('p4', 'Di'),
];

const round = (junk?: JunkClaims): Round =>
  makeRound({ players: four, holes: holes18(), games: ['junk'], junk });

/** Renders on hole 7, reporting what each change would save. */
function show(junk?: JunkClaims) {
  const saved: JunkClaims[] = [];
  const r = round(junk);
  const view = render(
    <JunkControls round={r} hole={r.holes[6]} onChange={(next) => saved.push(next)} />
  );
  return { saved, view };
}

const openPanel = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(document.querySelector('.junk.collapsed')!);

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

describe('the collapsed strip', () => {
  it('says when the hole is clean', () => {
    show();
    expect(screen.getByText('No junk on this hole')).toBeTruthy();
    expect(screen.getByText('Claim')).toBeTruthy();
  });

  it('names who has what, without opening', () => {
    show({ 7: { p2: ['sandie', 'barkie'], p3: ['polie'] } });
    expect(screen.getByText('Bo: Sandie, Barkie · Cy: Polie')).toBeTruthy();
    expect(screen.getByText('Change')).toBeTruthy();
  });

  it('shows only this hole', () => {
    show({ 8: { p2: ['sandie'] } });
    expect(screen.getByText('No junk on this hole')).toBeTruthy();
  });
});

describe('claiming', () => {
  it('credits the picked player, and says who that is before the tap', async () => {
    const user = userEvent.setup();
    const { saved } = show();
    await openPanel(user);

    // Somebody is picked from the moment it opens, and named in the heading —
    // a tap here moves money, so the row has to say whose.
    expect(document.querySelector('.junk-head')?.textContent).toContain('Al');
    await user.click(screen.getByRole('button', { name: 'Sandie' }));
    expect(saved).toEqual([{ 7: { p1: ['sandie'] } }]);
  });

  it('switches who a tap credits', async () => {
    const user = userEvent.setup();
    const { saved } = show();
    await openPanel(user);

    await user.click(screen.getByRole('button', { name: /^Cy/ }));
    expect(document.querySelector('.junk-head')?.textContent).toContain('Cy');
    await user.click(screen.getByRole('button', { name: 'Greenie' }));
    expect(saved).toEqual([{ 7: { p3: ['greenie'] } }]);
  });

  it('opens on the person already holding one, not the first player', async () => {
    // Opening a hole that has claims is nearly always about correcting them.
    const user = userEvent.setup();
    show({ 7: { p4: ['polie'] } });
    await openPanel(user);
    expect(document.querySelector('.junk-head')?.textContent).toContain('Di');
    expect(screen.getByRole('button', { name: 'Polie' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('takes one back', async () => {
    const user = userEvent.setup();
    const { saved } = show({ 7: { p1: ['sandie'] } });
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Sandie' }));
    expect(saved).toEqual([{}]);
  });

  it('counts what each player is holding, in the row that picks them', async () => {
    const user = userEvent.setup();
    show({ 7: { p2: ['sandie', 'barkie'] } });
    await openPanel(user);
    const bo = screen.getByRole('button', { name: /^Bo/ });
    expect(bo.textContent).toContain('2');
    expect(screen.getByRole('button', { name: /^Al/ }).textContent).not.toContain('0');
  });

  it('offers all six, every time', async () => {
    const user = userEvent.setup();
    show();
    await openPanel(user);
    for (const label of ['Greenie', 'Sandie', 'Barkie', 'Arnie', 'Chip-in', 'Polie']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('closes without touching anything', async () => {
    const user = userEvent.setup();
    const { saved } = show();
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(document.querySelector('.junk.collapsed')).not.toBeNull();
    expect(saved).toEqual([]);
  });
});

describe('when there is nobody to claim against', () => {
  it('renders nothing for a solo round', () => {
    const r = makeRound({ players: [player('p1', 'Al')], holes: holes18(), games: ['junk'] });
    const { container } = render(
      <JunkControls round={r} hole={r.holes[0]} onChange={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });
});
