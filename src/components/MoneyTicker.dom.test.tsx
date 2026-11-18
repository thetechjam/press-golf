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

describe('the money line amounts', () => {
  it('signs winnings, and shows a dash for even', () => {
    render(<MoneyTicker round={round([3, 4], [4, 4])} />);
    const nets = [...document.querySelectorAll('.tick-net')].map((e) => e.textContent);
    expect(nets).toEqual(['+$5', '−$5']);
    render(<MoneyTicker round={round([4], [4])} />);
    expect(document.querySelectorAll('.tick-net')[2].textContent).toBe('—');
  });
});

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

  // Stableford settles every point as it is scored, so money moves on a tap
  // that does not finish the hole. That used to flip on every tap.
  const points = (p1: (number | null)[], p2: (number | null)[]) =>
    makeRound({
      players: [player('p1', 'Al'), player('p2', 'Bo')],
      holes: hs,
      games: ['stableford'],
      options: { stakes: { stableford: 1 } },
      scores: scoresFrom(hs, { p1, p2 }),
    });
  const figures = () => [...document.querySelectorAll('.tick-net')].map((e) => e.textContent);

  it('does not flip a figure that moves mid-hole, but shows the new amount', () => {
    const { rerender } = render(<MoneyTicker round={points([4], [4])} hole={hs[1]} />);
    const before = figures();
    rerender(<MoneyTicker round={points([4, 3], [4, null])} hole={hs[1]} />);
    expect(figures()).not.toEqual(before);
    expect(flipped()).toBe(0);
  });

  it('keeps the same element through a mid-hole change, so its colour can ease', () => {
    const { rerender } = render(<MoneyTicker round={points([4], [4])} hole={hs[1]} />);
    const node = document.querySelector('.tick-net');
    rerender(<MoneyTicker round={points([4, 3], [4, null])} hole={hs[1]} />);
    expect(document.querySelector('.tick-net')).toBe(node);
  });

  it('flips when the tap that finishes the hole moves the money', () => {
    const { rerender } = render(<MoneyTicker round={points([4], [4])} hole={hs[1]} />);
    rerender(<MoneyTicker round={points([4, 3], [4, null])} hole={hs[1]} />);
    rerender(<MoneyTicker round={points([4, 3], [4, 5])} hole={hs[1]} />);
    expect(flipped()).toBeGreaterThan(0);
  });

  it('flips a total that is different on the hole navigated to', () => {
    const { rerender } = render(<MoneyTicker round={points([4], [4])} hole={hs[1]} />);
    rerender(<MoneyTicker round={points([4, 3], [4, null])} hole={hs[1]} />);
    expect(flipped()).toBe(0);
    rerender(<MoneyTicker round={points([4, 3, 5], [4, null])} hole={hs[2]} />);
    expect(flipped()).toBeGreaterThan(0);
  });

  it('does not flip on navigating when nothing moved', () => {
    const { rerender } = render(<MoneyTicker round={points([4, 3], [4, 5])} hole={hs[1]} />);
    rerender(<MoneyTicker round={points([4, 3], [4, 5])} hole={hs[2]} />);
    expect(flipped()).toBe(0);
  });

  it('holds the flip while hidden, and plays it on coming back', () => {
    const { rerender } = render(<MoneyTicker round={round([4], [4])} />);
    rerender(<MoneyTicker round={round([4, 3], [4, 4])} visible={false} />);
    expect(flipped()).toBe(0);
    rerender(<MoneyTicker round={round([4, 3], [4, 4])} />);
    expect(flipped()).toBe(2);
  });
});
