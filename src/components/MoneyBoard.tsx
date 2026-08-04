import { useState } from 'react';
import type { Round } from '../types';
import { computeSettlement, formatMoney } from '../games/settlement';
import { colorMap } from '../player';
import { PlayerAvatar } from './PlayerAvatar';
import { StakesEditor } from './StakesEditor';
import { CoinIcon } from '../icons';

interface Props {
  round: Round;
  onChange: (round: Round) => void;
}

const tone = (n: number) => (n > 0 ? ' up' : n < 0 ? ' down' : '');

/** Live money for the Board tab: net per player, then the per-game breakdown. */
export function MoneyBoard({ round, onChange }: Props) {
  const settlement = computeSettlement(round);
  const [editing, setEditing] = useState(!settlement.active);
  const colors = colorMap(round);

  const netSorted = round.players
    .map((p) => ({ id: p.id, name: p.name, net: settlement.totals[p.id] ?? 0 }))
    .sort((a, b) => b.net - a.net);

  return (
    <section className="board money-board">
      <div className="board-head">
        <span className="board-title">
          <CoinIcon size={16} /> Money
        </span>
        <button className="link-btn" onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done' : 'Edit stakes'}
        </button>
      </div>

      {editing && (
        <StakesEditor
          games={round.games}
          stakes={round.options.stakes ?? {}}
          onChange={(stakes) => onChange({ ...round, options: { ...round.options, stakes } })}
        />
      )}

      {!settlement.active ? (
        <div className="board-note">No money on this round. Set a stake above to keep a tally.</div>
      ) : (
        <>
          <ol className="board-list net-list">
            {netSorted.map((p) => (
              <li key={p.id} className="net-row">
                <PlayerAvatar name={p.name} color={colors[p.id]} size={22} />
                <span className="net-name">{p.name}</span>
                <span className={`net-amount${tone(p.net)}`}>
                  {p.net === 0 ? '—' : formatMoney(p.net)}
                </span>
              </li>
            ))}
          </ol>

          <div className="pergame-list">
            {settlement.perGame.map((g) => (
              <div key={g.gameType} className="pergame">
                <div className="pergame-head">
                  <span className="pergame-label">{g.label}</span>
                  <span className="pergame-stake">
                    {formatMoney(g.stake)} per {g.unit}
                  </span>
                </div>
                <div className="pergame-nets">
                  {round.players.map((p) => {
                    const n = g.net[p.id] ?? 0;
                    return (
                      <span key={p.id} className={`pg-net${tone(n)}`}>
                        <span className="pg-name">{p.name}</span>
                        {n === 0 ? '—' : formatMoney(n)}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
