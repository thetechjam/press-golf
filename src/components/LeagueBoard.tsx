import { useState } from 'react';
import type { Round } from '../types';
import { canCallLeagueMatch, computeLeague, holesFinishedByAll } from '../games/league';
import { handicapFromNight } from '../games/leagueHandicap';
import { TrophyIcon } from '../icons';

const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

export function LeagueBoard({
  round,
  onEditHandicaps,
  onSetEnded,
  onSetHandicap,
}: {
  round: Round;
  /** A league night has no Settlement card, so the edit lives here instead. */
  onEditHandicaps?: () => void;
  /**
   * Calls the match for darkness or weather (true), or resumes it (false).
   * Absent where the round cannot be changed, e.g. on Results.
   */
  onSetEnded?: (ended: boolean) => void;
  /** Sets a first-night player's handicap from tonight's score. */
  onSetHandicap?: (playerId: string, handicap: number) => void;
}) {
  const league = computeLeague(round);
  const [confirming, setConfirming] = useState(false);
  const canCall = !!onSetEnded && canCallLeagueMatch(round);
  const done = holesFinishedByAll(round).length;
  const [t0, t1] = league.teams;
  // Leader is marked by the row highlight alone — no trophy glyph.
  const lead = t0.points === t1.points ? null : t0.points > t1.points ? 0 : 1;

  return (
    <section className="board league-board">
      <div className="board-head">
        <span className="board-title">
          <TrophyIcon size={16} /> League
        </span>
        <span className="board-edits">
          {onEditHandicaps && (
            <button className="link-btn" onClick={onEditHandicaps}>
              Edit handicaps
            </button>
          )}
          <span className="board-status">
            {league.provisional.length
              ? 'Provisional'
              : league.endedAfter != null
                ? 'Called'
                : league.complete
                  ? 'Final'
                  : 'Live'}
          </span>
        </span>
      </div>

      <ol className="board-list">
        <li className={`board-row${lead === 0 ? ' leader' : ''}`}>
          <span className="board-name">{t0.name}</span>
          <span className="board-detail">{fmtPts(t0.points)} pts</span>
        </li>
        <li className={`board-row${lead === 1 ? ' leader' : ''}`}>
          <span className="board-name">{t1.name}</span>
          <span className="board-detail">{fmtPts(t1.points)} pts</span>
        </li>
      </ol>

      <div className="league-matches">
        {league.matches.map((m) => (
          <div key={m.key} className="lmatch">
            <div className="lmatch-top">
              <span className="lmatch-label">{m.label}</span>
              <span className="lmatch-up">{m.matchup}</span>
            </div>
            <div className={`lmatch-status${m.over ? ' final' : ''}`}>{m.status}</div>
            <div className="lmatch-strokes">
              {m.forfeit
                ? 'Forfeit — no match played'
                : m.strokes.length
                  ? m.strokes.map((s) => `${s.name} gets ${s.strokes}`).join(' · ')
                  : 'No strokes — plays scratch'}
            </div>
          </div>
        ))}
      </div>

      {/* League rule: a brand-new player's handicap is 70% of their over-par
          average, and on a first night that average is tonight's score. */}
      {league.provisional.length > 0 && (
        <div className="league-called">
          {league.provisional.map((p) => {
            const night = handicapFromNight(round, p.id);
            return (
              <div key={p.id} className="first-night-row">
                <p>
                  <strong>{p.name}</strong>’s handicap comes from tonight’s score, so these
                  results are provisional.{' '}
                  {night
                    ? `Tonight: ${night.overPar > 0 ? '+' : ''}${night.overPar} over par.`
                    : 'Set it once they have finished.'}
                </p>
                {night && onSetHandicap && (
                  <button
                    className="btn-secondary hcp-use"
                    onClick={() => onSetHandicap(p.id, night.handicap)}
                  >
                    Set {p.name} to {night.handicap} (70% of {night.overPar > 0 ? '+' : ''}
                    {night.overPar})
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* League rule: play discontinued for darkness or lightning after 5 or
          more holes is complete, on the holes the whole foursome finished —
          and can be picked up again on a later day by the same players. */}
      {league.endedAfter != null ? (
        <div className="league-called">
          <p>
            Called after {league.endedAfter} holes for darkness or weather. Every match is final
            as it stood; later holes don't count.
          </p>
          {onSetEnded && (
            <button className="link-btn" onClick={() => onSetEnded(false)}>
              Resume match
            </button>
          )}
        </div>
      ) : canCall && !confirming ? (
        <button className="link-btn league-call" onClick={() => setConfirming(true)}>
          End match here — darkness or weather
        </button>
      ) : canCall ? (
        <div className="league-called" role="alert">
          <p>
            End every match on the {done} holes all four have finished? Points go to whoever is
            ahead now. You can resume later.
          </p>
          <div className="warn-actions">
            <button className="warn-keep" onClick={() => setConfirming(false)}>
              Keep playing
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setConfirming(false);
                onSetEnded!(true);
              }}
            >
              End match
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
