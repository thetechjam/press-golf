import { useState, Suspense } from 'react';
import type { Round } from '../types';
import { Leaderboard } from '../components/Leaderboard';
import { Settlement } from '../components/Settlement';
import { LeagueBoard } from '../components/LeagueBoard';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { activeResults } from '../games';
import { asScrambleResult } from '../scrambleResult';
import { computeSettlement, formatMoney } from '../games/settlement';
import { computeLeague } from '../games/league';
import { colorMap } from '../player';
import { courseHandicapFor, usesHandicaps } from '../games/handicap';
import { TrophyIcon, ShareIcon } from '../icons';
import { EditHandicaps } from '../components/EditHandicaps';
import { setFirstNightHandicap } from '../games/roundEdits';
import { ShareSheet } from '../lazyScreens';
import { Awards } from '../components/Awards';
import { formatRoundDate, formatRoundDateAbsolute } from '../roundDate';
import { count } from '../plural';
import { KeepRoundsPrompt } from '../components/KeepRoundsPrompt';
import { ScrambleBoard } from '../components/ScrambleBoard';
import { isScramble, scrambleSummaryLines } from '../games/scramble';
import { winnerHero } from '../winnerHero';

interface Props {
  round: Round;
  onChange: (round: Round) => void;
  onHome: () => void;
  onBackToPlay: () => void;
  /** True when this round arrived by link and is not on this device yet. */
  unkept?: boolean;
  onKeep?: () => void;
  /** Opens the trip this round is part of. */
  onTrip?: (tripId: string) => void;
}

function buildSummary(round: Round): string {
  const lines: string[] = [];
  lines.push(`⛳ ${round.course || 'Golf round'} — ${formatRoundDateAbsolute(round.date)}`);

  if (round.options.league) {
    const league = computeLeague(round);
    lines.push('');
    for (const m of league.matches) {
      lines.push(`${m.label} (${m.matchup}): ${m.status}`);
      if (m.strokes.length)
        lines.push(`   strokes: ${m.strokes.map((s) => `${s.name} +${s.strokes}`).join(', ')}`);
    }
    lines.push('');
    lines.push('🏆 Points');
    for (const t of league.teams) {
      lines.push(`  ${t.name} — ${t.points}`);
    }
    lines.push('');
    lines.push('via Trunk · trunk.golf');
    return lines.join('\n');
  }

  const results = activeResults(round).map((r) => asScrambleResult(round, r));
  // A scramble team's default name has a comma in it ("Jesse, Sam & 2 more"), so
  // its teams are set apart with a dot — commas would run two teams together.
  lines.push(`${round.players.map((p) => p.name).join(isScramble(round) ? ' · ' : ', ')}`);
  lines.push('');
  for (const r of results) {
    lines.push(`${r.title}: ${r.status}`);
    for (const s of r.standings) {
      lines.push(`  ${s.playerId ? `${s.rank}.` : '·'} ${s.label} — ${s.detail}`);
    }
    lines.push('');
  }
  // Whose drives were used is the part of a scramble the card cannot carry,
  // and the part the group chat will argue about.
  const shotLines = scrambleSummaryLines(round);
  if (shotLines.length) {
    lines.push(...shotLines);
    lines.push('');
  }

  const settlement = computeSettlement(round);
  if (settlement.active) {
    lines.push('💰 Settlement');
    if (settlement.transactions.length === 0) {
      lines.push("  Everyone's even");
    } else {
      for (const t of settlement.transactions) {
        lines.push(`  ${t.from} pays ${t.to} ${formatMoney(t.amount)}`);
      }
    }
    // The screen says these are not the payments to make; the text that goes
    // to the group chat has to say so too.
    if (round.trip) lines.push(`  Part of ${round.trip.name} — settles up at the end of the trip`);
    lines.push('');
  }

  lines.push('via Trunk · trunk.golf');
  return lines.join('\n');
}

export function Results({ round, onChange, onHome, onBackToPlay, unkept, onKeep, onTrip }: Props) {
  const [showHcp, setShowHcp] = useState(false);
  const [sharing, setSharing] = useState(false);
  const results = activeResults(round).map((r) => asScrambleResult(round, r));
  const hero = round.options.league ? null : winnerHero(round);
  const colors = colorMap(round);
  const scramble = isScramble(round);
  // The course handicap, not the stored stroke count: an Index player's
  // badge read "0" while they were getting strokes.
  const hcpOf = (id: string) => {
    const p = round.players.find((q) => q.id === id);
    return usesHandicaps(round) && p ? courseHandicapFor(round, p) : undefined;
  };

  return (
    <div className="screen results">
      <header className="bar">
        {/* "Card" matches Play's tab name, and keeps this distinct from the
            Share scorecard button further down. */}
        <button className="btn-ghost icon back" onClick={onBackToPlay} aria-label="Back to the scorecard">
          ‹
        </button>
        <h1 tabIndex={-1}>Results</h1>
        <button className="btn-ghost" onClick={onHome}>
          Home
        </button>
      </header>

      {!unkept && round.status === 'finished' && <KeepRoundsPrompt />}

      {unkept && (
        <div className="unkept" role="status">
          <div className="unkept-text">
            <strong>Sent to you</strong>
            <span>
              {round.status === 'finished'
                ? 'Not saved on this phone yet.'
                : 'Still being played. Take it on to keep scoring.'}
            </span>
          </div>
          <button className="btn-secondary" onClick={onKeep}>
            {round.status === 'finished' ? 'Keep it' : 'Take it on'}
          </button>
        </div>
      )}

      <div className="results-meta">
        <div className="results-course">{round.course || 'Golf round'}</div>
        <div className="results-sub">
          {formatRoundDate(round.date)} · {count(round.players.length, scramble ? 'team' : 'player')} ·{' '}
          {count(round.holes.length, 'hole')}
        </div>
      </div>

      {hero && (
        <div className="winner-hero">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="confetti" style={{ '--i': i } as React.CSSProperties} />
          ))}
          <div className="winner-avatars">
            {hero.players.length === 0 ? (
              <span className="winner-emoji">
                <TrophyIcon size={44} />
              </span>
            ) : (
              hero.players.map((p, i) => (
                <PlayerAvatar key={i} name={p.name} color={p.color} size={60} />
              ))
            )}
          </div>
          <div className="winner-line">{hero.line}</div>
          <div className="winner-sub">{hero.sub}</div>
        </div>
      )}

      {round.options.league ? (
        <>
          {/* No money in a league round: the awards follow the hero's place. */}
          <Awards round={round} />
          <section className="boards">
            <LeagueBoard
              round={round}
              onEditHandicaps={() => setShowHcp(true)}
              onSetHandicap={(id, n) => onChange(setFirstNightHandicap(round, id, n))}
            />
          </section>
        </>
      ) : (
        <>
          {/* Who pays whom is the part people act on, so it comes straight
              under the hero, above the fold on a phone; the awards follow.
              One scramble team has no one to settle with. */}
          {!(scramble && round.players.length < 2) && (
            <Settlement
              round={round}
              onChange={onChange}
              onEditHandicaps={() => setShowHcp(true)}
            />
          )}
          {/* On a trip, this round's payments are not the ones to make: the
              trip settles once, across every round. Said right under them. */}
          {round.trip && onTrip && !unkept && (
            <button className="trip-link" onClick={() => onTrip(round.trip!.id)}>
              <span>
                Part of <strong>{round.trip.name}</strong> — settle up across the trip
              </span>
              <span aria-hidden="true">›</span>
            </button>
          )}
          <Awards round={round} />
          <section className="boards">
            {results.map((r) => (
              <Leaderboard
                key={r.gameType}
                result={r}
                colorOf={(id) => colors[id]}
                hcpOf={hcpOf}
              />
            ))}
            {scramble && <ScrambleBoard round={round} />}
          </section>
        </>
      )}

      {/* One way out of this screen, not five. Everything that was stacked
          here — two picture buttons, a text fallback and the round's own
          link — is grouped in the sheet, where the difference between sending
          a picture of the result and sending the round can actually be shown.
          Editing handicaps was never sharing and has gone to sit beside
          Edit stakes, which is the same kind of act. */}
      <button className="btn-primary big share-open" onClick={() => setSharing(true)}>
        <ShareIcon size={18} /> Share
      </button>

      {showHcp && (
        <EditHandicaps round={round} onChange={onChange} onClose={() => setShowHcp(false)} />
      )}

      {sharing && (
        <Suspense fallback={null}>
          <ShareSheet round={round} summary={buildSummary(round)} onClose={() => setSharing(false)} />
        </Suspense>
      )}
    </div>
  );
}
