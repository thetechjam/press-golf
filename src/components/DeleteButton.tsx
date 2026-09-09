import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Base class of the host slot, e.g. "round-del" or "saved-course-del". */
  className: string;
  /** What gets deleted, for the aria-label, e.g. `round Pebble Beach`. */
  label: string;
  onDelete: () => void;
  /** Idle glyph (✕ or ×). */
  children: React.ReactNode;
}

/**
 * Two-tap destructive delete: first tap arms ("Delete?"), second tap deletes.
 * Auto-disarms after 3s or on blur so a stray tap can't linger as a live trigger.
 *
 * Arming widens the button from a 44px glyph to the word, which the rows it
 * sits in are built to absorb (their labels ellipsize; see .round-main and
 * .saved-course-load). It used to do that in one frame, shoving the row
 * sideways as the glyph became text; index.css now travels both the width and
 * the two faces so the row settles instead of jumping.
 */
export function DeleteButton({ className, label, onDelete, children }: Props) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), 3000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed]);

  const onClick = () => {
    if (armed) {
      setArmed(false);
      onDelete();
    } else {
      setArmed(true);
    }
  };

  return (
    <button
      className={`${className}${armed ? ' armed' : ''}`}
      onClick={onClick}
      onBlur={() => setArmed(false)}
      aria-label={armed ? `Tap again to delete ${label}` : `Delete ${label}`}
    >
      {/* Both faces are always rendered so arming can cross-fade them rather
          than swap one for the other in a single frame. Neither is read out:
          the aria-label above is the button's accessible name in both states
          and already says which one is showing. */}
      <span className="del-face del-glyph">{children}</span>
      <span className="del-face del-word">Delete?</span>
    </button>
  );
}
