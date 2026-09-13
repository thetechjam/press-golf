// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { JunkClaims, Round } from '../types';
import { Scorecard } from './Scorecard';
import { makeRound, player, holes18 } from '../games/testFixtures';

/**
 * The junk footer under the grid.
 *
 * What the footer says is `buildScorecard`'s job and is tested there. What is
 * here is that it reaches the screen at all, and that it does not appear on a
 * card with nothing to put in it — an empty "Junk" heading under every
 * scorecard would be a worse card than the one before the footer existed.
 */

const four = [
  player('p1', 'Al'),
  player('p2', 'Bo'),
  player('p3', 'Cy'),
  player('p4', 'Di'),
];

const claims: JunkClaims = {
  3: { p1: ['greenie'] },
  7: { p1: ['barkie', 'sandie'], p2: ['chipIn'] },
};

const show = (o: Partial<Parameters<typeof makeRound>[0]> = {}) => {
  const round: Round = makeRound({
    players: four,
    holes: holes18(),
    games: ['junk'],
    junk: claims,
    ...o,
  });
  return render(<Scorecard round={round} />);
};

afterEach(cleanup);

describe('the junk footer', () => {
  it('writes one line per player who claimed something', () => {
    show();
    const lines = [...document.querySelectorAll('.sc-junk li')].map((li) => li.textContent);
    expect(lines).toEqual(['AlGreenie (3rd) · Sandie + Barkie (7th)', 'BoChip-in (7th)']);
  });

  it('sits under the grid rather than inside it, so no column has to hold it', () => {
    show();
    expect(document.querySelector('.scorecard .sc-junk')).toBeNull();
    const foot = document.querySelector('.sc-junk');
    const card = document.querySelector('.card-scroll');
    expect(foot && card && card.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('comes before the key, because it is the round and the key is a note about it', () => {
    show();
    const foot = document.querySelector('.sc-junk')!;
    const legend = document.querySelector('.sc-legend')!;
    expect(foot.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('stays off a card with no claims on it', () => {
    show({ junk: undefined });
    expect(document.querySelector('.sc-junk')).toBeNull();
  });

  it('stays off a card for a round that is not playing junk', () => {
    show({ games: ['skins'] });
    expect(document.querySelector('.sc-junk')).toBeNull();
  });
});
