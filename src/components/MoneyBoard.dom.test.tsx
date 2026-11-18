// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MoneyBoard } from './MoneyBoard';
import { formatSignedMoney } from '../games/settlement';
import { makeRound, player, holes, scoresFrom } from '../games/testFixtures';

afterEach(cleanup);

const hs = holes(3);
const round = makeRound({
  players: [player('p1', 'Al'), player('p2', 'Bo'), player('p3', 'Cy')],
  holes: hs,
  games: ['skins'],
  options: { stakes: { skins: 5 } },
  // Al wins the first skin, the other two halve it out.
  scores: scoresFrom(hs, { p1: [3, 4], p2: [4, 4], p3: [4, 4] }),
});

describe('formatSignedMoney', () => {
  it('marks winnings with a plus, and leaves losses and zero as formatMoney has them', () => {
    expect(formatSignedMoney(18)).toBe('+$18');
    expect(formatSignedMoney(1648)).toBe('+$1,648');
    expect(formatSignedMoney(2.5)).toBe('+$2.50');
    expect(formatSignedMoney(-9)).toBe('−$9');
    expect(formatSignedMoney(0)).toBe('$0');
  });
});

describe('the Board money card', () => {
  it('signs each net, so winnings are not told from losses by colour alone', () => {
    render(<MoneyBoard round={round} onChange={() => {}} />);
    const nets = [...document.querySelectorAll('.net-amount')].map((e) => e.textContent);
    expect(nets).toEqual(['+$10', '−$5', '−$5']);
    const perGame = [...document.querySelectorAll('.pg-net')].map((e) => e.textContent);
    expect(perGame).toEqual(['Al+$10', 'Bo−$5', 'Cy−$5']);
  });

  it('keeps the stake an unsigned amount', () => {
    render(<MoneyBoard round={round} onChange={() => {}} />);
    expect(document.querySelector('.pergame-stake')?.textContent).toBe('$5 per skin');
  });
});
