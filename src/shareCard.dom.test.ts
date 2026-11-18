// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Round } from './types';
import { renderShareCard } from './shareCard';

/**
 * The order of the results image.
 *
 * A chat preview crops a tall image from the top, so what the group opened it
 * for — who won and who pays whom — has to be drawn first, under the header,
 * with the boards and awards after it. Asserted on the text drawn, in order,
 * through a canvas that only records.
 */

let drawn: string[] = [];

beforeEach(() => {
  drawn = [];
  const ctx = new Proxy(
    {
      fillText: (t: string) => void drawn.push(t),
      measureText: (t: string) => ({ width: t.length * 20 }),
    } as Record<string, unknown>,
    {
      get: (target, key) => (key in target ? target[key as string] : () => {}),
      set: () => true,
    }
  );
  const real = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return real(tag);
    return {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (cb: (b: Blob) => void) => cb(new Blob(['png'])),
    };
  }) as typeof document.createElement);
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load: () => Promise.resolve([]) },
  });
});
afterEach(() => vi.restoreAllMocks());

const hs = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));
const round = (over: Partial<Round> = {}): Round => ({
  id: 'r1',
  course: 'Half Moon Bay',
  date: '2026-09-12',
  createdAt: 1,
  updatedAt: 2,
  players: [
    { id: 'p1', name: 'Al', handicap: 0 },
    { id: 'p2', name: 'Bo', handicap: 0 },
  ],
  holes: hs,
  games: ['skins'],
  options: {
    useNet: false,
    stablefordMode: 'standard',
    loneWolfMultiplier: 2,
    blindWolfMultiplier: 3,
    stakes: { skins: 5 },
  },
  // Bo's 8 on the first is a Snowman, so there are awards to place.
  scores: Object.fromEntries(hs.map((h) => [h.number, { p1: 4, p2: h.number === 1 ? 8 : 5 }])),
  wolf: {},
  status: 'finished',
  ...over,
});

const at = (text: string) => {
  const i = drawn.findIndex((t) => t.includes(text));
  expect(i, `"${text}" was not drawn`).toBeGreaterThanOrEqual(0);
  return i;
};

describe('the results image', () => {
  it('draws the winner and the settlement under the header, then the boards, then the awards', async () => {
    await renderShareCard(round());
    const header = at('HALF MOON BAY');
    const winner = at('AL WINS $45');
    const settlement = at('SETTLEMENT');
    const pays = at('BO PAYS AL');
    const board = at('SKINS');
    const awards = at('AWARDS');
    const signOff = at('SCORED WITH PRESS');
    expect(header).toBeLessThan(winner);
    expect(winner).toBeLessThan(settlement);
    expect(settlement).toBeLessThan(pays);
    expect(pays).toBeLessThan(board);
    expect(board).toBeLessThan(awards);
    expect(awards).toBeLessThan(signOff);
    expect(signOff).toBe(drawn.length - 1);
  });

  it('still leads with the winner, and still draws every board, when nothing is at stake', async () => {
    await renderShareCard(round({ options: { ...round().options, stakes: {} } }));
    expect(drawn.some((t) => t.includes('SETTLEMENT'))).toBe(false);
    // Without money the hero names the game it was won in, so the board's
    // own title is the second SKINS drawn.
    const titles = drawn.flatMap((t, i) => (t === 'SKINS' ? [i] : []));
    expect(titles).toHaveLength(2);
    expect(at('AL WINS')).toBeLessThan(titles[1]);
  });
});
