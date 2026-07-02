import { useEffect, useRef, useState } from 'react';
import type { Round, WolfChoice } from '../types';
import { HoleStepper } from '../components/HoleStepper';
import { Leaderboard } from '../components/Leaderboard';
import { WolfControls } from '../components/WolfControls';
import { NassauControls } from '../components/NassauControls';
import { Scorecard } from '../components/Scorecard';
import { LeagueBoard } from '../components/LeagueBoard';
import { activeResults } from '../games';
import { firstIncompleteHole } from '../games/util';
import { wolfForHole } from '../games/wolf';
import { strokeIndexMap, strokesReceivedOnHole } from '../games/handicap';
import { playerColor, colorMap } from '../player';
import { getSettings, saveSettings } from '../storage';
import { useWakeLock, wakeLockSupported } from '../useWakeLock';

interface Props {
  round: Round;
  onChange: (round: Round) => void;
  onFinish: () => void;
  onExit: () => void;
}

export function Play({ round, onChange, onFinish, onExit }: Props) {
  // Resume where scoring left off, not on hole 1.
  const [idx, setIdx] = useState(() => firstIncompleteHole(round));
  const [mode, setMode] = useState<'hole' | 'card'>('hole');
  const [warn, setWarn] = useState<'next' | 'finish' | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [keepAwake, setKeepAwake] = useState(() => getSettings().keepAwake);
  const hole = round.holes[idx];
  const last = idx === round.holes.length - 1;

  // Lock lives only while Play is mounted — released on exit/finish by unmount.
  useWakeLock(keepAwake);

  const toggleKeepAwake = () => {
    const next = !keepAwake;
    setKeepAwake(next);
    saveSettings({ keepAwake: next });
  };

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

  const setPresses = (presses: number[]) => onChange({ ...round, presses });

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
      go(idx + (dx < 0 ? 1 : -1));
    }
    touchStart.current = null;
  };

  const results = activeResults(round);
  const parTotal = round.holes.reduce((s, h) => s + h.par, 0);
  const siMap = strokeIndexMap(round);

  // A hole is complete when every player has a score — drives the progress strip.
  const holeComplete = round.holes.map((h) =>
    round.players.every((p) => round.scores[h.number]?.[p.id] != null)
  );

  const colors = colorMap(round);

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
        {wakeLockSupported && (
          <button
            className={`awake-toggle${keepAwake ? ' on' : ''}`}
            onClick={toggleKeepAwake}
            aria-label="Keep screen awake"
            aria-pressed={keepAwake}
            title="Keep screen awake"
          >
            🔆
          </button>
        )}
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

          <div className="hole-dots" aria-label="Hole progress">
            {round.holes.map((h, i) => (
              <button
                key={h.number}
                className={`hole-dot${i === idx ? ' current' : ''}${
                  holeComplete[i] ? ' done' : ''
                }`}
                onClick={() => go(i)}
                aria-label={`Hole ${h.number}${holeComplete[i] ? ', complete' : ''}`}
                aria-current={i === idx ? 'true' : undefined}
              />
            ))}
          </div>

          <div className="progress">
            Hole {idx + 1} of {round.holes.length} · Par {parTotal}
          </div>

          {round.games.includes('wolf') && (
            <WolfControls round={round} hole={hole} onChange={setWolf} />
          )}

          {round.games.includes('nassau') && (
            <NassauControls round={round} hole={hole} onChange={setPresses} />
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
        {round.options.league ? (
          <LeagueBoard round={round} />
        ) : (
          results.map((r) => (
            <Leaderboard key={r.gameType} result={r} colorOf={(id) => colors[id]} />
          ))
        )}
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
          <button className="btn-primary big sticky" onClick={tryFinish}>
            Finish Round →
          </button>
        ) : (
          <button className="btn-primary big sticky" onClick={tryNext}>
            Next Hole →
          </button>
        )}
      </div>
    </div>
  );
}
