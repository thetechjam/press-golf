import { useEffect, useRef, useState } from 'react';
import type { Round, WolfChoice } from '../types';
import { HoleStepper } from '../components/HoleStepper';
import { Leaderboard } from '../components/Leaderboard';
import { WolfControls } from '../components/WolfControls';
import { Scorecard } from '../components/Scorecard';
import { activeResults } from '../games';
import { wolfForHole } from '../games/wolf';
import { strokeIndexMap, strokesReceivedOnHole } from '../games/handicap';

interface Props {
  round: Round;
  onChange: (round: Round) => void;
  onFinish: () => void;
  onExit: () => void;
}

export function Play({ round, onChange, onFinish, onExit }: Props) {
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<'hole' | 'card'>('hole');
  const [warn, setWarn] = useState<'next' | 'finish' | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);
  const hole = round.holes[idx];
  const last = idx === round.holes.length - 1;

  // Scroll the flagged stepper into view and clear the flash after it plays.
  useEffect(() => {
    if (!highlightId) return;
    document
      .getElementById(`stepper-${highlightId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHighlightId(null), 1400);
    return () => clearTimeout(t);
  }, [highlightId]);

  const go = (next: number) => {
    setWarn(null);
    setIdx(Math.max(0, Math.min(round.holes.length - 1, next)));
  };

  const setScore = (playerId: string, value: number | null) => {
    setWarn(null);
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

  // Players with no score on the current hole.
  const missing = round.players
    .filter((p) => round.scores[hole.number]?.[p.id] == null)
    .map((p) => p.name);

  // Holes anywhere in the round with at least one blank score.
  const incompleteHoles = round.holes.filter((h) =>
    round.players.some((p) => round.scores[h.number]?.[p.id] == null)
  ).length;

  const tryNext = () => (missing.length ? setWarn('next') : go(idx + 1));
  const tryFinish = () => (incompleteHoles > 0 ? setWarn('finish') : onFinish());
  const confirmProceed = () => {
    if (warn === 'next') go(idx + 1);
    else onFinish();
    setWarn(null);
  };

  // Dismiss the warning and jump to the first blank score to fill in.
  const keepScoring = () => {
    setWarn(null);
    setMode('hole');
    // Stay on this hole if it has a blank; otherwise go to the first incomplete hole.
    let targetIdx = idx;
    const currentHasBlank = round.players.some(
      (p) => round.scores[hole.number]?.[p.id] == null
    );
    if (!currentHasBlank) {
      const fi = round.holes.findIndex((h) =>
        round.players.some((p) => round.scores[h.number]?.[p.id] == null)
      );
      if (fi >= 0) targetIdx = fi;
    }
    setIdx(targetIdx);
    const targetHole = round.holes[targetIdx];
    const firstBlank = round.players.find(
      (p) => round.scores[targetHole.number]?.[p.id] == null
    );
    if (firstBlank) setHighlightId(firstBlank.id);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.changedTouches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 50) go(idx + (dx < 0 ? 1 : -1));
    touchX.current = null;
  };

  const results = activeResults(round);
  const parTotal = round.holes.reduce((s, h) => s + h.par, 0);
  const siMap = strokeIndexMap(round);

  return (
    <div className="screen play">
      <header className="bar">
        <button className="btn-ghost" onClick={onExit}>
          ‹ Rounds
        </button>
        <h1>{round.course || 'Round'}</h1>
        <button className="btn-ghost" onClick={tryFinish}>
          Finish
        </button>
      </header>

      <div className="seg view-toggle">
        <button
          className={`seg-btn${mode === 'hole' ? ' active' : ''}`}
          onClick={() => setMode('hole')}
        >
          Hole
        </button>
        <button
          className={`seg-btn${mode === 'card' ? ' active' : ''}`}
          onClick={() => setMode('card')}
        >
          Scorecard
        </button>
      </div>

      {mode === 'hole' ? (
        <div className="hole-view" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="hole-nav">
            <button
              className="nav-arrow"
              onClick={() => go(idx - 1)}
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
              onClick={() => go(idx + 1)}
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
                id={`stepper-${p.id}`}
                highlight={highlightId === p.id}
                name={p.name}
                par={hole.par}
                value={round.scores[hole.number]?.[p.id] ?? null}
                strokesReceived={
                  round.options.useNet
                    ? strokesReceivedOnHole(p.handicap ?? 0, siMap[hole.number], round.holes.length)
                    : 0
                }
                onChange={(v) => setScore(p.id, v)}
              />
            ))}
          </section>
        </div>
      ) : (
        <Scorecard
          round={round}
          currentHole={hole.number}
          onJumpToHole={(i) => {
            setIdx(i);
            setMode('hole');
          }}
        />
      )}

      <section className="boards">
        {results.map((r) => (
          <Leaderboard key={r.gameType} result={r} />
        ))}
      </section>

      <div className="play-foot">
        {warn && (
          <div className="warn-banner" role="alert">
            <p>
              {warn === 'next'
                ? `No score yet for ${missing.join(', ')}. Move to the next hole anyway?`
                : `${incompleteHoles} ${
                    incompleteHoles === 1 ? 'hole is' : 'holes are'
                  } missing scores. Finish the round anyway?`}
            </p>
            <div className="warn-actions">
              <button className="warn-keep" onClick={keepScoring}>
                Keep scoring
              </button>
              <button className="btn-primary" onClick={confirmProceed}>
                {warn === 'next' ? 'Skip anyway' : 'Finish anyway'}
              </button>
            </div>
          </div>
        )}
        {last ? (
          <button className="btn-primary big" onClick={tryFinish}>
            Finish Round →
          </button>
        ) : (
          <button className="btn-primary big" onClick={tryNext}>
            Next Hole →
          </button>
        )}
      </div>
    </div>
  );
}
