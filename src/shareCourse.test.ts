import { describe, it, expect } from 'vitest';
import type { SavedCourse } from './types';
import {
  COURSE_FORMAT,
  packCourse,
  unpackCourse,
  encodeCourse,
  decodeCourse,
  courseClash,
  describeChanges,
  asSeparateCourse,
} from './shareCourse';
import { encodeQR } from './qr';
import { shareUrlQR } from './shareLink';

/** A real card: eighteen holes, ranked, with a slope and rating. */
const torrey: SavedCourse = {
  id: 'local001',
  name: 'Torrey Pines South',
  holes: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5].map((par, i) => ({
    number: i + 1,
    par,
    strokeIndex: [7, 3, 15, 1, 9, 17, 5, 11, 13, 8, 18, 2, 4, 10, 16, 6, 12, 14][i],
  })),
  slope: 129,
  rating: 74.6,
};

const changed = (over: Partial<SavedCourse>): SavedCourse => ({ ...torrey, ...over });

describe('a course in a link', () => {
  it('comes back hole for hole', async () => {
    const result = await decodeCourse(await encodeCourse(torrey));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.course.name).toBe('Torrey Pines South');
    expect(result.course.holes).toEqual(torrey.holes);
    expect(result.course.slope).toBe(129);
    expect(result.course.rating).toBe(74.6);
  });

  it('does not carry the sender’s id, which means nothing on another phone', async () => {
    // An id here is "this record on this phone". Carrying the sender's would
    // let their record overwrite a differently-edited one of yours by id,
    // behind the name match that is supposed to be the only way they meet.
    expect(JSON.stringify(packCourse(torrey))).not.toContain('local001');
    const result = await decodeCourse(await encodeCourse(torrey));
    if (result.ok) expect(result.course.id).not.toBe('local001');
  });

  it('carries a card with no stroke index at all', async () => {
    const bare = changed({ holes: torrey.holes.map((h) => ({ number: h.number, par: h.par })) });
    const result = await decodeCourse(await encodeCourse(bare));
    if (!result.ok) throw new Error(result.error);
    expect(result.course.holes.every((h) => h.strokeIndex === undefined)).toBe(true);
  });

  it('drops a slope or rating that cannot be real rather than carrying it', async () => {
    // Both are load-bearing — they turn a Handicap Index into strokes — so a
    // wrong one is worse than a missing one, which just falls back to the
    // typed-in handicap.
    const wrong = changed({ slope: 900, rating: 74.6 });
    const result = await decodeCourse(await encodeCourse(wrong));
    if (!result.ok) throw new Error(result.error);
    expect(result.course.slope).toBeUndefined();
    expect(result.course.rating).toBe(74.6);
  });

  it('drops an eighteen-hole rating sent on a nine-hole card', async () => {
    const nine = changed({ holes: torrey.holes.slice(0, 9), rating: 74.6, slope: 129 });
    const result = await decodeCourse(await encodeCourse(nine));
    if (!result.ok) throw new Error(result.error);
    expect(result.course.rating).toBeUndefined();
    expect(result.course.slope).toBe(129);
  });

  it('fits in a QR code far smaller than a round’s', async () => {
    const url = shareUrlQR('https://pressgolf.netlify.app/', await encodeCourse(torrey), 'c');
    const code = encodeQR(url)!;
    // A round is version 13. This is the code you hold up on the first tee.
    expect(code.version).toBeLessThanOrEqual(8);
  });
});

describe('reading a course link that cannot be trusted', () => {
  const packed = () => packCourse(torrey) as Record<string, unknown>;

  it('refuses one written by a newer Press', () => {
    const result = unpackCourse({ ...packed(), v: COURSE_FORMAT + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('newer version');
  });

  it('refuses a par that is not a number', () => {
    // It would reach every net score, Stableford point and Quota target.
    expect(unpackCourse({ ...packed(), h: [[4, 1], ['four', 2]] }).ok).toBe(false);
  });

  it('refuses something that is not a scorecard at all', () => {
    expect(unpackCourse(null).ok).toBe(false);
    expect(unpackCourse({ ...packed(), n: '' }).ok).toBe(false);
    expect(unpackCourse({ ...packed(), n: 'x'.repeat(200) }).ok).toBe(false);
    expect(unpackCourse({ ...packed(), h: [] }).ok).toBe(false);
    expect(unpackCourse({ ...packed(), h: Array(400).fill([4, 1]) }).ok).toBe(false);
  });

  it('checks slope and rating again on the way in, not just on the way out', () => {
    // `packCourse` already refuses to send an implausible slope, so every test
    // that goes through `encodeCourse` exercises only that side. These are the
    // same numbers arriving from a payload this app did not write — which is
    // the only case the reading side exists for.
    const hostile = { ...packed(), sl: 900, ra: 74.6 };
    const result = unpackCourse(hostile);
    if (!result.ok) throw new Error(result.error);
    expect(result.course.slope).toBeUndefined();
    expect(result.course.rating).toBe(74.6);
  });

  it('judges an arriving rating against the holes it came with', () => {
    // An eighteen-hole rating on a nine-hole card: near enough to look fine,
    // and twice what it should be.
    const nine = { ...packed(), h: packCourse(torrey).h.slice(0, 9), ra: 74.6 };
    const result = unpackCourse(nine);
    if (!result.ok) throw new Error(result.error);
    expect(result.course.rating).toBeUndefined();
  });

  it('ignores an id smuggled into the payload', () => {
    // Press never sends one. A payload carrying one would, if trusted, let a
    // stranger's record overwrite a saved course of yours by id — behind the
    // name match that is meant to be the only way the two ever meet.
    const result = unpackCourse({ ...packed(), id: 'local001' });
    if (!result.ok) throw new Error(result.error);
    expect(result.course.id).not.toBe('local001');
  });

  it('reports a damaged link instead of throwing', async () => {
    const whole = await encodeCourse(torrey);
    expect((await decodeCourse('')).ok).toBe(false);
    expect((await decodeCourse('!!!!')).ok).toBe(false);
    const half = await decodeCourse(whole.slice(0, Math.floor(whole.length / 2)));
    expect(half.ok).toBe(false);
    if (!half.ok) expect(half.error).toContain('damaged');
  });

  it('numbers the holes itself rather than trusting the sender to', async () => {
    const result = await decodeCourse(await encodeCourse(torrey));
    if (!result.ok) throw new Error(result.error);
    expect(result.course.holes.map((h) => h.number)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1)
    );
  });
});

describe('meeting a course already saved here', () => {
  it('is new when nothing here shares the name', () => {
    expect(courseClash(torrey, []).kind).toBe('new');
    expect(courseClash(torrey, [changed({ name: 'Pebble Beach' })]).kind).toBe('new');
  });

  it('matches by name, however it was typed', () => {
    // How a person identifies a course, and how Setup already decides whether
    // saving a favourite is an edit or a new entry.
    expect(courseClash(torrey, [changed({ name: '  torrey pines south ' })]).kind).toBe('same');
  });

  it('says nothing to decide when the cards agree', () => {
    expect(courseClash(torrey, [changed({ id: 'other' })]).kind).toBe('same');
  });

  it('counts a stroke index that disagrees as a difference', () => {
    // Two cards with the same pars and different ranks hand out handicap
    // strokes on different holes, which settles the round for different money.
    const mine = changed({
      holes: torrey.holes.map((h) => (h.number === 1 ? { ...h, strokeIndex: 2 } : h)),
    });
    expect(courseClash(torrey, [mine]).kind).toBe('differs');
  });

  it('counts a slope or rating that disagrees as a difference', () => {
    expect(courseClash(torrey, [changed({ slope: 131 })]).kind).toBe('differs');
    expect(courseClash(torrey, [changed({ rating: undefined })]).kind).toBe('differs');
  });

  it('names what differs, in terms you can check against the real card', () => {
    const mine = changed({
      holes: torrey.holes.map((h) => (h.number === 4 ? { ...h, par: 4 } : h)),
    });
    const clash = courseClash(torrey, [mine]);
    expect(clash.kind).toBe('differs');
    if (clash.kind !== 'differs') return;
    // "3 differences" tells you nothing you can act on.
    expect(clash.changes).toEqual(['Par differs on hole 4.']);
  });

  it('spells out a stroke index, a slope and a rating that disagree', () => {
    const mine = changed({
      holes: torrey.holes.map((h) => (h.number <= 2 ? { ...h, strokeIndex: 99 } : h)),
      slope: 131,
      rating: undefined,
    });
    expect(describeChanges(mine, torrey)).toEqual([
      'Stroke index differs on holes 1 and 2.',
      'Slope: yours 131, theirs 129.',
      'Rating: yours not set, theirs 74.6.',
    ]);
  });

  it('says so plainly when the hole counts differ, and stops there', () => {
    expect(describeChanges(changed({ holes: torrey.holes.slice(0, 9) }), torrey)).toEqual([
      'Yours has 9 holes, theirs has 18.',
    ]);
  });
});

describe('keeping both', () => {
  it('takes a name that will not be mistaken for yours', () => {
    const separate = asSeparateCourse(torrey, [torrey]);
    expect(separate.name).toBe('Torrey Pines South (sent)');
    expect(separate.id).not.toBe(torrey.id);
    expect(separate.holes).toEqual(torrey.holes);
  });

  it('keeps counting when that name is taken too', () => {
    const mine = [torrey, changed({ name: 'Torrey Pines South (sent)' })];
    expect(asSeparateCourse(torrey, mine).name).toBe('Torrey Pines South (sent 2)');
  });
});
