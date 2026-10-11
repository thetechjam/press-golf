import type { SavedCourse } from '../types';
import { DeleteButton } from './DeleteButton';
import { XIcon, QrIcon } from '../icons';

interface Props {
  courses: SavedCourse[];
  onLoad: (course: SavedCourse) => void;
  onRemove: (id: string) => void;
  /** Offered where a course can be handed to another phone — New Round, not League. */
  onSend?: (course: SavedCourse) => void;
}

/**
 * The saved courses under the course field, on New Round and Golf League
 * alike. Renders nothing when there are none, so the caller need not check.
 */
export function SavedCourseList({ courses, onLoad, onRemove, onSend }: Props) {
  if (courses.length === 0) return null;
  return (
    <section className="card course-picker">
      <h2>Load a saved course</h2>
      <div className="saved-course-list">
        {courses.map((c) => (
          <div key={c.id} className="saved-course-row">
            {/* One row: the name and its figures are the load
                button, the two actions sit at the end. The name
                wraps rather than truncating, so it can share the
                line — three stacked lines per course made two saved
                courses fill the screen. */}
            <button className="saved-course-load" onClick={() => onLoad(c)}>
              <span className="saved-course-name">{c.name}</span>
              <span className="saved-course-meta">
                {/* No-break spaces inside each part, so a wrap falls between parts. */}
                {c.holes.length}{' '}holes · par{' '}{c.holes.reduce((s, h) => s + h.par, 0)}
                {c.holes.some((h) => h.strokeIndex) ? ' · stroke index set' : ''}
              </span>
            </button>
            {/* Checking a scorecard is done once, by one person.
                This is how the other three get the checked one
                instead of each re-typing it, or not bothering. */}
            {onSend && (
              <button
                className="saved-course-send"
                onClick={() => onSend(c)}
                aria-label={`Send ${c.name} to another phone`}
              >
                <QrIcon size={16} />
              </button>
            )}
            <DeleteButton
              className="saved-course-del"
              label={`saved course ${c.name}`}
              onDelete={() => onRemove(c.id)}
            >
              <XIcon />
            </DeleteButton>
          </div>
        ))}
      </div>
    </section>
  );
}
