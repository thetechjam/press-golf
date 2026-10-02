import { useMemo, useState } from 'react';
import type { Round } from '../types';
import { listRounds } from '../storage';
import { leagueSeason, leagueSeasonYears } from '../games/leagueSeason';
import { formatRoundDate } from '../roundDate';
import { TrophyIcon } from '../icons';

interface Props {
  onBack: () => void;
  onViewResults: (round: Round) => void;
}

/** League points come in halves: a halved match splits its point. */
const pts = (n: number) => {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  return half ? (whole ? `${whole}½` : '½') : `${whole}`;
};
const record = (w: number, l: number, h: number) => `${w}–${l}–${h}`;
const overPar = (n: number) => (Math.abs(n) < 0.05 ? 'E' : `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`);

/** Ranks that share a place on a tie: 1, 2, 2, 4. */
function ranks<T>(rows: T[], same: (a: T, b: T) => boolean): number[] {
  return rows.map((_, i) => {
    let r = i;
    while (r > 0 && same(rows[r - 1], rows[i])) r -= 1;
    return r + 1;
  });
}

/**
 * The season so far, from the league nights on this phone.
 *
 * Teams on points, then each player's own A or B match, then the nights
 * themselves. It says where the numbers come from on the screen rather than
 * in a help page, because the thing most likely to go wrong is somebody
 * reading one foursome's phone as the whole league's table.
 */
export function LeagueStandings({ onBack, onViewResults }: Props) {
  const rounds = useMemo(listRounds, []);
  const years = useMemo(() => leagueSeasonYears(rounds), [rounds]);
  const [year, setYear] = useState<number | undefined>(years[0]);
  const season = useMemo(
    () => (year == null ? null : leagueSeason(rounds, year)),
    [rounds, year]
  );

  const teamRanks = season ? ranks(season.teams, (a, b) => a.points === b.points) : [];
  const playerRanks = season
    ? ranks(season.players, (a, b) => a.won - a.lost === b.won - b.lost && a.won === b.won)
    : [];

  return (
    <div className="screen standings">
      <header className="bar">
        <button className="btn-ghost icon back" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h1 tabIndex={-1}>Standings</h1>
        {/* Balances the back button so the title stays optically centered. */}
        <span className="bar-spacer" aria-hidden="true" />
      </header>

      {!season ? (
        <p className="history-empty">
          No league nights on this phone yet. Finish one and the season table starts here.
        </p>
      ) : (
        <>
          {years.length > 1 && (
            <div className="seg" role="group" aria-label="Season">
              {years.map((y) => (
                <button
                  key={y}
                  className={`seg-btn${year === y ? ' active' : ''}`}
                  aria-pressed={year === y}
                  onClick={() => setYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          <p className="standings-source">
            {season.nights.length === 0
              ? `No finished league nights in ${season.year} on this phone.`
              : // Short enough for one line on a 360px phone; the long form
                // ("…scored on this phone in 2026.") left the year alone on
                // a second line. The footer says why it is only this phone.
                `${season.nights.length} league ${season.nights.length === 1 ? 'night' : 'nights'} in ${season.year}, from this phone.`}
            {season.unfinished > 0 &&
              ` ${season.unfinished} more ${season.unfinished === 1 ? 'is' : 'are'} still being played and not counted yet.`}
          </p>

          {season.teams.length > 0 && (
            <section className="board">
              <div className="board-head">
                <h2 className="board-title">
                  <TrophyIcon size={16} /> Teams
                </h2>
                <span className="board-status">{season.year}</span>
              </div>
              <ol className="board-list">
                {season.teams.map((t, i) => (
                  <li
                    key={t.key}
                    className={`board-row standings-row${teamRanks[i] === 1 && t.points > 0 ? ' leader' : ''}`}
                  >
                    <span className="board-rank">{teamRanks[i]}</span>
                    <span className="standings-who">
                      <span className="board-name">
                        <span className="board-name-text">{t.name}</span>
                      </span>
                      <span className="standings-sub">
                        {record(t.won, t.lost, t.halved)}
                        {/* The players, where the name does not already say. */}
                        {t.players.length === 2 && t.name !== t.players.join(' & ')
                          ? ` · ${t.players.join(' & ')}`
                          : ''}
                      </span>
                    </span>
                    <span className="board-detail">
                      {pts(t.points)}{' '}
                      <span className="standings-unit">{t.points === 1 ? 'pt' : 'pts'}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="board-foot">Won–lost–halved, night by night.</div>
            </section>
          )}

          {season.players.length > 0 && (
            <section className="board">
              <div className="board-head">
                <h2 className="board-title">Players</h2>
                <span className="board-status">A &amp; B matches</span>
              </div>
              <ol className="board-list">
                {season.players.map((p, i) => (
                  <li key={p.name} className="board-row standings-row">
                    <span className="board-rank">{playerRanks[i]}</span>
                    <span className="standings-who">
                      <span className="board-name">
                        <span className="board-name-text">{p.name}</span>
                      </span>
                      <span className="standings-sub">
                        {[
                          p.team,
                          p.avgOverPar != null ? `avg ${overPar(p.avgOverPar)}` : null,
                          p.playsTo != null ? `plays to ${p.playsTo}` : null,
                        ]
                          .filter(Boolean)
                          // Whole parts, so a wrap never leaves "to 8" alone.
                          .map((part) => part!.replace(/ /g, '\u00a0'))
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="board-detail">{record(p.won, p.lost, p.halved)}</span>
                  </li>
                ))}
              </ol>
              <div className="board-foot">
                “Plays to” is from their last five league nights on this phone — a hint. The
                league director’s number is the official one.
              </div>
            </section>
          )}

          {season.nights.length > 0 && (
            <section className="board">
              <div className="board-head">
                <h2 className="board-title">Nights</h2>
              </div>
              <ul className="standings-nights">
                {season.nights.map((n) => (
                  <li key={n.round.id}>
                    <button className="standings-night" onClick={() => onViewResults(n.round)}>
                      <span className="standings-night-when">
                        {formatRoundDate(n.round.date)}
                        {n.round.course ? ` · ${n.round.course}` : ''}
                        {n.called && <span className="tag">Called</span>}
                        {n.provisional && <span className="tag live">Provisional</span>}
                      </span>
                      <span className="standings-night-score">
                        <span className={n.winner === 0 ? 'won' : undefined}>{n.teams[0].name}</span>{' '}
                        <span className="standings-night-pts">
                          {pts(n.teams[0].points)}–{pts(n.teams[1].points)}
                        </span>{' '}
                        <span className={n.winner === 1 ? 'won' : undefined}>{n.teams[1].name}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="standings-source">
            Each foursome scores on its own phone, so this table only knows the nights scored here
            or shared to this phone. The league director’s sheet is the official standings.
          </p>
        </>
      )}
    </div>
  );
}
