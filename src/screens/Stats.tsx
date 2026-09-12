import { useMemo, useState } from 'react';
import { listRounds } from '../storage';
import { computeStats, countsForStats, formatToPar, type PlayerStats } from '../stats';
import { searchRounds, roundYears, filterByYear, describeNoMatches } from '../history';
import { formatMoney } from '../games/settlement';
import { formatRoundDate } from '../roundDate';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { playerColor } from '../player';
import { ChartIcon, XIcon } from '../icons';

interface Props {
  onBack: () => void;
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** The scoring-mix chips. Zero counts are dropped rather than shown as "0". */
function Tally({ tally }: { tally: PlayerStats['tally'] }) {
  const chips: [string, number][] = [
    ['Eagles', tally.eagles],
    ['Birdies', tally.birdies],
    ['Pars', tally.pars],
    ['Bogeys', tally.bogeys],
    ['Worse', tally.others],
  ];
  const shown = chips.filter(([, n]) => n > 0);
  if (shown.length === 0) return null;
  return (
    <ul className="stat-tally">
      {shown.map(([label, n]) => (
        <li key={label}>
          <span className="stat-tally-n">{n}</span>
          <span className="stat-tally-l">{label}</span>
        </li>
      ))}
    </ul>
  );
}

function PlayerCard({ p, color }: { p: PlayerStats; color: string }) {
  // Net is only worth a second line when handicaps actually moved the number —
  // in a gross round the two are identical and printing both reads as a bug.
  const showNet = p.netAvgToPar != null && p.avgToPar != null && Math.abs(p.netAvgToPar - p.avgToPar) >= 0.05;

  return (
    <section className="stat-card">
      <div className="stat-card-head">
        <PlayerAvatar name={p.name} color={color} size={32} />
        <span className="stat-name">{p.name}</span>
        <span className="stat-rounds">{plural(p.rounds, 'round')}</span>
      </div>

      <div className="stat-figures">
        <div className="stat-figure">
          <span className="stat-big">{p.avgToPar == null ? '—' : formatToPar(p.avgToPar, 1)}</span>
          <span className="stat-cap">Avg vs par{showNet ? ' · gross' : ''}</span>
        </div>
        {showNet && (
          <div className="stat-figure">
            <span className="stat-big">{formatToPar(p.netAvgToPar as number, 1)}</span>
            <span className="stat-cap">Avg vs par · net</span>
          </div>
        )}
        {p.moneyRounds > 0 && (
          <div className="stat-figure">
            <span className={`stat-big${p.money > 0 ? ' up' : p.money < 0 ? ' down' : ''}`}>
              {formatMoney(p.money)}
            </span>
            <span className="stat-cap">Over {plural(p.moneyRounds, 'round')}</span>
          </div>
        )}
        {p.skins > 0 && (
          <div className="stat-figure">
            <span className="stat-big">{p.skins}</span>
            <span className="stat-cap">{p.skins === 1 ? 'Skin' : 'Skins'}</span>
          </div>
        )}
      </div>

      <Tally tally={p.tally} />

      {p.best && (
        <div className="stat-best">
          Best: <strong>{formatToPar(p.best.toPar)}</strong>
          {p.best.holes !== 18 ? ` over ${p.best.holes}` : ''}
          {p.best.course ? ` at ${p.best.course}` : ''} · {formatRoundDate(p.best.date)}
        </div>
      )}

      {/* The average is per 18 holes however the rounds were actually played,
          so say so wherever a nine is in the mix — otherwise a league player's
          number looks twice as bad as their card. */}
      <div className="stat-foot">
        {plural(p.holes, 'hole')} scored · average shown per 18
      </div>
    </section>
  );
}

export function Stats({ onBack }: Props) {
  // Read storage once per mount. Nothing on this screen writes a round, so
  // there is nothing to invalidate while it is open.
  //
  // Narrowed to the rounds that count for stats before anything is filtered,
  // even though `computeStats` applies the same test itself: the search and
  // the year have to work over the same population the numbers come from, or
  // "4 of 31 rounds" counts rounds that contributed nothing to a single figure
  // on screen.
  const counted = useMemo(() => listRounds().filter(countsForStats), []);
  const [query, setQuery] = useState('');
  const [year, setYear] = useState<number | 'all'>('all');

  // Years from the counted rounds rather than from everything on the device,
  // so no segment on this row can be tapped into an empty screen.
  const years = useMemo(() => roundYears(counted), [counted]);
  const shown = useMemo(
    () => filterByYear(searchRounds(counted, query), year),
    [counted, query, year]
  );
  const stats = useMemo(() => computeStats(shown), [shown]);
  const narrowed = shown.length !== counted.length;

  return (
    <div className="screen stats">
      <header className="bar">
        <button className="btn-ghost icon back" onClick={onBack} aria-label="Back to rounds">
          ‹
        </button>
        <h1 tabIndex={-1}>Stats</h1>
        {/* Balances the back button so the title stays optically centered. */}
        <span className="bar-spacer" aria-hidden="true" />
      </header>

      {counted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <ChartIcon size={40} />
          </div>
          <p className="empty-title">No finished rounds yet</p>
          <p className="empty-sub">
            Play a round through to the last hole and your history starts here — scoring
            average, best round, and who is up on the money.
          </p>
        </div>
      ) : (
        <>
          {/* One round has nothing to be separated from, so the tools only
              appear once there is a set to narrow. Round history uses the same
              search markup and the same styles; the class names say history
              because that is where they were written, not because the chrome
              is specific to it. */}
          {counted.length > 1 && (
            <div className="history-tools">
              <div className="history-search">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search course, player or game"
                  aria-label="Search rounds"
                />
                {query && (
                  <button
                    className="history-clear"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>

              {/* A lone year is not a choice. */}
              {years.length > 1 && (
                <div className="seg stat-years" role="group" aria-label="Filter by year">
                  <button
                    className={`seg-btn${year === 'all' ? ' active' : ''}`}
                    aria-pressed={year === 'all'}
                    onClick={() => setYear('all')}
                  >
                    All
                  </button>
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
            </div>
          )}

          {shown.length === 0 ? (
            <p className="history-empty">{describeNoMatches(query, year)}</p>
          ) : (
            <>
              {/* Only while something is filtered out: unfiltered, the summary
                  tile below already says how many rounds these numbers came
                  from, and saying it twice reads as two different counts. */}
              {narrowed && (
                <p className="history-count" role="status">
                  {shown.length} of {counted.length} rounds
                </p>
              )}

              <div className="stat-summary">
                <div className="stat-sum">
                  <span className="stat-sum-n">{stats.rounds}</span>
                  <span className="stat-sum-l">{stats.rounds === 1 ? 'Round' : 'Rounds'}</span>
                </div>
                <div className="stat-sum">
                  <span className="stat-sum-n">{stats.holes}</span>
                  <span className="stat-sum-l">Holes</span>
                </div>
                {stats.moneyMoved > 0 && (
                  <div className="stat-sum">
                    <span className="stat-sum-n">{formatMoney(stats.moneyMoved)}</span>
                    <span className="stat-sum-l">Changed hands</span>
                  </div>
                )}
              </div>

              {stats.players.map((p, i) => (
                <PlayerCard key={p.key} p={p} color={playerColor(i)} />
              ))}

              <p className="hint">
                {narrowed
                  ? 'Counted from the rounds shown above. Players are matched by name.'
                  : 'Counted from finished rounds on this device. Players are matched by name.'}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
