import { useEffect, useState } from 'react';
import type { JunkClaims, Round, WolfChoice } from '../types';
import { LEAGUE_MAX_SCORE, pickedUp } from '../games/league';
import { Leaderboard } from '../components/Leaderboard';
import { Scorecard } from '../components/Scorecard';
import { LeagueBoard } from '../components/LeagueBoard';
import { MoneyBoard } from '../components/MoneyBoard';
import { BoardJump } from '../components/BoardJump';
import { HoleTicker } from '../components/MoneyTicker';
import { HoleView } from './HoleView';
import { activeResults } from '../games';
import { firstIncompleteHole } from '../games/util';
import { visibleSwing } from '../games/money';
import { wolfForHole } from '../games/wolf';
import { colorMap } from '../player';
import { usesHandicaps } from '../games/handicap';
import { getSettings } from '../storage';
import { useWakeLock } from '../useWakeLock';
import { GearIcon, PencilIcon } from '../icons';
import { SettingsSheet } from '../components/SettingsSheet';
import { EditHandicaps } from '../components/EditHandicaps';
import { SendRound } from '../components/SendRound';

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

  const [showSettings, setShowSettings] = useState(false);
  const [showHcp, setShowHcp] = useState(false);
  const [handingOver, setHandingOver] = useState(false);

  // Keep screen awake is set in the sheet now, so re-read it on close: the lock
  // itself lives here, for as long as Play is mounted, and has to follow.
  // Glare needs no equivalent — the sheet applies the theme itself, and this
  // screen no longer holds an opinion about it.
  const closeSettings = () => {
    setShowSettings(false);
    setKeepAwake(getSettings().keepAwake);
  };

  // Scroll the flagged player row into view and clear the flash after it plays.
  useEffect(() => {
    if (!highlightId) return;
    document
      .getElementById(`player-row-${highlightId}`)
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

  /** The round's pick-ups with this player's on this hole set or cleared. */
  const pickupsWith = (holeNumber: number, playerId: string, on: boolean) => {
    const here = (round.pickups?.[holeNumber] ?? []).filter((id) => id !== playerId);
    const next = { ...(round.pickups ?? {}), [holeNumber]: on ? [...here, playerId] : here };
    if (!next[holeNumber].length) delete next[holeNumber];
    return Object.keys(next).length ? next : undefined;
  };

  const setScoreAt = (holeNumber: number, playerId: string, value: number | null) => {
    setWarn(null);
    // League rule: nothing over a 9. The engine caps too; this keeps the card
    // honest about what was scored.
    const capped =
      round.options.league && value != null ? Math.min(value, LEAGUE_MAX_SCORE) : value;
    const holeScores = { ...(round.scores[holeNumber] ?? {}), [playerId]: capped };
    const next: Round = { ...round, scores: { ...round.scores, [holeNumber]: holeScores } };
    // A number entered over an X replaces it: the player did hole out after all.
    if (pickedUp(round, holeNumber, playerId)) next.pickups = pickupsWith(holeNumber, playerId, false);
    onChange(next);
  };

  /**
   * League: toggle a pick-up. An X is recorded as the league maximum of 9, so
   * the hole counts as scored and totals stay sane; the flag is what makes
   * the league engine treat it as a forfeited hole. Toggling it off clears the
   * score as well, back to a blank.
   */
  const togglePickup = (playerId: string) => {
    setWarn(null);
    const on = !pickedUp(round, hole.number, playerId);
    const holeScores = {
      ...(round.scores[hole.number] ?? {}),
      [playerId]: on ? LEAGUE_MAX_SCORE : null,
    };
    onChange({
      ...round,
      scores: { ...round.scores, [hole.number]: holeScores },
      pickups: pickupsWith(hole.number, playerId, on),
    });
  };

  const setScore = (playerId: string, value: number | null) =>
    setScoreAt(hole.number, playerId, value);

  const setPresses = (presses: number[]) => onChange({ ...round, presses });
  const setJunk = (junk: JunkClaims) => onChange({ ...round, junk });

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
        <button className="btn-ghost icon back" onClick={onExit} aria-label="Back to rounds">
          ‹
        </button>
        <h1 tabIndex={-1}>{round.course || 'Round'}</h1>
        <button className="btn-ghost" onClick={tryFinish}>
          Finish
        </button>
      </header>

      <div className="seg view-toggle">
        {/* Grouped for the same reason the icons are, and for one more: a flex
            item's line break is decided from its flex-basis, and `flex: 1`
            makes that 0 — so three tabs that cannot actually shrink below
            "BOARD" never force the row to wrap, and whatever is last in it
            hangs off the edge of the phone instead. As one item the group
            carries its real width, and a grid inside keeps the three equal. */}
        <div className="view-tabs">
          {(['hole', 'board', 'card'] as const).map((m) => (
            <button
              key={m}
              className={`seg-btn${mode === m ? ' active' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'hole' ? 'Hole' : m === 'board' ? 'Board' : 'Card'}
            </button>
          ))}
        </div>
        {/* Settings, and nothing else. Glare and Keep screen awake used to sit
            here too, and both are in the sheet this opens — so the row carried
            three icons to save a tap on two settings that are set once and left
            alone. Three tabs and one button fit any phone with room over. */}
        <button
          className="view-tool"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          title="Settings"
        >
          <GearIcon size={20} />
        </button>
      </div>

      {mode === 'hole' && !round.options.league && (
        <HoleTicker round={round} hole={hole} swing={swing} />
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
          onPickup={togglePickup}
          onWolf={setWolf}
          onPresses={setPresses}
          onJunk={setJunk}
        />
      )}

      {mode === 'board' && (
        <>
          {/* Only worth a row once there are three cards to choose between. */}
          {results.length >= 2 && (
            <BoardJump
              targets={[
                { id: 'board-money', label: 'Money' },
                ...results.map((r) => ({ id: `board-${r.gameType}`, label: r.title })),
              ]}
            />
          )}
          {!round.options.league && <MoneyBoard round={round} onChange={onChange} />}
          <section className="boards">
            {round.options.league ? (
              <LeagueBoard
                round={round}
                onSetEnded={(ended) => {
                  const league = { ...round.options.league! };
                  if (ended) league.ended = true;
                  else delete league.ended;
                  onChange({ ...round, options: { ...round.options, league } });
                }}
              />
            ) : (
              results.map((r) => (
                <Leaderboard
                  key={r.gameType}
                  id={`board-${r.gameType}`}
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
          onScore={setScoreAt}
        />
      )}

      <div className="screen-foot play-foot">
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

      {showSettings && (
        <SettingsSheet
          onClose={closeSettings}
          screen="play"
          round={round}
          // Only while the round is live: handing over a finished card is what
          // the Send button on Results is for, and it says something different.
          onHandOver={
            round.status === 'finished'
              ? undefined
              : () => {
                  closeSettings();
                  setHandingOver(true);
                }
          }
        />
      )}

      {handingOver && <SendRound round={round} onClose={() => setHandingOver(false)} />}
      {showHcp && (
        <EditHandicaps round={round} onChange={onChange} onClose={() => setShowHcp(false)} />
      )}
    </div>
  );
}
