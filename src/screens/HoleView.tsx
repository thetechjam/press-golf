import { useRef } from 'react';
import type { Round, Hole, WolfChoice } from '../types';
import { HoleStepper } from '../components/HoleStepper';
import { WolfControls } from '../components/WolfControls';
import { NassauControls } from '../components/NassauControls';
import { strokeIndexMap, strokesReceivedOnHole } from '../games/handicap';
import { playerColor } from '../player';

interface Props {
  round: Round;
  hole: Hole;
  idx: number;
  dir: 'next' | 'prev';
  highlightId: string | null;
  holeComplete: boolean[];
  onGo: (index: number) => void;
  onScore: (playerId: string, value: number | null) => void;
  onWolf: (choice: WolfChoice) => void;
  onPresses: (presses: number[]) => void;
}

export function HoleView({
  round, hole, idx, dir, highlightId, holeComplete, onGo, onScore, onWolf, onPresses,
}: Props) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const siMap = strokeIndexMap(round);
  const last = idx === round.holes.length - 1;

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    // Only decisively horizontal swipes navigate — a diagonal scroll must not flip holes.
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      onGo(idx + (dx < 0 ? 1 : -1));
    }
    touchStart.current = null;
  };

  return (
    <div className="hole-view" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="hole-nav">
        <button className="nav-arrow" onClick={() => onGo(idx - 1)} disabled={idx === 0} aria-label="Previous hole">‹</button>
        <div className="hole-head">
          <div className="hole-num">Hole {hole.number}</div>
          <div className="hole-par">Par {hole.par}</div>
        </div>
        <button className="nav-arrow" onClick={() => onGo(idx + 1)} disabled={last} aria-label="Next hole">›</button>
      </div>

      <div className="hole-dots" aria-label="Hole progress">
        {round.holes.map((h, i) => (
          <button
            key={h.number}
            className={`hole-dot${i === idx ? ' current' : ''}${holeComplete[i] ? ' done' : ''}`}
            onClick={() => onGo(i)}
            aria-label={`Hole ${h.number}${holeComplete[i] ? ', complete' : ''}`}
            aria-current={i === idx ? 'true' : undefined}
          />
        ))}
      </div>

      <div key={hole.number} className={`hole-body slide-${dir}`}>
        {round.games.includes('wolf') && (
          <WolfControls round={round} hole={hole} onChange={onWolf} />
        )}
        {round.games.includes('nassau') && (
          <NassauControls round={round} hole={hole} onChange={onPresses} />
        )}
        <section className="steppers">
          {round.players.map((p, i) => (
            <HoleStepper
              key={p.id}
              id={`stepper-${p.id}`}
              highlight={highlightId === p.id}
              name={p.name}
              color={playerColor(i)}
              par={hole.par}
              value={round.scores[hole.number]?.[p.id] ?? null}
              handicap={round.options.league ? p.handicap : undefined}
              strokesReceived={
                round.options.useNet
                  ? strokesReceivedOnHole(p.handicap ?? 0, siMap[hole.number], round.holes.length)
                  : 0
              }
              onChange={(v) => onScore(p.id, v)}
            />
          ))}
        </section>
      </div>
    </div>
  );
}
