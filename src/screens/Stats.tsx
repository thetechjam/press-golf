import { useMemo } from 'react';
import { listRounds } from '../storage';
import { computeStats, formatToPar, type PlayerStats } from '../stats';
import { formatMoney } from '../games/settlement';
import { formatRoundDate } from '../roundDate';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { playerColor } from '../player';
import { ChartIcon } from '../icons';

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
  const stats = useMemo(() => computeStats(listRounds()), []);

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

      {stats.players.length === 0 ? (
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
            Counted from finished rounds on this device. Players are matched by name.
          </p>
        </>
      )}
    </div>
  );
}
