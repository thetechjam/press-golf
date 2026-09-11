import type { Round, Hole } from '../types';
import { vegasTeams, vegasHoles, vegasHoleFor, vegasReady } from '../games/vegas';
import { FlagIcon } from '../icons';

/**
 * Vegas on the Hole tab: this hole's two numbers, and who is up overall.
 *
 * Wolf and Nassau have always had a presence where the scoring happens; Vegas
 * did not, which left its whole point — the two scores written side by side —
 * visible only on the Board, one tab away from the person entering them.
 *
 * Informational, with nothing to press. Vegas asks the scorekeeper for no
 * decisions the way Wolf's partner pick or Nassau's press do, so this is a
 * read-out rather than a control, and it never collapses.
 */

interface Props {
  round: Round;
  hole: Hole;
}

export function VegasStrip({ round, hole }: Props) {
  if (!vegasReady(round)) return null;

  const { a, b } = vegasTeams(round);
  const { margin } = vegasHoles(round);
  const here = vegasHoleFor(round, hole.number);

  const standing =
    margin === 0
      ? 'All square'
      : `${margin > 0 ? a.label : b.label} up ${Math.abs(margin)}`;

  // The dotted underline on a flipped number is a convention nobody is born
  // knowing, and a phone has no hover to explain it. Naming it in the line
  // costs nothing on the holes where it did not happen.
  const flipped = here != null && (here.aFlipped || here.bFlipped);
  const status = flipped ? `${standing} · birdie flip` : standing;

  // Spelled out for a screen reader, which would otherwise be read "45 56"
  // with no way to tell which side is which or that a number was turned round.
  const spoken = here
    ? `${a.label} ${here.a}${here.aFlipped ? ', flipped' : ''}. ` +
      `${b.label} ${here.b}${here.bFlipped ? ', flipped' : ''}.`
    : '';

  return (
    <div className="vegas-strip">
      <FlagIcon size={14} />
      <span className="collapsed-text">Vegas · {status}</span>
      {here && (
        <span className="vegas-nums" aria-label={spoken}>
          <span className={`vegas-num${here.swing > 0 ? ' won' : ''}${here.aFlipped ? ' flipped' : ''}`}>
            {here.a}
          </span>
          <span className="vegas-dash" aria-hidden="true">
            –
          </span>
          <span className={`vegas-num${here.swing < 0 ? ' won' : ''}${here.bFlipped ? ' flipped' : ''}`}>
            {here.b}
          </span>
        </span>
      )}
    </div>
  );
}
