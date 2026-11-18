import { useState } from 'react';
import type { GameType, Round, Stakes } from '../types';
import { stakeAmount, MAX_STAKE } from '../numberInput';
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
  // The text of the field being typed in, shown as typed; only a stake that
  // can be settled is stored (see stakeAmount). Clearing the box used to
  // write 0 back into it mid-edit, and a "-" or "1e9" went into the money.
  const [draft, setDraft] = useState<Partial<Record<GameType, string>>>({});
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
              max={MAX_STAKE}
              inputMode="decimal"
              value={draft[gt] ?? stakes?.[gt] ?? ''}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value;
                setDraft((d) => ({ ...d, [gt]: raw }));
                const v = stakeAmount(raw);
                if (v != null) onChange({ ...stakes, [gt]: v });
              }}
              onBlur={() =>
                setDraft((d) => {
                  const next = { ...d };
                  delete next[gt];
                  return next;
                })
              }
            />
            <span className="per">per {round && isScramble(round) ? unitFor(round, gt) : STAKE_UNIT[gt]}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
