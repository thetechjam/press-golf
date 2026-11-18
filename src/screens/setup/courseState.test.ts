import { describe, it, expect } from 'vitest';
import { courseReducer, deriveCourse, initialCourseState, type CourseAction, type CourseState } from './courseState';
import type { CourseTee, FetchedCourse } from '../../courses/openGolfApi';
import type { SavedCourse } from '../../types';
import { realCard18 } from '../../games/testFixtures';

const TEES: CourseTee[] = [
  { key: 'blue-male', name: 'Blue', gender: 'Male', rating: 70.8, slope: 121, yardage: 6625 },
  { key: 'white-male', name: 'White', gender: 'Male', rating: 69.4, slope: 118, yardage: 6326 },
];

const searched = (over: Partial<FetchedCourse> = {}): FetchedCourse => ({
  id: 'd',
  name: 'Delcastle Golf Course',
  holes: realCard18(),
  hasStrokeIndex: true,
  par: 72,
  tees: TEES,
  ...over,
});

const run = (actions: CourseAction[], from: CourseState = initialCourseState) =>
  actions.reduce(courseReducer, from);

describe('tees from a course search pick', () => {
  it('are kept, with none chosen and nothing filled in', () => {
    const s = run([{ type: 'loadSearch', course: searched() }]);
    expect(s.tees).toEqual({ course: 'Delcastle Golf Course', options: TEES, holes: 18, picked: null });
    expect(s.slope).toBeUndefined();
    expect(s.rating).toBeUndefined();
  });

  it('are not offered when the record had none', () => {
    expect(run([{ type: 'loadSearch', course: searched({ tees: [] }) }]).tees).toBeNull();
  });

  it('fill in slope and rating for the whole card when one is picked', () => {
    const s = run([
      { type: 'loadSearch', course: searched() },
      { type: 'tee', key: 'white-male' },
    ]);
    expect(s).toMatchObject({ slope: 118, rating: 69.4, ratingHoles: 18 });
    expect(s.tees?.picked).toBe('white-male');
    expect(deriveCourse(s).rated).toBe(true);
  });

  it('rate a nine off an eighteen-hole card the way a saved eighteen loaded for nine is', () => {
    const nine = run([{ type: 'holeCount', count: 9 }]);
    const fromSearch = run(
      [
        { type: 'loadSearch', course: searched() },
        { type: 'tee', key: 'white-male' },
      ],
      nine
    );
    const saved: SavedCourse = { id: 's', name: 'Delcastle', holes: realCard18(), slope: 118, rating: 69.4 };
    const fromSaved = run(
      [
        { type: 'loadSaved', course: saved },
        { type: 'holeCount', count: 9 },
      ],
      nine
    );

    expect(fromSearch.holes).toHaveLength(9);
    expect(fromSearch.ratingHoles).toBe(18);
    expect(fromSearch.ratingHoles).toBe(fromSaved.ratingHoles);
    const a = deriveCourse(fromSearch);
    const b = deriveCourse(fromSaved);
    expect(a.rated).toBe(true);
    expect(a.ratedHoles).toBe(b.ratedHoles);
    // The same Index is worth the same strokes on the same nine either way.
    expect(a.derivedHandicap(14)).toBe(b.derivedHandicap(14));
    expect(a.derivedHandicap(14)).not.toBeNull();
  });

  it('keep the eighteen-hole rating when the nine is switched after the pick', () => {
    const s = run([
      { type: 'loadSearch', course: searched() },
      { type: 'tee', key: 'blue-male' },
      { type: 'holeCount', count: 9 },
      { type: 'nine', nine: 'back' },
    ]);
    expect(s).toMatchObject({ ratingHoles: 18, rating: 70.8 });
    expect(deriveCourse(s).rated).toBe(true);
  });

  it('read a nine-hole course’s own rating as nine holes', () => {
    const s = run([
      { type: 'loadSearch', course: searched({ holes: realCard18().slice(0, 9), tees: [{ ...TEES[0], rating: 35.4 }] }) },
      { type: 'tee', key: 'blue-male' },
    ]);
    expect(s.ratingHoles).toBe(9);
    expect(deriveCourse(s).rated).toBe(true);
  });

  it('read an eighteen-hole figure on a nine-hole course as eighteen, which is what it is', () => {
    const s = run([
      { type: 'loadSearch', course: searched({ holes: realCard18().slice(0, 9) }) },
      { type: 'tee', key: 'white-male' },
    ]);
    expect(s.ratingHoles).toBe(18);
    expect(deriveCourse(s).rated).toBe(true);
  });

  it('stop showing a tee as chosen once either figure is typed over', () => {
    const picked = run([
      { type: 'loadSearch', course: searched() },
      { type: 'tee', key: 'white-male' },
    ]);
    const slope = courseReducer(picked, { type: 'slope', value: 120 });
    expect(slope.tees?.picked).toBeNull();
    expect(slope.tees?.options).toBe(TEES);
    expect(slope.rating).toBe(69.4);

    const rating = courseReducer(picked, { type: 'rating', value: 70 });
    expect(rating.tees?.picked).toBeNull();
    // Typed by hand, the rating is for the holes on screen, as it always was.
    expect(rating.ratingHoles).toBe(18);
  });

  it('ignore a key that is not one of them', () => {
    const s = run([{ type: 'loadSearch', course: searched() }]);
    expect(courseReducer(s, { type: 'tee', key: 'nope' })).toBe(s);
    expect(courseReducer(initialCourseState, { type: 'tee', key: 'white-male' })).toBe(initialCourseState);
  });

  it('go when a saved course is loaded', () => {
    const s = run([
      { type: 'loadSearch', course: searched() },
      { type: 'loadSaved', course: { id: 's', name: 'Elsewhere', holes: realCard18() } },
    ]);
    expect(s.tees).toBeNull();
  });

  it('are replaced when a different course is picked', () => {
    const other: CourseTee[] = [{ key: 'g', name: 'Green', rating: 66, slope: 110 }];
    const s = run([
      { type: 'loadSearch', course: searched() },
      { type: 'tee', key: 'white-male' },
      { type: 'loadSearch', course: searched({ name: 'Ed Oliver', tees: other }) },
    ]);
    expect(s.tees).toEqual({ course: 'Ed Oliver', options: other, holes: 18, picked: null });
    expect(s.slope).toBeUndefined();
  });

  it('go once the course name is edited away from the course they belong to', () => {
    const loaded = run([{ type: 'loadSearch', course: searched() }]);
    expect(courseReducer(loaded, { type: 'course', name: 'Delcastle Golf Cours' }).tees).toBeNull();
    // A name set to what it already says is not an edit away.
    expect(courseReducer(loaded, { type: 'course', name: 'Delcastle Golf Course' }).tees).toBe(loaded.tees);
  });
});

describe('the stated par of a searched course', () => {
  const delcastle = realCard18().map((h, i) => ({ ...h, par: i < 15 ? 5 : h.par }));

  it('is held against the holes', () => {
    const s = run([{ type: 'loadSearch', course: searched({ holes: delcastle }) }]);
    expect(deriveCourse(s).importIssues[0]).toMatch(/add up to 87, but the course lists par 72/);
  });

  it('stops being contradicted once the pars are fixed by hand', () => {
    const fixes: CourseAction[] = realCard18().map((h) => ({ type: 'par', number: h.number, par: h.par }));
    const s = run([{ type: 'loadSearch', course: searched({ holes: delcastle }) }, ...fixes]);
    expect(deriveCourse(s).importIssues).toEqual([]);
  });

  it('is judged on the whole card while a nine is played', () => {
    const s = run([
      { type: 'loadSearch', course: searched({ holes: delcastle }) },
      { type: 'holeCount', count: 9 },
      { type: 'nine', nine: 'back' },
    ]);
    expect(deriveCourse(s).importIssues.join(' ')).toMatch(/add up to 87/);
  });
});
