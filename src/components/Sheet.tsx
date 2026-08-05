import { useEffect, useRef } from 'react';
import { XIcon } from '../icons';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Bottom sheet: backdrop, Escape to dismiss, focus moved in on open. */
export function Sheet({ title, onClose, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
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
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
