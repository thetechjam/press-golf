import { useEffect, useState } from 'react';
import { searchCourses, fetchCourse, type CourseHit, type FetchedCourse } from '../courses/openGolfApi';

interface Props {
  /** Called with the full scorecard once the user picks a result. */
  onPick: (course: FetchedCourse) => void;
}

/**
 * Debounced course search against OpenGolfAPI. Renders a search field + result
 * list; on pick, fetches the full scorecard and hands it to the parent, which
 * decides how to apply it (Setup: 9 or 18; League: front 9).
 */
export function CourseSearch({ onPick }: Props) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CourseHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const term = q.trim();
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
          if (!ctrl.signal.aborted) setError('Search unavailable — check your connection.');
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setSearching(false);
        });
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q]);

  const pick = (hit: CourseHit) => {
    setLoadingId(hit.id);
    setError('');
    fetchCourse(hit.id)
      .then((course) => {
        if (!course.holes.length) {
          setError('No scorecard data for that course — enter pars manually below.');
          return;
        }
        onPick(course);
        setQ('');
        setHits([]);
        setOpen(false);
      })
      .catch(() => setError('Could not load that course. Try another.'))
      .finally(() => setLoadingId(null));
  };

  return (
    <div className="course-search">
      <label className="field">
        <span>Search for a course</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Pebble Beach"
          autoCorrect="off"
          autoCapitalize="words"
        />
      </label>

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

      {open && !searching && !error && hits.length === 0 && q.trim().length >= 3 && (
        <p className="cs-status">No matches. You can still enter pars manually below.</p>
      )}

      <p className="cs-attribution">Course data © OpenGolfAPI (ODbL)</p>
    </div>
  );
}
