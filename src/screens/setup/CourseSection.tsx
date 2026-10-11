import type { Dispatch } from 'react';
import type { SavedCourse } from '../../types';
import type { FetchedCourse } from '../../courses/openGolfApi';
import { CourseSearch } from '../../components/CourseSearch';
import { SavedCourseList } from '../../components/SavedCourseList';
import { ParGrid } from '../../components/ParGrid';
import { StrokeIndexNote } from '../../components/StrokeIndexNote';
import { StarIcon } from '../../icons';
import type { CourseAction, CourseState, DerivedCourse } from './courseState';

interface CourseProps {
  course: string;
  onCourse: (name: string) => void;
  onPick: (course: FetchedCourse) => void;
  courses: SavedCourse[];
  onLoad: (course: SavedCourse) => void;
  onSend: (course: SavedCourse) => void;
  onRemove: (id: string) => void;
  /** The confirmation for this row, when the last thing done happened here. */
  note: string | null;
}

/** The body of New Round's Course row: the search field and the saved courses. */
export function CourseSection({ course, onCourse, onPick, courses, onLoad, onSend, onRemove, note }: CourseProps) {
  return (
    <>
      <CourseSearch value={course} onChange={onCourse} onPick={onPick} />

      <SavedCourseList courses={courses} onLoad={onLoad} onSend={onSend} onRemove={onRemove} />

      {note && (
        <p className="hint-inline" role="status">
          {note}
        </p>
      )}
    </>
  );
}

interface HolesProps {
  state: CourseState;
  derived: DerivedCourse;
  dispatch: Dispatch<CourseAction>;
  /** `from` is which button asked — see `saveFavorite` in Setup.tsx. */
  onSave: (from: 'check' | 'foot') => void;
}

/** The body of New Round's Holes & pars row. */
export function HolesSection({ state, derived, dispatch, onSave }: HolesProps) {
  const { holeCount, holes, source, nine, holesSource, savedNote, slope, rating, advancedHoles } =
    state;
  const { rated, importIssues, siProblem } = derived;

  return (
    <section className="card">
      <div className="seg">
        {[9, 18].map((n) => (
          <button
            key={n}
            className={`seg-btn${holeCount === n ? ' active' : ''}`}
            aria-pressed={holeCount === n}
            onClick={() => dispatch({ type: 'holeCount', count: n })}
          >
            {n} holes
          </button>
        ))}
      </div>
      {/* A nine off a loaded eighteen can be either nine. Golf League
          has always offered this; New Round only ever played the front. */}
      {holeCount === 9 && source && (
        <div className="seg nine-pick" role="group" aria-label="Which nine">
          {(
            [
              ['front', 'Front 9'],
              ['back', 'Back 9'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={`seg-btn${nine === id ? ' active' : ''}`}
              aria-pressed={nine === id}
              onClick={() => dispatch({ type: 'nine', nine: id })}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {/* One slot, two states, written as a choice so they cannot both
          appear: the caveat while the numbers are still the database's,
          and — once the user has vouched for them — the confirmation, in
          the same place. Saving from here retires the caveat, so putting
          the answer at the foot of the row instead (below the whole par
          grid, a screenful away) would read as the press having
          dismissed a warning and done nothing else. */}
      {holesSource === 'search' ? (
        <p className={`check-note${importIssues.length ? ' bad' : ''}`} role="status">
          <strong>Check these against the card.</strong> Pars and stroke indexes from
          course search are open community data and are sometimes wrong — a par out by one
          shifts every net score and Stableford point for the whole round.
          {importIssues.length > 0 && (
            <>
              {' '}
              Some of it already looks off:
              <span className="issue-list">
                {importIssues.map((issue) => (
                  <span key={issue}>{issue}</span>
                ))}
              </span>
            </>
          )}
          {/* The point of checking a course is not having to check it
              again. Offered here rather than only at the foot of the
              card, because this is where the checking happens — and
              saving is what turns a database guess into the copy that
              loads next time. */}
          <button type="button" className="check-save" onClick={() => onSave('check')}>
            <StarIcon size={15} />
            {importIssues.length > 0 ? 'Save this course anyway' : 'Looks right — save this course'}
          </button>
        </p>
      ) : savedNote?.row === 'check' ? (
        <p className="check-note saved" role="status">
          <StarIcon size={15} /> {savedNote.text} — it loads from here next time.
        </p>
      ) : null}
      <div className="rating-row">
        <label className="field small">
          <span>Slope</span>
          <input
            type="number"
            inputMode="numeric"
            min={55}
            max={155}
            value={slope ?? ''}
            onChange={(e) =>
              dispatch({ type: 'slope', value: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            placeholder="113"
          />
        </label>
        <label className="field small">
          <span>Rating</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={rating ?? ''}
            onChange={(e) =>
              dispatch({ type: 'rating', value: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            placeholder={`${holes.length * 4}.0`}
          />
        </label>
      </div>
      <p className="hint-inline">
        {rated
          ? `Handicap Index converts to strokes for these ${holes.length} holes.`
          : `Optional — off the card, for these ${holes.length} holes. With both, players can enter a Handicap Index instead of working out their own strokes.`}
      </p>
      <div className="preset-row">
        <span>Quick set:</span>
        <button className="chip" onClick={() => dispatch({ type: 'preset', kind: 'standard' })}>
          Standard par {holeCount === 9 ? 36 : 72}
        </button>
        <button className="chip" onClick={() => dispatch({ type: 'preset', kind: 'par4' })}>
          All par 4
        </button>
      </div>
      <ParGrid
        holes={holes}
        withStrokeIndex={advancedHoles}
        maxStrokeIndex={holes.length}
        onPar={(number, par) => dispatch({ type: 'par', number, par })}
        onStrokeIndex={(number, si) => dispatch({ type: 'strokeIndex', number, si })}
      />
      {advancedHoles && <StrokeIndexNote problem={siProblem} holeCount={holes.length} />}
      <button className="btn-ghost add" onClick={() => dispatch({ type: 'toggleAdvanced' })}>
        {/* The sign in a 16px box, the star icon's size, so this and
            "Save this course" below start their words in one column. */}
        <span className="add-glyph" aria-hidden="true">
          {advancedHoles ? '−' : '+'}
        </span>
        {advancedHoles ? 'Hide hole difficulty' : 'Set hole difficulty (stroke index)'}
      </button>
      {advancedHoles && (
        <p className="hint-inline">
          Stroke index ranks hole difficulty (1 = hardest). Used to allocate handicap
          strokes in net games.
        </p>
      )}
      {/* Stands down while the call-out above is offering the same
          action: two identical buttons on one card is a question about
          which one is the real one. This is the general path — a course
          typed or preset by hand — and the call-out's is the prompt at
          the moment it matters. */}
      {holesSource !== 'search' && (
        <button className="btn-ghost add" onClick={() => onSave('foot')}>
          <StarIcon size={16} /> Save this course for next time
        </button>
      )}
      {savedNote?.row === 'holes' && (
        <p className="hint-inline" role="status">
          {savedNote.text}
        </p>
      )}
    </section>
  );
}
