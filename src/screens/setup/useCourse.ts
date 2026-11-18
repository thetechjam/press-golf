import { useReducer, useState } from 'react';
import type { SavedCourse } from '../../types';
import type { FetchedCourse } from '../../courses/openGolfApi';
import { uid, listCourses, saveCourse, deleteCourse, COURSES_KEY } from '../../storage';
import { notSavedReason } from '../../notSaved';
import { courseReducer, deriveCourse, initialCourseState } from './courseState';

interface Options {
  /** Opens one of the screen's collapsible rows (see SetupRow). */
  openRow: (key: 'course' | 'holes') => void;
  setError: (message: string) => void;
}

/**
 * The course and holes half of a setup screen: the reducer, the saved
 * courses, and what loading, saving and deleting one does.
 *
 * Lifted out of New Round so a Scramble is set up on the same course controls
 * rather than a copy of them that drifts — a fix to how a searched card is
 * checked or a saved one is kept then reaches both screens. The rows and the
 * error line stay the screen's own; this only asks to open one or write the
 * other.
 */
export function useCourse({ openRow, setError }: Options) {
  const [cs, dispatch] = useReducer(courseReducer, initialCourseState);
  const derived = deriveCourse(cs);
  const [courses, setCourses] = useState<SavedCourse[]>(listCourses());
  // The saved course being handed out, if any — see the QR button on each row.
  const [sendingCourse, setSendingCourse] = useState<SavedCourse | null>(null);

  /**
   * Both course loaders open the Holes & pars row. Either one rewrites up to
   * eighteen pars and stroke indexes at a stroke, and doing that behind a
   * collapsed section is how a wrong number reaches the first tee unseen. What
   * differs between them is the warning, not whether the numbers are shown:
   * only search data is second-guessed — see the reducer.
   */
  const loadCourse = (c: SavedCourse) => {
    dispatch({ type: 'loadSaved', course: c });
    openRow('holes');
  };

  const loadFromApi = (c: FetchedCourse) => {
    dispatch({ type: 'loadSearch', course: c });
    openRow('holes');
    setError('');
  };

  /**
   * `from` is which button asked, because that is where the answer has to
   * appear. The two are a screen apart: the check note sits at the top of
   * Holes & pars and the ghost button below the whole par grid, so a single
   * note slot at the foot means saving from the top makes the caveat vanish
   * and puts the confirmation a thousand pixels down, out of sight. Same
   * failure the note was moved out of the page footer to avoid.
   */
  const saveFavorite = (from: 'check' | 'foot' = 'foot') => {
    const name = cs.course.trim();
    if (!name) {
      openRow('course');
      setError('Add a course name (in the Course row) before saving.');
      return;
    }
    const existing = courses.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const saved = saveCourse({
      id: existing?.id ?? uid(),
      name,
      holes: cs.holes.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex })),
      slope: cs.slope,
      rating: cs.rating,
    });
    if (!saved) {
      setError(`Not saved. This course wasn’t kept. ${notSavedReason(COURSES_KEY)}`);
      return;
    }
    setCourses(listCourses());
    setError('');
    dispatch({ type: 'saved', name, from });
  };

  const removeCourse = (id: string) => {
    if (!deleteCourse(id)) {
      setError(`Not saved. That course wasn’t deleted. ${notSavedReason(COURSES_KEY, true)}`);
    }
    setCourses(listCourses());
  };

  return {
    cs,
    dispatch,
    derived,
    courses,
    /** Re-reads the saved courses, after a restore from the settings sheet. */
    reloadCourses: () => setCourses(listCourses()),
    sendingCourse,
    setSendingCourse,
    loadCourse,
    loadFromApi,
    saveFavorite,
    removeCourse,
  };
}
