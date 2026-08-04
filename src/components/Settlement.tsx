import { useState } from 'react';
import type { Round } from '../types';
import { computeSettlement, formatMoney } from '../games/settlement';
import { colorMap } from '../player';
import { CoinIcon } from '../icons';
import { PlayerAvatar } from './PlayerAvatar';
import { StakesEditor } from './StakesEditor';

interface Props {
  round: Round;
  onChange?: (round: Round) => void;
}

export function Settlement({ round, onChange }: Props) {
  const settlement = computeSettlement(round);
  const [editing, setEditing] = useState(!settlement.active);

  const colors = colorMap(round);
  const netSorted = round.players
    .map((p) => ({ name: p.name, id: p.id, net: settlement.totals[p.id] ?? 0 }))
    .sort((a, b) => b.net - a.net);

  return (
    <section className="board settlement">
      <div className="board-head">
        <span className="board-title">
          <CoinIcon size={16} /> Settlement
        </span>
        {onChange && (
          <button className="link-btn" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Edit stakes'}
          </button>
        )}
      </div>

      {editing && onChange && (
        <StakesEditor
          games={round.games}
          stakes={round.options.stakes ?? {}}
          onChange={(stakes) => onChange({ ...round, options: { ...round.options, stakes } })}
        />
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
              <div className="all-even">Everyone's even</div>
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
