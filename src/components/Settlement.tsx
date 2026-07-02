import { useState } from 'react';
import type { Round, GameType } from '../types';
import { computeSettlement, formatMoney, STAKE_UNIT } from '../games/settlement';
import { gameMeta } from '../games';
import { colorMap } from '../player';
import { PlayerAvatar } from './PlayerAvatar';

interface Props {
  round: Round;
  onChange?: (round: Round) => void;
}

export function Settlement({ round, onChange }: Props) {
  const settlement = computeSettlement(round);
  const [editing, setEditing] = useState(!settlement.active);

  const setStake = (gt: GameType, value: number) => {
    if (!onChange) return;
    onChange({
      ...round,
      options: {
        ...round.options,
        stakes: { ...round.options.stakes, [gt]: value },
      },
    });
  };

  const colors = colorMap(round);
  const netSorted = round.players
    .map((p) => ({ name: p.name, id: p.id, net: settlement.totals[p.id] ?? 0 }))
    .sort((a, b) => b.net - a.net);

  return (
    <section className="board settlement">
      <div className="board-head">
        <span className="board-title">💰 Settlement</span>
        {onChange && (
          <button className="link-btn" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Edit stakes'}
          </button>
        )}
      </div>

      {editing && onChange && (
        <div className="stakes-editor">
          {round.games.map((gt) => (
            <label key={gt} className="stake-row">
              <span className="stake-label">{gameMeta(gt).label}</span>
              <span className="stake-input">
                <span className="dollar">$</span>
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={round.options.stakes?.[gt] ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setStake(gt, e.target.value === '' ? 0 : Number(e.target.value))
                  }
                />
                <span className="per">per {STAKE_UNIT[gt]}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {!settlement.active ? (
        <div className="board-note">Set a stake above to tally who owes what.</div>
      ) : (
        <>
          <ol className="board-list net-list">
            {netSorted.map((p) => (
              <li key={p.id} className="net-row">
                <PlayerAvatar name={p.name} color={colors[p.id]} size={22} />
                <span className="net-name">{p.name}</span>
                <span
                  className={`net-amount ${p.net > 0 ? 'up' : p.net < 0 ? 'down' : ''}`}
                >
                  {p.net === 0 ? '—' : formatMoney(p.net)}
                </span>
              </li>
            ))}
          </ol>

          <div className="payments">
            {settlement.transactions.length === 0 ? (
              <div className="all-even">Everyone's even 🎉</div>
            ) : (
              settlement.transactions.map((t, i) => (
                <div key={i} className="payment">
                  <strong>{t.from}</strong> pays <strong>{t.to}</strong>
                  <span className="pay-amount">{formatMoney(t.amount)}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
