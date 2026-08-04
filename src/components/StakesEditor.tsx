import type { GameType, Stakes } from '../types';
import { STAKE_UNIT } from '../games/settlement';
import { gameMeta } from '../games';

interface Props {
  games: GameType[];
  stakes: Stakes;
  onChange: (stakes: Stakes) => void;
}

/**
 * One `$` input per game in play. Takes games + stakes rather than a Round so
 * Setup (which has no Round yet) and Results can share one implementation.
 */
export function StakesEditor({ games, stakes, onChange }: Props) {
  return (
    <div className="stakes-editor">
      {games.map((gt) => (
        <label key={gt} className="stake-row">
          <span className="stake-label">{gameMeta(gt).label}</span>
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
            <span className="per">per {STAKE_UNIT[gt]}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
