import { useEffect, useRef, useState } from 'react';
import { searchCourses, fetchCourse, type CourseHit, type FetchedCourse } from '../courses/openGolfApi';

interface Props {
  /** The course name (owned by the parent screen). */
  value: string;
  /** Called as the user types — the text doubles as the manual course name. */
  onChange: (name: string) => void;
  /** Called with the full scorecard once the user picks a search result. */
  onPick: (course: FetchedCourse) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Combined course field: one input that is both the course name and a
 * debounced search against OpenGolfAPI. Typing 3+ characters shows matching
 * courses; picking one fetches the full scorecard and hands it to the parent
 * (which also sets the name). Ignoring the results — or getting no matches —
 * simply leaves the typed text as a manually entered course name.
 */
export function CourseSearch({ value, onChange, onPick, label = 'Course (optional)', placeholder = 'e.g. Pebble Beach' }: Props) {
  const [hits, setHits] = useState<CourseHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // The last text the user typed into this input. Any value change that
  // doesn't match (picking a result, loading a saved course, any external
  // set) must not open — and should close — the search dropdown.
  const typed = useRef<string | null>(null);

  useEffect(() => {
    if (value !== typed.current) {
      setHits([]);
      setOpen(false);
      setSearching(false);
      setError('');
      return;
    }
    const term = value.trim();
    if (term.length < 3) {
      setHits([]);
      setOpen(false);
      setError('');
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    setError('');
    const t = setTimeout(() => {
      searchCourses(term, ctrl.signal)
        .then((results) => {
          setHits(results.slice(0, 8));
          setOpen(true);
        })
        .catch(() => {
          if (!ctrl.signal.aborted)
            setError('Search unavailable — your typed course name still works.');
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setSearching(false);
        });
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [value]);

  const dismiss = () => {
    setHits([]);
    setOpen(false);
  };

  const pick = (hit: CourseHit) => {
    setLoadingId(hit.id);
    setError('');
    fetchCourse(hit.id)
      .then((course) => {
        typed.current = null;
        if (!course.holes.length) {
          onChange(hit.name);
          setHits([]);
          setOpen(false);
          setError('No scorecard data for that course — kept the name; enter pars below.');
          return;
        }
        onPick(course);
        setHits([]);
        setOpen(false);
      })
      .catch(() => setError('Could not load that course. Pick another or keep your typed name.'))
      .finally(() => setLoadingId(null));
  };

  return (
    <div className="course-search">
      <label className="field">
        <span>{label}</span>
        <input
          value={value}
          onChange={(e) => {
            typed.current = e.target.value;
            onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') dismiss();
          }}
          onBlur={() => {
            // Delay so a tap on a result registers before the list closes.
            window.setTimeout(dismiss, 200);
          }}
          placeholder={placeholder}
          autoCorrect="off"
          autoCapitalize="words"
        />
      </label>
      <p className="hint">
        Typing searches the course database — pick a match to auto-fill the scorecard, or keep
        typing to use your own course name.
      </p>

      {searching && <p className="cs-status">Searching…</p>}
      {error && <p className="cs-status cs-error">{error}</p>}

      {open && hits.length > 0 && (
        <ul className="cs-results">
          {hits.map((h) => (
            <li key={h.id}>
              <button className="cs-hit" onClick={() => pick(h)} disabled={loadingId !== null}>
                <span className="cs-hit-name">{h.name}</span>
                <span className="cs-hit-meta">
                  {[h.city, h.state].filter(Boolean).join(', ') || 'Location n/a'}
                  {h.par ? ` · par ${h.par}` : ''}
                  {loadingId === h.id ? ' · loading…' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !searching && !error && hits.length === 0 && value.trim().length >= 3 && (
        <p className="cs-status">No matches — your typed name will be used as-is.</p>
      )}

      <p className="cs-attribution">Course data © OpenGolfAPI (ODbL)</p>
    </div>
  );
}
