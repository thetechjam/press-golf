import type { Player } from '../../types';
import { formatHandicap } from '../../games/handicap';
import type { RosterEntry } from '../../roster';
import { CrewChip, RecentChips } from '../../components/RosterChips';
import { PlayerAvatar } from '../../components/PlayerAvatar';
import { playerColor } from '../../player';
import { XIcon } from '../../icons';

interface Props {
  players: Player[];
  /** Whether any chosen game uses handicaps — the gate for the number fields. */
  showNet: boolean;
  /** Whether the course can turn an Index into strokes — which number is asked for. */
  rated: boolean;
  derivedHandicap: (index: number | undefined) => number | null;
  /** Last round's crew, or empty when the list already matches it. */
  crew: RosterEntry[];
  onUseCrew: () => void;
  /** Known players not yet on the list. */
  recent: RosterEntry[];
  onAddFromRoster: (entry: RosterEntry) => void;
  onUpdate: (id: string, patch: Partial<Player>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

/** The Players card at the top of New Round. */
export function PlayersSection({
  players,
  showNet,
  rated,
  derivedHandicap,
  crew,
  onUseCrew,
  recent,
  onAddFromRoster,
  onUpdate,
  onAdd,
  onRemove,
}: Props) {
  /** The seat row `i` takes in the round: how many named rows sit above it. */
  const seatOf = (i: number) => players.slice(0, i).filter((p) => p.name.trim()).length;

  return (
    <section className="card">
      <h2>Players</h2>
      <CrewChip crew={crew} onUseCrew={onUseCrew} />
      {players.map((p, i) => (
        <div key={p.id} className="player-row">
          {/* Coloured by place among the named rows, which is the seat the
              round will give them: a blank row above used to shift every
              colour below it the moment the round started. */}
          <PlayerAvatar name={p.name || `${i + 1}`} color={playerColor(seatOf(i))} />
          <input
            className="player-name"
            value={p.name}
            onChange={(e) => onUpdate(p.id, { name: e.target.value })}
            list="press-known-names"
            autoComplete="off"
            placeholder={`Player ${i + 1}`}
            aria-label={`Name of player ${i + 1}`}
          />
          {showNet &&
            (rated ? (
              /* A rated course can work the strokes out, so the field asks
                 for the number the player actually carries between courses
                 and shows what it is worth here. Asking for both would be
                 asking the same question twice. */
              <span className="player-index">
                {/* No inputMode: iOS's decimal and numeric pads have no
                    minus key, and a plus player's Index is negative. The
                    number keyboard type=number brings up on its own does. */}
                <input
                  className="player-hcp"
                  type="number"
                  step="0.1"
                  value={p.index ?? ''}
                  onChange={(e) =>
                    onUpdate(p.id, {
                      index: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  placeholder="Index"
                  aria-label={`Handicap Index for ${p.name || `player ${i + 1}`}`}
                />
                {/* Recalled with strokes but no Index: they play off those
                    strokes, and the field being blank said otherwise. Shown,
                    and cleared with a tap for anyone who would rather type
                    an Index. */}
                {p.index == null && p.handicap != null && (
                  <button
                    type="button"
                    className="player-recalled"
                    onClick={() => onUpdate(p.id, { handicap: undefined })}
                    aria-label={`${p.name || `Player ${i + 1}`} plays off ${formatHandicap(p.handicap)} from a remembered stroke count. Clear it`}
                  >
                    <span aria-hidden="true" className="player-derived-arrow">→</span>
                    {formatHandicap(p.handicap)}
                    <span className="player-recalled-x" aria-hidden="true">×</span>
                  </button>
                )}
                {derivedHandicap(p.index) != null && (
                  <span
                    className="player-derived"
                    aria-label={`Plays off ${formatHandicap(derivedHandicap(p.index)!)} on these holes`}
                  >
                    {/* The arrow is doing real work: without it this is a
                        second number beside the first with nothing to say
                        it is the answer rather than another question. */}
                    <span aria-hidden="true" className="player-derived-arrow">
                      →
                    </span>
                    {formatHandicap(derivedHandicap(p.index)!)}
                  </span>
                )}
              </span>
            ) : (
              <input
                className="player-hcp"
                type="number"
                value={p.handicap ?? ''}
                onChange={(e) =>
                  onUpdate(p.id, {
                    handicap: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                placeholder="HCP"
                aria-label={`Handicap for ${p.name || `player ${i + 1}`}`}
              />
            ))}
          <button
            className="player-del"
            onClick={() => onRemove(p.id)}
            aria-label={`Remove ${p.name.trim() || `player ${i + 1}`}`}
          >
            <XIcon />
          </button>
        </div>
      ))}
      {/* One row. Both of these add a single player — which is why the
          chips sit beside the button rather than under it — and stacked
          they spent 50px of a screen that was already scrolling with every
          row collapsed. */}
      <div className="add-row">
        <button className="btn-ghost add" onClick={onAdd}>
          + Add player
        </button>
        <RecentChips recent={recent} onAdd={onAddFromRoster} />
      </div>
      {showNet && (
        <p className="hint">
          {rated
            ? `Enter each player’s Handicap Index — the number after the arrow is what they play off here. All blank scores gross.${
                players.some((p) => p.index == null && p.handicap != null)
                  ? ' A player recalled with a stroke count and no Index plays off those strokes; tap the × to clear them.'
                  : ''
              }`
            : 'Enter handicaps to score net — all blank scores gross, and a blank plays off 0. A plus handicap goes in as a minus number: +3 is −3.'}
        </p>
      )}
    </section>
  );
}
