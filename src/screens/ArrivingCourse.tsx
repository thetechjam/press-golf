import type { SavedCourse } from '../types';
import type { CourseClash } from '../shareCourse';
import { scorecardIssues } from '../courses/validate';

/** The card split the way it is printed: nine holes to a row. */
function nines(holes: SavedCourse['holes']): SavedCourse['holes'][] {
  const out: SavedCourse['holes'][] = [];
  for (let i = 0; i < holes.length; i += 9) out.push(holes.slice(i, i + 9));
  return out;
}

/** What the user decided about a course that arrived by link. */
export type CourseChoice = 'save' | 'replace' | 'both' | 'skip';

interface Props {
  course: SavedCourse;
  clash: CourseClash;
  onChoose: (choice: CourseChoice) => void;
}

/**
 * The screen shown when a course arrives by link.
 *
 * The card is laid out before any of the buttons, because the whole reason
 * courses are worth sending is that the numbers can be wrong and somebody has
 * to look at them. `scorecardIssues` — the same reading that flags a search
 * result — runs on the way in, so a scorecard with two holes ranked the same
 * says so here rather than on the sixteenth tee when the strokes come out odd.
 *
 * Saving is always a decision. A course that lands unasked is a course nobody
 * checked, which is the problem this feature exists to solve, not a shortcut
 * worth taking.
 */
export function ArrivingCourse({ course, clash, onChoose }: Props) {
  const issues = scorecardIssues(course.holes);
  const par = course.holes.reduce((sum, h) => sum + h.par, 0);
  const ranked = course.holes.every((h) => typeof h.strokeIndex === 'number');

  return (
    <div className="screen arriving arriving-wide">
      <h1 tabIndex={-1}>{clash.kind === 'new' ? 'A course was sent to you' : 'You already have this course'}</h1>

      <div className="arriving-round">
        <div className="arriving-course">{course.name}</div>
        <div className="arriving-sub">
          {course.holes.length} holes · par {par}
          {ranked ? ' · stroke index set' : ' · no stroke index'}
          {course.slope && course.rating ? ` · ${course.slope}/${course.rating}` : ''}
        </div>
      </div>

      {/* The card itself, because "trust me" is what got the bad pars in.
          Laid out in nines the way a scorecard is printed, rather than as one
          eighteen-column table: on a phone that table runs off the side, and a
          card whose last seven holes are past the edge of the screen is a card
          nobody checks — which is the entire failure this screen exists to
          prevent. */}
      {nines(course.holes).map((nine) => (
        <div className="course-card-preview" key={nine[0].number}>
          <table>
            <thead>
              <tr>
                <th scope="row">Hole</th>
                {nine.map((h) => (
                  <th key={h.number}>{h.number}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Par</th>
                {nine.map((h) => (
                  <td key={h.number}>{h.par}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">SI</th>
                {nine.map((h) => (
                  <td key={h.number}>{h.strokeIndex ?? '—'}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      {issues.length > 0 && (
        <div className="course-issues" role="status">
          <strong>Worth checking against the card</strong>
          <ul>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {clash.kind === 'differs' && (
        <div className="course-issues course-diff">
          <strong>This differs from the one you have</strong>
          <ul>
            {clash.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </div>
      )}

      {clash.kind === 'new' && (
        <button className="btn-primary big" onClick={() => onChoose('save')}>
          Save this course
        </button>
      )}

      {clash.kind === 'same' && (
        <p className="arriving-note">Your copy already matches it, hole for hole.</p>
      )}

      {clash.kind === 'differs' && (
        <>
          <button className="btn-primary big" onClick={() => onChoose('both')}>
            Keep both
          </button>
          <button className="btn-secondary" onClick={() => onChoose('replace')}>
            Replace mine with theirs
          </button>
        </>
      )}

      <button className="btn-ghost" onClick={() => onChoose('skip')}>
        {clash.kind === 'same' ? 'Go to Press' : 'No thanks'}
      </button>
    </div>
  );
}
