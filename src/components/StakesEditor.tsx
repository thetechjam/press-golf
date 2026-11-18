import type { GameType, Round, Stakes } from '../types';
import { STAKE_UNIT, unitFor } from '../games/settlement';
import { gameLabel, gameMeta } from '../games';
import { isScramble } from '../games/scramble';

interface Props {
  games: GameType[];
  stakes: Stakes;
  onChange: (stakes: Stakes) => void;
  /**
   * The round being edited, when there is one: its games are then named and
   * priced the way the money board below names them (a scramble's stroke
   * play is "Scramble", per team), so the input and the line it sets agree.
   */
  round?: Round;
}

/**
 * One `$` input per game in play. Takes games + stakes rather than a Round so
 * Setup (which has no Round yet) and Results can share one implementation.
 */
export function StakesEditor({ games, stakes, onChange, round }: Props) {
  return (
    <div className="stakes-editor">
      {games.map((gt) => (
        <label key={gt} className="stake-row">
          <span className="stake-label">{round ? gameLabel(round, gt) : gameMeta(gt).label}</span>
          <span className="stake-input">
            <span className="dollar">$</span>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={stakes?.[gt] ?? ''}
              placeholder="0"
              onChange={(e) =>
                onChange({ ...stakes, [gt]: e.target.value === '' ? 0 : Number(e.target.value) })
              }
            />
            <span className="per">per {round && isScramble(round) ? unitFor(round, gt) : STAKE_UNIT[gt]}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
