import { useState } from 'react';
import {
  LEAGUE_FULL_ALLOWANCE_AFTER,
  leagueAllowance,
  leagueHandicap,
  type LeagueHistory,
} from '../games/leagueHandicap';

const signed = (n: number) => `${n > 0 ? '+' : ''}${Number.isInteger(n) ? n : n.toFixed(1)}`;
const pct = (matches: number) => `${Math.round(leagueAllowance(matches) * 100)}%`;

interface Props {
  /** Who this is for, for the controls' accessible names. */
  who: string;
  /** This player's league nights on this phone, if any. */
  history: LeagueHistory | null;
  onUse: (handicap: number) => void;
  /** Offer the calculator. Off once a handicap is typed, to keep rows quiet. */
  offerCalculator?: boolean;
}

/**
 * The league handicap, worked out the league's way, under a player's row.
 *
 * Two parts. A hint, when this phone has seen the player's league nights:
 * what their last five play to — shown, never filled in, because the league
 * director's spreadsheet is the official number. And a calculator for a sub
 * or a new player: their over-par average and how many league matches they
 * have played, with the 70% / 90% allowance the rule sheet sets. For a
 * first-timer with no league score yet, the average is an estimate (or the
 * director's call).
 */
export function LeagueHcpHelper({ who, history, onUse, offerCalculator = true }: Props) {
  const [open, setOpen] = useState(false);
  const [avg, setAvg] = useState<number | undefined>();
  const [matches, setMatches] = useState(0);
  const result = avg == null || Number.isNaN(avg) ? null : leagueHandicap(avg, matches);

  return (
    <div className="hcp-help">
      {history && (
        <p className="hcp-hint">
          Last {history.recent.length} league {history.recent.length === 1 ? 'night' : 'nights'}{' '}
          here: {signed(Math.round(history.average * 10) / 10)} avg → plays off{' '}
          <strong>{history.handicap}</strong> ({pct(history.matches)})
        </p>
      )}
      {(offerCalculator || open) && (
      <button
        type="button"
        className="link-btn hcp-help-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Close calculator' : 'Sub or new? Work out handicap'}
      </button>
      )}
      {open && (
        <div className="hcp-calc">
          <label className="field small">
            <span>Avg over par</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={avg ?? ''}
              onChange={(e) => setAvg(e.target.value === '' ? undefined : Number(e.target.value))}
              placeholder="6.0"
              aria-label={`Average over par for ${who}`}
            />
          </label>
          <div className="hcp-calc-matches" role="group" aria-label={`League matches ${who} has played`}>
            <span className="hcp-calc-cap">League matches played</span>
            <div className="seg">
              {[0, 1, 2, LEAGUE_FULL_ALLOWANCE_AFTER].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`seg-btn${matches === n ? ' active' : ''}`}
                  aria-pressed={matches === n}
                  onClick={() => setMatches(n)}
                >
                  {n === LEAGUE_FULL_ALLOWANCE_AFTER ? `${n}+` : n}
                </button>
              ))}
            </div>
          </div>
          <p className="hint-inline">
            {matches < LEAGUE_FULL_ALLOWANCE_AFTER
              ? `70% until they complete ${LEAGUE_FULL_ALLOWANCE_AFTER} matches${
                  matches === 0 ? ' — for a first night, use an estimate or the director’s number' : ''
                }.`
              : '90% of their last five matches.'}
          </p>
          {result != null && (
            <button type="button" className="btn-secondary hcp-use" onClick={() => onUse(result)}>
              Use {result} ({pct(matches)} of {signed(avg!)})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
