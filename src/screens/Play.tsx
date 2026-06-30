import { useState } from 'react';
import type { Round, WolfChoice } from '../types';
import { HoleStepper } from '../components/HoleStepper';
import { Leaderboard } from '../components/Leaderboard';
import { WolfControls } from '../components/WolfControls';
import { activeResults } from '../games';
import { wolfForHole } from '../games/wolf';

interface Props {
  round: Round;
  onChange: (round: Round) => void;
  onFinish: () => void;
  onExit: () => void;
}

export function Play({ round, onChange, onFinish, onExit }: Props) {
  const [idx, setIdx] = useState(0);
  const hole = round.holes[idx];
  const last = idx === round.holes.length - 1;

  const setScore = (playerId: string, value: number | null) => {
    const holeScores = { ...(round.scores[hole.number] ?? {}), [playerId]: value };
    onChange({ ...round, scores: { ...round.scores, [hole.number]: holeScores } });
  };

  const setWolf = (choice: WolfChoice) => {
    const wolfPlayerId =
      round.wolf[hole.number]?.wolfPlayerId ?? wolfForHole(round, hole)!;
    onChange({
      ...round,
      wolf: { ...round.wolf, [hole.number]: { wolfPlayerId, choice } },
    });
  };

  const results = activeResults(round);
  const parTotal = round.holes.reduce((s, h) => s + h.par, 0);

  return (
    <div className="screen play">
      <header className="bar">
        <button className="btn-ghost" onClick={onExit}>
          ‹ Rounds
        </button>
        <h1>{round.course || 'Round'}</h1>
        <button className="btn-ghost" onClick={onFinish}>
          Finish
        </button>
      </header>

      <div className="hole-nav">
        <button
          className="nav-arrow"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          aria-label="Previous hole"
        >
          ‹
        </button>
        <div className="hole-head">
          <div className="hole-num">Hole {hole.number}</div>
          <div className="hole-par">Par {hole.par}</div>
        </div>
        <button
          className="nav-arrow"
          onClick={() => setIdx((i) => Math.min(round.holes.length - 1, i + 1))}
          disabled={last}
          aria-label="Next hole"
        >
          ›
        </button>
      </div>

      <div className="progress">
        Hole {idx + 1} of {round.holes.length} · Par {parTotal}
      </div>

      {round.games.includes('wolf') && (
        <WolfControls round={round} hole={hole} onChange={setWolf} />
      )}

      <section className="steppers">
        {round.players.map((p) => (
          <HoleStepper
            key={p.id}
            name={p.name}
            par={hole.par}
            value={round.scores[hole.number]?.[p.id] ?? null}
            onChange={(v) => setScore(p.id, v)}
          />
        ))}
      </section>

      <section className="boards">
        {results.map((r) => (
          <Leaderboard key={r.gameType} result={r} />
        ))}
      </section>

      <div className="play-foot">
        {last ? (
          <button className="btn-primary big" onClick={onFinish}>
            Finish Round →
          </button>
        ) : (
          <button className="btn-primary big" onClick={() => setIdx((i) => i + 1)}>
            Next Hole →
          </button>
        )}
      </div>
    </div>
  );
}
