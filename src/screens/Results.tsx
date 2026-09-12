import { useState } from 'react';
import type { Round } from '../types';
import { Leaderboard } from '../components/Leaderboard';
import { Settlement } from '../components/Settlement';
import { LeagueBoard } from '../components/LeagueBoard';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { activeResults } from '../games';
import { computeSettlement, formatMoney } from '../games/settlement';
import { computeLeague } from '../games/league';
import { colorMap } from '../player';
import { usesHandicaps } from '../games/handicap';
import { TrophyIcon, ShareIcon } from '../icons';
import { EditHandicaps } from '../components/EditHandicaps';
import { ShareSheet } from '../components/ShareSheet';
import { Awards } from '../components/Awards';
import { formatRoundDate } from '../roundDate';

interface Hero {
  players: { name: string; color: string }[];
  line: string;
  sub: string;
}

// The payoff headline: money leader when stakes are set, else the leader of the
// first decided game. League rounds skip the hero — the board tells the story.
function winnerHero(round: Round): Hero | null {
  const colors = colorMap(round);

  const settlement = computeSettlement(round);
  if (settlement.active) {
    const nets = round.players
      .map((p) => ({ name: p.name, color: colors[p.id], net: settlement.totals[p.id] ?? 0 }))
      .sort((x, y) => y.net - x.net);
    if (nets[0] && nets[0].net > 0 && nets[0].net !== nets[1]?.net) {
      return {
        players: [{ name: nets[0].name, color: nets[0].color }],
        line: `${nets[0].name} wins ${formatMoney(nets[0].net)}`,
        sub: 'biggest winner',
      };
    }
  }

  const first = activeResults(round).find((r) =>
    r.standings.some((s) => s.isLeader && s.playerId)
  );
  if (first) {
    const players = first.standings
      .filter((s) => s.isLeader && s.playerId)
      .map((s) => ({ name: s.label, color: colors[s.playerId!] }));
    return {
      players,
      line: players.length === 1 ? `${players[0].name} wins` : 'Tied at the top',
      sub: first.title,
    };
  }

  return null;
}

interface Props {
  round: Round;
  onChange: (round: Round) => void;
  onHome: () => void;
  onBackToPlay: () => void;
  /** True when this round arrived by link and is not on this device yet. */
  unkept?: boolean;
  onKeep?: () => void;
}

function buildSummary(round: Round): string {
  const lines: string[] = [];
  lines.push(`⛳ ${round.course || 'Golf round'} — ${round.date}`);

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
    lines.push('via Press');
    return lines.join('\n');
  }

  const results = activeResults(round);
  lines.push(`${round.players.map((p) => p.name).join(', ')}`);
  lines.push('');
  for (const r of results) {
    lines.push(`${r.title}: ${r.status}`);
    for (const s of r.standings) {
      lines.push(`  ${s.playerId ? `${s.rank}.` : '·'} ${s.label} — ${s.detail}`);
    }
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
    lines.push('');
  }

  lines.push('via Press');
  return lines.join('\n');
}

export function Results({ round, onChange, onHome, onBackToPlay, unkept, onKeep }: Props) {
  const [showHcp, setShowHcp] = useState(false);
  const [sharing, setSharing] = useState(false);
  const results = activeResults(round);
  const hero = round.options.league ? null : winnerHero(round);
  const colors = colorMap(round);
  const hcpOf = (id: string) =>
    usesHandicaps(round) ? (round.players.find((p) => p.id === id)?.handicap ?? 0) : undefined;

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
          {formatRoundDate(round.date)} · {round.players.length} players · {round.holes.length} holes
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

      <Awards round={round} />

      {round.options.league ? (
        <section className="boards">
          <LeagueBoard
            round={round}
            onEditHandicaps={() => setShowHcp(true)}
          />
        </section>
      ) : (
        <>
          <Settlement
            round={round}
            onChange={onChange}
            onEditHandicaps={() => setShowHcp(true)}
          />
          <section className="boards">
            {results.map((r) => (
              <Leaderboard
                key={r.gameType}
                result={r}
                colorOf={(id) => colors[id]}
                hcpOf={hcpOf}
              />
            ))}
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
        <ShareSheet round={round} summary={buildSummary(round)} onClose={() => setSharing(false)} />
      )}
    </div>
  );
}
