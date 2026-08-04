import { useEffect, useState } from 'react';
import type { Round, WolfChoice } from '../types';
import { Leaderboard } from '../components/Leaderboard';
import { Scorecard } from '../components/Scorecard';
import { LeagueBoard } from '../components/LeagueBoard';
import { MoneyBoard } from '../components/MoneyBoard';
import { MoneyTicker } from '../components/MoneyTicker';
import { HoleView } from './HoleView';
import { activeResults } from '../games';
import { firstIncompleteHole } from '../games/util';
import { wolfForHole } from '../games/wolf';
import { colorMap } from '../player';
import { getSettings, saveSettings } from '../storage';
import { applySunlight } from '../sunlight';
import { useWakeLock, wakeLockSupported } from '../useWakeLock';
import { EyeIcon, SunIcon } from '../icons';

export type PlayMode = 'hole' | 'board' | 'card';

interface Props {
  round: Round;
  onChange: (round: Round) => void;
  onFinish: () => void;
  onExit: () => void;
}

export function Play({ round, onChange, onFinish, onExit }: Props) {
  // Resume where scoring left off, not on hole 1.
  const [idx, setIdx] = useState(() => firstIncompleteHole(round));
  // A finished round opens on the scorecard — you're reviewing, not scoring.
  const [mode, setMode] = useState<PlayMode>(round.status === 'finished' ? 'card' : 'hole');
  const [warn, setWarn] = useState<'next' | 'finish' | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
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

  const [sunlight, setSunlight] = useState(() => getSettings().sunlight);
  const toggleSunlight = () => {
    const next = !sunlight;
    setSunlight(next);
    saveSettings({ sunlight: next });
    applySunlight(next);
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

  // Which way the hole content slides in — matches the swipe/arrow direction.
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const go = (next: number) => {
    setWarn(null);
    const clamped = Math.max(0, Math.min(round.holes.length - 1, next));
    setDir(clamped >= idx ? 'next' : 'prev');
    setIdx(clamped);
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

  const results = activeResults(round);

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
        {(['hole', 'board', 'card'] as const).map((m) => (
          <button
            key={m}
            className={`seg-btn${mode === m ? ' active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'hole' ? 'Hole' : m === 'board' ? 'Board' : 'Card'}
          </button>
        ))}
        {wakeLockSupported && (
          <button
            className={`awake-toggle${keepAwake ? ' on' : ''}`}
            onClick={toggleKeepAwake}
            aria-label="Keep screen awake"
            aria-pressed={keepAwake}
            title="Keep screen awake"
          >
            <EyeIcon size={20} />
          </button>
        )}
        <button
          className={`awake-toggle${sunlight ? ' on' : ''}`}
          onClick={toggleSunlight}
          aria-label="Sunlight mode"
          aria-pressed={sunlight}
          title="Sunlight mode — high-contrast light theme"
        >
          <SunIcon size={20} />
        </button>
      </div>

      {mode === 'hole' && !round.options.league && <MoneyTicker round={round} />}

      {mode === 'hole' && (
        <HoleView
          round={round}
          hole={hole}
          idx={idx}
          dir={dir}
          highlightId={highlightId}
          holeComplete={holeComplete}
          onGo={go}
          onScore={setScore}
          onWolf={setWolf}
          onPresses={setPresses}
        />
      )}

      {mode === 'board' && (
        <>
          {!round.options.league && <MoneyBoard round={round} onChange={onChange} />}
          <section className="boards">
            {round.options.league ? (
              <LeagueBoard round={round} />
            ) : (
              results.map((r) => (
                <Leaderboard key={r.gameType} result={r} colorOf={(id) => colors[id]} />
              ))
            )}
          </section>
        </>
      )}

      {mode === 'card' && (
        <Scorecard
          round={round}
          currentHole={hole.number}
          onJumpToHole={(i) => {
            setIdx(i);
            setMode('hole');
          }}
        />
      )}

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
