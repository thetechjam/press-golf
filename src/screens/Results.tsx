import { useState } from 'react';
import type { Round } from '../types';
import { Leaderboard } from '../components/Leaderboard';
import { activeResults } from '../games';

interface Props {
  round: Round;
  onHome: () => void;
  onBackToPlay: () => void;
}

function buildSummary(round: Round): string {
  const results = activeResults(round);
  const lines: string[] = [];
  lines.push(`⛳ ${round.course || 'Golf round'} — ${round.date}`);
  lines.push(`${round.players.map((p) => p.name).join(', ')}`);
  lines.push('');
  for (const r of results) {
    lines.push(`${r.title}: ${r.status}`);
    for (const s of r.standings) {
      lines.push(`  ${s.playerId ? `${s.rank}.` : '·'} ${s.label} — ${s.detail}`);
    }
    lines.push('');
  }
  lines.push('via Press');
  return lines.join('\n');
}

export function Results({ round, onHome, onBackToPlay }: Props) {
  const [copied, setCopied] = useState(false);
  const results = activeResults(round);

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

      <section className="boards">
        {results.map((r) => (
          <Leaderboard key={r.gameType} result={r} />
        ))}
      </section>

      <button className="btn-primary big" onClick={share}>
        {copied ? '✓ Copied to clipboard' : '📤 Share results'}
      </button>
    </div>
  );
}
