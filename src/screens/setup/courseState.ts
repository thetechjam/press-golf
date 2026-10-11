import type { Hole, SavedCourse } from '../../types';
import { sliceCourseHoles, type FetchedCourse } from '../../courses/openGolfApi';
import { scorecardIssues } from '../../courses/validate';
import { strokeIndexProblem, type StrokeIndexProblem } from '../../games/strokeIndex';
import { validSlope, validRating, courseHandicap } from '../../games/courseHandicap';

/**
 * The course half of New Round: the name, the holes, where they came from,
 * and the figures that turn an Index into strokes.
 *
 * One reducer rather than a dozen `useState`s because these move together.
 * Loading a course rewrites the name, the holes, the source card, the nine,
 * the stroke-index editor, the provenance, the slope and rating and the
 * confirmation note in one go, and every one of those used to be its own
 * setter call in two near-identical loaders. Here each transition is one
 * case, written once, and the invariants between the fields — a note never
 * outlives the holes it describes, a loaded card is what a nine is sliced
 * from — are kept in the one place that changes them.
 */

export type HolesSource = 'manual' | 'search' | 'saved';
export type Nine = 'front' | 'back';
export type NoteRow = 'course' | 'holes' | 'check';

export interface CourseState {
  course: string;
  holeCount: number;
  holes: Hole[];
  /** Slope and rating of the course, when the user knows them. */
  slope: number | undefined;
  rating: number | undefined;
  /**
   * How many holes the rating above covers.
   *
   * Loading an eighteen-hole course to play nine is the case this exists for:
   * the rating is for eighteen, and saying so is what lets it be halved rather
   * than judged against nine holes and thrown out. A rating typed by hand is
   * for the holes on screen, so it tracks the hole count.
   */
  ratingHoles: number | undefined;
  /** Whether the stroke-index editor is open. */
  advancedHoles: boolean;
  /**
   * Where the pars and stroke indexes currently on screen came from.
   *
   * Only 'search' earns a warning. Course search is open community data and is
   * sometimes wrong — a par off by one quietly changes every net score and
   * every Stableford point for the whole round. A course the user saved
   * themselves, or a preset they chose, needs no such caveat.
   */
  holesSource: HolesSource;
  /**
   * What course search handed over, kept so the problems with it can be
   * re-read from the holes as they stand rather than reported once and left
   * stale. Fixing a par should make the line about that par go away.
   *
   * `raw` is the unsliced response — see `scorecardIssues` for why the stroke
   * index check needs it. `expected` is the hole count that was asked for,
   * which the hole count itself no longer tells us: a short import sets the
   * round to the number of holes that arrived.
   */
  imported: { raw: Hole[]; expected: number } | null;
  /**
   * The whole card a course was loaded from, saved or searched. Switching to
   * nine used to keep holes 1–9 with their eighteen-hole stroke indexes —
   * unusable as a ranking, so strokes fell in hole order — and switching back
   * brought holes 10–18 up as blank par 4s. The card is kept so either count
   * is a slice of it, and a nine can be the back nine.
   */
  source: Hole[] | null;
  nine: Nine;
  /**
   * A confirmation of something the user just did, and the row it happened in.
   *
   * The row matters: rendered once at the foot of the screen, as it was, the
   * note appeared over a thousand pixels below the fold on a phone — a
   * confirmation nobody could see is not a confirmation. It is shown beside
   * the control that produced it instead.
   */
  savedNote: { text: string; row: NoteRow } | null;
}

export type CourseAction =
  | { type: 'course'; name: string }
  | { type: 'loadSaved'; course: SavedCourse }
  | { type: 'loadSearch'; course: FetchedCourse }
  | { type: 'holeCount'; count: number }
  | { type: 'nine'; nine: Nine }
  | { type: 'preset'; kind: 'par4' | 'standard' }
  | { type: 'par'; number: number; par: number }
  | { type: 'strokeIndex'; number: number; si: number | undefined }
  | { type: 'toggleAdvanced' }
  | { type: 'slope'; value: number | undefined }
  | { type: 'rating'; value: number | undefined }
  /** The course on screen was just saved as a favourite, from one of two buttons. */
  | { type: 'saved'; name: string; from: 'check' | 'foot' }
  | { type: 'clearNote' };

export function makeHoles(count: number): Hole[] {
  return Array.from({ length: count }, (_, i) => ({ number: i + 1, par: 4 }));
}

// A common par-72 layout, repeated for 9 or 18 holes.
const STANDARD_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];

export const initialCourseState: CourseState = {
  course: '',
  holeCount: 18,
  holes: makeHoles(18),
  slope: undefined,
  rating: undefined,
  ratingHoles: undefined,
  advancedHoles: false,
  holesSource: 'manual',
  imported: null,
  source: null,
  nine: 'front',
  savedNote: null,
};

export function courseReducer(state: CourseState, action: CourseAction): CourseState {
  switch (action.type) {
    case 'course':
      return { ...state, course: action.name };

    case 'loadSaved': {
      const c = action.course;
      // A 27-hole card can arrive by link. The round is a nine or an eighteen —
      // Nassau's nines, the Front/Back split and the rating all assume it — so
      // anything longer plays as its first eighteen.
      const applied =
        c.holes.length > 18 ? sliceCourseHoles(c.holes, 18) : c.holes.map((h) => ({ ...h }));
      return {
        ...state,
        course: c.name,
        holeCount: applied.length,
        holes: applied,
        source: applied.length >= 18 ? applied : null,
        nine: 'front',
        advancedHoles: applied.some((h) => h.strokeIndex),
        holesSource: 'saved',
        imported: null,
        slope: c.slope,
        // The rating describes the whole card; it is not carried onto a cut one.
        rating: c.holes.length > 18 ? undefined : c.rating,
        ratingHoles: applied.length,
        savedNote: {
          text:
            c.holes.length > 18
              ? `Loaded the first 18 of "${c.name}" (${c.holes.length} holes)`
              : `Loaded "${c.name}"`,
          row: 'course',
        },
      };
    }

    case 'loadSearch': {
      const c = action.course;
      const count =
        state.holeCount <= 9 ? Math.min(9, c.holes.length) : Math.min(18, c.holes.length);
      const applied = sliceCourseHoles(c.holes, count);
      return {
        ...state,
        course: c.name,
        holeCount: count,
        holes: applied,
        source: c.holes.length >= 18 ? sliceCourseHoles(c.holes, 18) : null,
        nine: 'front',
        advancedHoles: applied.some((h) => h.strokeIndex),
        holesSource: 'search',
        imported: { raw: c.holes, expected: count },
        // Search data carries no slope or rating, and the ones on screen were
        // the last course's: left in place they converted every Index with the
        // wrong course's figures and went onto the round as that course's.
        slope: undefined,
        rating: undefined,
        ratingHoles: undefined,
        savedNote: {
          text: applied.some((h) => h.strokeIndex)
            ? `Loaded "${c.name}" — par + stroke index`
            : `Loaded "${c.name}" — par only (no stroke index in database)`,
          row: 'course',
        },
      };
    }

    case 'holeCount': {
      const n = action.count;
      if (state.source) {
        // A slice of the card that was loaded: the stroke indexes are re-ranked
        // for the nine, and eighteen is the whole card again. The note and the
        // source stay, because these are still that course's numbers.
        return {
          ...state,
          holeCount: n,
          holes: sliceCourseHoles(state.source, n, { nine: n === 9 ? state.nine : undefined }),
          imported: state.imported ? { ...state.imported, expected: n } : state.imported,
        };
      }
      // keep any pars the user already edited
      const holes = makeHoles(n).map((h) => state.holes.find((p) => p.number === h.number) ?? h);
      // A loaded/saved note describes a specific hole count and par set; changing
      // the count invalidates it before the user can act on stale information.
      return { ...state, holeCount: n, holes, savedNote: null, holesSource: 'manual', imported: null };
    }

    case 'nine':
      // Which nine of a loaded eighteen a nine-hole round plays.
      if (!state.source) return state;
      return {
        ...state,
        nine: action.nine,
        holes: sliceCourseHoles(state.source, 9, { nine: action.nine }),
      };

    case 'preset':
      return {
        ...state,
        holes: state.holes.map((h, i) => ({
          ...h,
          par: action.kind === 'par4' ? 4 : STANDARD_PARS[i % 18],
        })),
        // Same reasoning as 'holeCount': a bulk par overwrite makes any
        // loaded/saved note describe a course that no longer matches the holes —
        // and these are the user's own pars now, not the database's.
        savedNote: null,
        holesSource: 'manual',
      };

    case 'par':
      return {
        ...state,
        holes: state.holes.map((h) => (h.number === action.number ? { ...h, par: action.par } : h)),
        // Carried into the loaded card too, so a corrected par survives a switch
        // between nine and eighteen. Hole numbers match: a back nine is 10–18
        // on both.
        source:
          state.source &&
          state.source.map((h) => (h.number === action.number ? { ...h, par: action.par } : h)),
        // A single hand-edited par is still enough to make the loaded/saved note
        // describe a course the holes no longer match.
        savedNote: null,
      };

    case 'strokeIndex':
      return {
        ...state,
        holes: state.holes.map((h) =>
          h.number === action.number ? { ...h, strokeIndex: action.si } : h
        ),
      };

    case 'toggleAdvanced': {
      const next = !state.advancedHoles;
      return {
        ...state,
        advancedHoles: next,
        // Seed stroke indexes in hole order so nothing is blank.
        holes: next
          ? state.holes.map((h, i) => (h.strokeIndex ? h : { ...h, strokeIndex: i + 1 }))
          : state.holes,
      };
    }

    case 'slope':
      return { ...state, slope: action.value };

    case 'rating':
      return { ...state, rating: action.value, ratingHoles: state.holes.length };

    case 'saved':
      return {
        ...state,
        savedNote: { text: `Saved "${action.name}"`, row: action.from === 'check' ? 'check' : 'holes' },
        // Keeping a course is the user vouching for it, so the "check this against
        // the card" caveat has served its purpose and goes. From here their copy
        // is the one that loads, and search is only ever saving them the typing.
        holesSource: 'saved',
        imported: null,
      };

    case 'clearNote':
      return { ...state, savedNote: null };
  }
}

/** What the screen reads off the state, recomputed every render. */
export interface DerivedCourse {
  /** The holes the rating covers — the number it is judged against. */
  ratedHoles: number;
  /**
   * Whether these holes carry figures good enough to work a course handicap
   * out from an Index. Both have to be plausible: a slope alone, or a rating
   * left over from a different number of holes, would produce a confident
   * wrong answer rather than no answer.
   */
  rated: boolean;
  /** The course handicap an Index is worth here, for showing beside the field. */
  derivedHandicap: (index: number | undefined) => number | null;
  /** What looks wrong with an imported card, re-read so a fix clears its line. */
  importIssues: string[];
  /** Only surfaced while the stroke index editor is open. */
  siProblem: StrokeIndexProblem | null;
}

export function deriveCourse(s: CourseState): DerivedCourse {
  // Judged against the holes the rating covers, not the holes being played —
  // otherwise an eighteen-hole rating loaded to play nine reads as implausible
  // and the Index column never appears.
  const ratedHoles = s.ratingHoles ?? s.holes.length;
  const rated = validSlope(s.slope) && validRating(s.rating, ratedHoles);
  const derivedHandicap = (index: number | undefined): number | null => {
    if (!rated || index == null || Number.isNaN(index)) return null;
    return courseHandicap({
      index,
      slope: s.slope as number,
      rating: s.rating as number,
      ratingHoles: ratedHoles,
      playingHoles: s.holes.length,
      playingPar: s.holes.reduce((sum, h) => sum + h.par, 0),
    });
  };
  const importIssues =
    s.holesSource === 'search' && s.imported
      ? scorecardIssues(s.holes, s.imported.expected, s.imported.raw)
      : [];
  return { ratedHoles, rated, derivedHandicap, importIssues, siProblem: strokeIndexProblem(s.holes) };
}
