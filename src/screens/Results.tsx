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

interface Hero {
  players: { name: string; color: string }[];
  line: string;
  sub: string;
}

const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

// The payoff headline: money leader when stakes are set, else the leader of the
// first decided game, else the league winner. Null only when nothing separates players.
function winnerHero(round: Round): Hero | null {
  const colors = colorMap(round);

  if (round.options.league) {
    const league = computeLeague(round);
    const [a, b] = league.teams;
    const score = `${fmtPts(a.points)}–${fmtPts(b.points)}`;
    if (a.points === b.points) return { players: [], line: 'All square', sub: score };
    const win = a.points > b.points ? a : b;
    return { players: [], line: `${win.name} wins`, sub: score };
  }

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
}

function buildSummary(round: Round): string {
  const lines: string[] = [];
  lines.push(`⛳ ${round.course || 'Golf round'} — ${round.date}`);

  if (round.options.league) {
    const league = computeLeague(round);
    lines.push('');
    for (const m of league.matches) {
      lines.push(`${m.label} (${m.matchup}): ${m.status}`);
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

export function Results({ round, onChange, onHome, onBackToPlay }: Props) {
  const [copied, setCopied] = useState(false);
  const results = activeResults(round);
  const hero = winnerHero(round);
  const colors = colorMap(round);

  const share = async () => {
    const text = buildSummary(round);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Golf round results', text });
        return;
      }
    } catch {
      /* fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="screen results">
      <header className="bar">
        <button className="btn-ghost" onClick={onBackToPlay}>
          ‹ Scorecard
        </button>
        <h1>Results</h1>
        <button className="btn-ghost" onClick={onHome}>
          Home
        </button>
      </header>

      <div className="results-meta">
        <div className="results-course">{round.course || 'Golf round'}</div>
        <div className="results-sub">
          {round.date} · {round.players.length} players · {round.holes.length} holes
        </div>
      </div>

      {hero && (
        <div className="winner-hero">
          <div className="winner-avatars">
            {hero.players.length === 0 ? (
              <span className="winner-emoji">🏆</span>
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
        <section className="boards">
          <LeagueBoard round={round} />
        </section>
      ) : (
        <>
          <Settlement round={round} onChange={onChange} />
          <section className="boards">
            {results.map((r) => (
              <Leaderboard key={r.gameType} result={r} colorOf={(id) => colors[id]} />
            ))}
          </section>
        </>
      )}

      <button className="btn-primary big" onClick={share}>
        {copied ? '✓ Copied to clipboard' : '📤 Share results'}
      </button>
    </div>
  );
}
