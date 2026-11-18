import { describe, it, expect } from 'vitest';
import { sliceCourseHoles } from '../../courses/openGolfApi';
import { realCard18 } from '../../games/testFixtures';
import { courseToSave, mergeNineIntoCard } from './courseState';

describe('mergeNineIntoCard', () => {
  it('gives back the card unchanged when the nine was not edited', () => {
    const card = realCard18();
    for (const nine of ['front', 'back'] as const) {
      expect(mergeNineIntoCard(card, sliceCourseHoles(card, 9, { nine }), nine)).toEqual(card);
    }
  });

  it('writes a back nine into the last nine of a 27-hole card, not holes 10–18', () => {
    const card = [...realCard18(), ...realCard18().slice(0, 9).map((h) => ({ ...h, number: h.number + 18 }))];
    const back = sliceCourseHoles(card, 9, { nine: 'back' }).map((h) => ({ ...h, par: 6 }));
    const out = mergeNineIntoCard(card, back, 'back');
    expect(out.slice(18).every((h) => h.par === 6)).toBe(true);
    expect(out.slice(0, 18)).toEqual(card.slice(0, 18));
  });

  it('keeps the card’s stroke indexes when the nine’s are not a full ranking', () => {
    const card = realCard18();
    const front = sliceCourseHoles(card, 9).map((h) => ({ ...h, strokeIndex: 1 }));
    expect(mergeNineIntoCard(card, front, 'front').map((h) => h.strokeIndex)).toEqual(
      card.map((h) => h.strokeIndex)
    );
  });
});

describe('courseToSave', () => {
  const base = { name: 'X', nine: 'front' as const, slope: 120, existing: undefined };

  it('drops a rating that covers a different number of holes than are saved', () => {
    const out = courseToSave({
      ...base,
      holes: realCard18().slice(0, 9),
      source: null,
      rating: 72,
      ratingHoles: 18,
    });
    expect('refused' in out ? null : out.rating).toBeUndefined();
  });

  it('keeps the saved card’s rating when the one on screen was typed for the nine', () => {
    const card = realCard18();
    const out = courseToSave({
      ...base,
      holes: sliceCourseHoles(card, 9),
      source: card,
      rating: 36,
      ratingHoles: 9,
      existing: { id: 'c', name: 'X', holes: card, rating: 72.4 },
    });
    expect('refused' in out ? null : [out.holes.length, out.rating]).toEqual([18, 72.4]);
  });
});
