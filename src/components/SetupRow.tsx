interface Props {
  /** Row title, e.g. "Holes & pars". */
  label: string;
  /** Current value, e.g. "18 holes · par 72". Never empty — see setupSummary.ts. */
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * One collapsible section of New Round: a tappable header showing the
 * section's current value, with its controls revealed in place.
 *
 * Expansion is controlled by the parent so rows toggle independently — this
 * is deliberately not an accordion. Opening Games must not silently close
 * Course; someone comparing two rows should not have to fight the screen.
 */
export function SetupRow({ label, summary, open, onToggle, children }: Props) {
  return (
    <div className={`setup-row${open ? ' open' : ''}`}>
      <button
        className="setup-row-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="setup-row-label">{label}</span>
        <span className="setup-row-summary">{summary}</span>
        <span className="setup-row-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      {open && <div className="setup-row-body">{children}</div>}
    </div>
  );
}
