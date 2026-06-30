import type { Round, Hole, WolfChoice } from '../types';
import { wolfForHole } from '../games/wolf';

interface Props {
  round: Round;
  hole: Hole;
  onChange: (choice: WolfChoice) => void;
}

export function WolfControls({ round, hole, onChange }: Props) {
  const wolfId = round.wolf[hole.number]?.wolfPlayerId ?? wolfForHole(round, hole);
  const wolf = round.players.find((p) => p.id === wolfId);
  const choice = round.wolf[hole.number]?.choice ?? null;
  const others = round.players.filter((p) => p.id !== wolfId);

  const isPartner = (id: string) =>
    choice?.type === 'partner' && choice.partnerId === id;

  return (
    <div className="wolf">
      <div className="wolf-head">
        🐺 <strong>{wolf?.name ?? 'Wolf'}</strong> is the Wolf — make the call
      </div>
      <div className="wolf-options">
        {others.map((p) => (
          <button
            key={p.id}
            className={`wolf-chip${isPartner(p.id) ? ' active' : ''}`}
            onClick={() => onChange({ type: 'partner', partnerId: p.id })}
          >
            + {p.name}
          </button>
        ))}
        <button
          className={`wolf-chip lone${choice?.type === 'lone' ? ' active' : ''}`}
          onClick={() => onChange({ type: 'lone' })}
        >
          Lone Wolf ×{round.options.loneWolfMultiplier}
        </button>
        <button
          className={`wolf-chip lone${choice?.type === 'blind' ? ' active' : ''}`}
          onClick={() => onChange({ type: 'blind' })}
        >
          Blind ×{round.options.blindWolfMultiplier}
        </button>
      </div>
    </div>
  );
}
