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
      {armed ? 'Delete?' : children}
    </button>
  );
}
