import { describe, it, expect } from 'vitest';
import {
  strokeIndexProblem,
  strokeIndexesUsable,
  describeStrokeIndexProblem,
} from './strokeIndex';
import { strokeIndexMap, totalStrokesReceived } from './handicap';
import { makeRound, player, holes } from './testFixtures';
import type { Hole } from '../types';

/** `n` par-4 holes carrying the given stroke indexes in hole order. */
const withSi = (si: (number | undefined)[]): Hole[] =>
  si.map((s, i) => ({ number: i + 1, par: 4, ...(s == null ? {} : { strokeIndex: s }) }));

describe('strokeIndexProblem', () => {
  it('is happy with a proper ranking', () => {
    expect(strokeIndexProblem(withSi([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeNull();
  });

  it('does not care what order the ranking is in', () => {
    expect(strokeIndexProblem(withSi([9, 4, 1, 7, 2, 8, 3, 6, 5]))).toBeNull();
  });

  it('is happy when nothing is set at all — that is "not set", not "wrong"', () => {
    expect(strokeIndexProblem(withSi([...Array(9)]))).toBeNull();
  });

  it('reports a set that is only half filled in', () => {
    const p = strokeIndexProblem(withSi([1, 2, undefined, 4, 5, 6, 7, 8, undefined]));
    expect(p).toEqual({ kind: 'partial', holes: [3, 9] });
  });

  it('reports an index above the hole count', () => {
    // The 18-hole course's indexes typed onto a nine — a real mistake, and one
    // that quietly shorts the player on shots.
    const p = strokeIndexProblem(withSi([1, 3, 5, 7, 9, 11, 13, 15, 17]));
    expect(p).toEqual({ kind: 'range', holes: [6, 7, 8, 9] });
  });

  it('reports an index below one', () => {
    expect(strokeIndexProblem(withSi([0, 2, 3]))).toEqual({ kind: 'range', holes: [1] });
  });

  it('reports a rank used twice', () => {
    const p = strokeIndexProblem(withSi([1, 1, 3]));
    expect(p).toEqual({ kind: 'duplicate', values: [1] });
  });

  it('reports every repeated rank, in order', () => {
    const p = strokeIndexProblem(withSi([3, 3, 1, 1]));
    expect(p).toEqual({ kind: 'duplicate', values: [1, 3] });
  });

  it('has nothing to say about no holes', () => {
    expect(strokeIndexProblem([])).toBeNull();
  });
});

describe('strokeIndexesUsable', () => {
  it('is true only for a complete, valid ranking', () => {
    expect(strokeIndexesUsable(withSi([2, 1, 3]))).toBe(true);
    expect(strokeIndexesUsable(withSi([1, 1, 3]))).toBe(false);
    expect(strokeIndexesUsable(withSi([1, 2, undefined]))).toBe(false);
    expect(strokeIndexesUsable(withSi([...Array(3)]))).toBe(false);
  });
});

describe('what allocation does with an unusable set', () => {
  const strokesOn = (si: (number | undefined)[], hcp: number) => {
    const hs = withSi(si);
    const round = makeRound({ holes: hs, players: [player('p1', 'Al', hcp)] });
    return { map: strokeIndexMap(round), total: totalStrokesReceived(round, 'p1') };
  };

  it('gives a player every shot their handicap is owed, whatever the data', () => {
    // Nine holes all indexed 5 — the shape bad course data takes. Read
    // literally, a 4-handicap gets a shot wherever the index is 4 or lower and
    // so gets nothing at all, while a 6-handicap gets one on every hole. Both
    // are wrong by the only measure that matters at settle-up: the count.
    expect(strokesOn(Array(9).fill(5), 4).total).toBe(4);
    expect(strokesOn(Array(9).fill(5), 6).total).toBe(6);
  });

  it('falls back to hole order, the same as an unset course', () => {
    expect(strokesOn(Array(9).fill(5), 4).map).toEqual(
      strokeIndexMap(makeRound({ holes: holes(9).map((h) => ({ number: h.number, par: h.par })) }))
    );
  });

  it('still honours a set that is merely unusual but valid', () => {
    // Hardest hole last: unusual, entirely legal, and left alone.
    const { map, total } = strokesOn([9, 8, 7, 6, 5, 4, 3, 2, 1], 3);
    expect(map[9]).toBe(1);
    expect(total).toBe(3);
  });

  it('shorts nobody when the eighteen-hole indexes land on a nine', () => {
    // Read literally this gives a 5-handicap three shots instead of five.
    expect(strokesOn([1, 3, 5, 7, 9, 11, 13, 15, 17], 5).total).toBe(5);
  });
});

describe('describeStrokeIndexProblem', () => {
  it('names the holes with no index', () => {
    expect(describeStrokeIndexProblem({ kind: 'partial', holes: [3] }, 9)).toBe(
      'Hole 3 has no stroke index.'
    );
    expect(describeStrokeIndexProblem({ kind: 'partial', holes: [3, 9] }, 9)).toBe(
      'Holes 3 and 9 have no stroke index.'
    );
  });

  it('names the out-of-range holes and the range they should be in', () => {
    expect(describeStrokeIndexProblem({ kind: 'range', holes: [6, 7, 8] }, 9)).toBe(
      'Holes 6, 7 and 8 have a stroke index outside 1–9.'
    );
  });

  it('names the repeated ranks and says what is wanted instead', () => {
    expect(describeStrokeIndexProblem({ kind: 'duplicate', values: [5] }, 18)).toBe(
      'Stroke index 5 is used more than once — each hole needs its own rank from 1 to 18.'
    );
  });
});
