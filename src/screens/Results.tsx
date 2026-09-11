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
import { TrophyIcon, ShareIcon, PencilIcon, QrIcon } from '../icons';
import { renderShareCard } from '../shareCard';
import { renderScorecardCard } from '../scorecardCard';
import { EditHandicaps } from '../components/EditHandicaps';
import { SendRound } from '../components/SendRound';
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

/**
 * One of the two share CTAs on Results, and the app's only wait state.
 *
 * aria-disabled, not disabled: `disabled` drops the button out of the tab order
 * mid-interaction, so a keyboard user's focus falls to <body> the moment they
 * activate it. The onClick guard is what actually prevents a second canvas
 * render. aria-label tracks the visible label (WCAG 2.5.3 Label in Name) and
 * aria-busy announces the wait (4.1.3 Status Messages).
 *
 * Both labels are always rendered, stacked, so "Building…" can cross-fade with
 * the idle icon-and-word rather than replacing it in one frame: an icon plus a
 * noun and a bare gerund are two visibly different objects, and swapping them
 * outright reads as the button being replaced rather than as one button
 * changing state. Only the busy label leaves the flow — the idle one stays and
 * keeps setting the button's height, so nothing moves when the render starts.
 */
function ShareButton({
  label,
  busy,
  onShare,
}: {
  label: string;
  busy: boolean;
  onShare: () => void;
}) {
  const what = label.toLowerCase();
  return (
    <button
      className="btn-primary big"
      onClick={() => {
        if (!busy) onShare();
      }}
      aria-disabled={busy}
      aria-busy={busy}
      aria-label={busy ? `Building ${what}…` : `Share ${what}`}
    >
      <span className={`share-face${busy ? ' out' : ''}`}>
        <ShareIcon size={18} /> {label}
      </span>
      <span className={`share-face share-busy${busy ? '' : ' out'}`}>Building…</span>
    </button>
  );
}

export function Results({ round, onChange, onHome, onBackToPlay, unkept, onKeep }: Props) {
  const [copied, setCopied] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderingCard, setRenderingCard] = useState(false);
  const [showHcp, setShowHcp] = useState(false);
  const [sending, setSending] = useState(false);
  const results = activeResults(round);
  const hero = round.options.league ? null : winnerHero(round);
  const colors = colorMap(round);
  const hcpOf = (id: string) =>
    usesHandicaps(round) ? (round.players.find((p) => p.id === id)?.handicap ?? 0) : undefined;

  const shareText = async () => {
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

  // Scoreboard PNG first; falls back to a download, then to the text path.
  // The busy state covers only the canvas render — the share sheet can stay
  // open (or hang, on some desktop browsers) without freezing the button.
  const shareImage = async (
    render: () => Promise<Blob>,
    filename: string,
    setBusy: (v: boolean) => void
  ) => {
    setBusy(true);
    let file: File;
    let blobUrl: string;
    try {
      const blob = await render();
      file = new File([blob], filename, { type: 'image/png' });
      blobUrl = URL.createObjectURL(blob);
    } catch {
      setBusy(false);
      await shareText();
      return;
    }
    setBusy(false);
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Golf round results' });
      } else {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.click();
      }
    } catch (err) {
      // User closed the share sheet — not a failure, don't fall through.
      if ((err as Error)?.name !== 'AbortError') await shareText();
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  };

  const shareResults = () =>
    shareImage(() => renderShareCard(round), 'press-results.png', setRendering);
  const shareScorecard = () =>
    shareImage(() => renderScorecardCard(round), 'press-scorecard.png', setRenderingCard);

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
          <LeagueBoard round={round} />
        </section>
      ) : (
        <>
          <Settlement round={round} onChange={onChange} />
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

      <div className="share-row">
        <ShareButton label="Results" busy={rendering} onShare={shareResults} />
        <ShareButton label="Scorecard" busy={renderingCard} onShare={shareScorecard} />
      </div>
      <button className="btn-ghost share-text" onClick={shareText}>
        {copied ? 'Copied to clipboard' : 'Share as text instead'}
      </button>
      {/* A different thing from the two above, and worth its own row: those
          send a picture of the result, this sends the round itself, so the
          person on the other end can open it, keep it, and settle from it. */}
      <button className="btn-ghost send-round" onClick={() => setSending(true)}>
        <QrIcon size={16} /> Send the round to a phone
      </button>
      <button className="btn-ghost edit-hcp" onClick={() => setShowHcp(true)}>
        <PencilIcon size={16} /> Edit handicaps
      </button>

      {showHcp && (
        <EditHandicaps round={round} onChange={onChange} onClose={() => setShowHcp(false)} />
      )}

      {sending && <SendRound round={round} onClose={() => setSending(false)} />}
    </div>
  );
}
