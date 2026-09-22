// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MoneyTicker } from './MoneyTicker';
import { makeRound, player, holes, scoresFrom } from '../games/testFixtures';

afterEach(cleanup);

const hs = holes(3);
const round = (p1: number[], p2: number[]) =>
  makeRound({
    players: [player('p1', 'Al'), player('p2', 'Bo')],
    holes: hs,
    games: ['skins'],
    options: { stakes: { skins: 5 } },
    scores: scoresFrom(hs, { p1, p2 }),
  });

const flipped = () => document.querySelectorAll('.tick-net.flap').length;

describe('the money line flip', () => {
  it('does not flip anything when it first appears', () => {
    render(<MoneyTicker round={round([3], [4])} />);
    expect(flipped()).toBe(0);
  });

  it('flips the figures that moved since the last render', () => {
    const { rerender } = render(<MoneyTicker round={round([4], [4])} />);
    rerender(<MoneyTicker round={round([4, 3], [4, 4])} />);
    expect(flipped()).toBe(2);
  });

  it('holds the flip while hidden, and plays it on coming back', () => {
    const { rerender } = render(<MoneyTicker round={round([4], [4])} />);
    rerender(<MoneyTicker round={round([4, 3], [4, 4])} visible={false} />);
    expect(flipped()).toBe(0);
    rerender(<MoneyTicker round={round([4, 3], [4, 4])} />);
    expect(flipped()).toBe(2);
  });
});
