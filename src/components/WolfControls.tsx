import { useState } from 'react';
import type { Round, Hole, WolfChoice } from '../types';
import { wolfForHole } from '../games/wolf';
import { PlayerAvatar } from './PlayerAvatar';
import { PawIcon } from '../icons';
import { colorMap } from '../player';

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
  const colors = colorMap(round);

  const isPartner = (id: string) =>
    choice?.type === 'partner' && choice.partnerId === id;

  const [open, setOpen] = useState(choice == null);
  const partnerName =
    choice?.type === 'partner'
      ? round.players.find((p) => p.id === choice.partnerId)?.name
      : undefined;
  const summary =
    choice == null
      ? null
      : choice.type === 'partner'
        ? `${wolf?.name} + ${partnerName}`
        : choice.type === 'lone'
          ? `${wolf?.name} — Lone Wolf ×${round.options.loneWolfMultiplier}`
          : `${wolf?.name} — Blind ×${round.options.blindWolfMultiplier}`;

  if (!open && summary) {
    return (
      <button className="wolf collapsed" onClick={() => setOpen(true)}>
        <PawIcon size={14} />
        <span className="collapsed-text">{summary}</span>
        <span className="collapsed-hint">Change</span>
      </button>
    );
  }

  return (
    <div className="wolf">
      <div className="wolf-head">
        <PawIcon size={16} /> {wolf && <PlayerAvatar name={wolf.name} color={colors[wolf.id]} size={22} />}
        <strong>{wolf?.name ?? 'Wolf'}</strong> is the Wolf — make the call
      </div>
      <div className="wolf-options">
        {others.map((p) => (
          <button
            key={p.id}
            className={`wolf-chip${isPartner(p.id) ? ' active' : ''}`}
            onClick={() => { onChange({ type: 'partner', partnerId: p.id }); setOpen(false); }}
          >
            <PlayerAvatar name={p.name} color={colors[p.id]} size={20} />
            {p.name}
          </button>
        ))}
        <button
          className={`wolf-chip lone${choice?.type === 'lone' ? ' active' : ''}`}
          onClick={() => { onChange({ type: 'lone' }); setOpen(false); }}
        >
          Lone Wolf ×{round.options.loneWolfMultiplier}
        </button>
        <button
          className={`wolf-chip lone${choice?.type === 'blind' ? ' active' : ''}`}
          onClick={() => { onChange({ type: 'blind' }); setOpen(false); }}
        >
          Blind ×{round.options.blindWolfMultiplier}
        </button>
      </div>
    </div>
  );
}
