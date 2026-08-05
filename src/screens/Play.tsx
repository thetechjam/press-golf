import { useEffect, useState } from 'react';
import type { Round, WolfChoice } from '../types';
import { Leaderboard } from '../components/Leaderboard';
import { Scorecard } from '../components/Scorecard';
import { LeagueBoard } from '../components/LeagueBoard';
import { MoneyBoard } from '../components/MoneyBoard';
import { MoneyTicker, SwingTicker } from '../components/MoneyTicker';
import { HoleView } from './HoleView';
import { activeResults } from '../games';
import { firstIncompleteHole } from '../games/util';
import { visibleSwing } from '../games/money';
import { wolfForHole } from '../games/wolf';
import { colorMap } from '../player';
import { usesHandicaps } from '../games/handicap';
import { getSettings, saveSettings } from '../storage';
import { applyTheme } from '../theme';
import { useWakeLock, wakeLockSupported } from '../useWakeLock';
import { EyeIcon, ContrastIcon, GearIcon, PencilIcon } from '../icons';
import { SettingsSheet } from '../components/SettingsSheet';
import { EditHandicaps } from '../components/EditHandicaps';

type PlayMode = 'hole' | 'board' | 'card';

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

  const [showSettings, setShowSettings] = useState(false);
  const [showHcp, setShowHcp] = useState(false);
  const [glare, setGlare] = useState(() => getSettings().glare);
  const toggleGlare = () => {
    const next = !glare;
    setGlare(next);
    const s = saveSettings({ glare: next });
    applyTheme(s.theme, s.glare);
  };

  // Because keepAwake and glare are also editable in the sheet, re-read both
  // on close so neither pair of controls can disagree.
  const closeSettings = () => {
    setShowSettings(false);
    const s = getSettings();
    setKeepAwake(s.keepAwake);
    setGlare(s.glare);
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

  // A hole is complete when every player has a score — drives the progress strip.
  const holeComplete = round.holes.map((h) =>
    round.players.every((p) => round.scores[h.number]?.[p.id] != null)
  );

  // Only the Board tab's non-league leaderboards need these — skip the work
  // on the other two tabs, and for league rounds (which render LeagueBoard).
  let results: ReturnType<typeof activeResults> = [];
  let colors: ReturnType<typeof colorMap> = {};
  if (mode === 'board' && !round.options.league) {
    results = activeResults(round);
    colors = colorMap(round);
  }

  const hcpOf = (id: string) =>
    usesHandicaps(round) ? (round.players.find((p) => p.id === id)?.handicap ?? 0) : undefined;

  // The most recently completed hole's money swing, gated exactly by
  // games/money.ts's visibleSwing — null falls back to the running ticker.
  const swing = mode === 'hole' && !round.options.league ? visibleSwing(round, hole) : null;

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
          className={`awake-toggle${glare ? ' on' : ''}`}
          onClick={toggleGlare}
          aria-label="Glare mode"
          aria-pressed={glare}
          title="Glare mode — max contrast for direct sun"
        >
          <ContrastIcon size={20} />
        </button>
        <button
          className="awake-toggle gear-btn"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          title="Settings"
        >
          <GearIcon size={20} />
        </button>
      </div>

      {mode === 'hole' && !round.options.league && (
        swing ? (
          <SwingTicker round={round} hole={hole} swing={swing} />
        ) : (
          <MoneyTicker round={round} />
        )
      )}

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
                <Leaderboard
                  key={r.gameType}
                  result={r}
                  colorOf={(id) => colors[id]}
                  hcpOf={hcpOf}
                />
              ))
            )}
          </section>
          <button className="btn-ghost edit-hcp" onClick={() => setShowHcp(true)}>
            <PencilIcon size={16} /> Edit handicaps
          </button>
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
          <button className="btn-primary big" onClick={tryFinish}>
            Finish Round →
          </button>
        ) : (
          <button className="btn-primary big" onClick={tryNext}>
            Next Hole →
          </button>
        )}
      </div>

      {showSettings && <SettingsSheet onClose={closeSettings} />}
      {showHcp && (
        <EditHandicaps round={round} onChange={onChange} onClose={() => setShowHcp(false)} />
      )}
    </div>
  );
}
