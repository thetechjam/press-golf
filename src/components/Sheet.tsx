import { useCallback, useEffect, useRef, useState } from 'react';
import { XIcon } from '../icons';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Exit duration. Must stay in step with --sheet-exit in index.css: the CSS
 * plays the animation, this timer decides when the node leaves the tree, and
 * if the timer is the shorter of the two the sheet vanishes mid-slide.
 */
const EXIT_MS = 200;

/**
 * Bottom sheet: backdrop, Escape to dismiss, focus moved in on open.
 *
 * Closing is a two-step: mark `closing` so the CSS can run the exit, then call
 * the parent's onClose once it has finished. Every dismissal path — backdrop,
 * the X, Escape — goes through `close()` so none of them can skip the exit.
 */
export function Sheet({ title, onClose, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // A ref, not the state, guards re-entry: a second tap during the exit lands
  // before the re-render, and scheduling the timer inside a state updater would
  // fire it twice under StrictMode's double-invoke.
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    exitTimer.current = setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(exitTimer.current);
    };
  }, [close]);

  return (
    <div
      className={`sheet-backdrop${closing ? ' closing' : ''}`}
      onClick={close}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="sheet-close" onClick={close} aria-label="Close">
            <XIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
