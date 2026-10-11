import { useState } from 'react';
import type { GameOptions, GameType, Player } from '../../types';
import { GAMES, gameMeta } from '../../games';
import { GAME_RULES } from '../../games/rules';
import { canScoreNet } from '../../games/scoring';
import { MATCH_ALLOWANCE } from '../../games/handicap';
import { TeamPicker, type Assign } from '../../components/TeamPicker';

/** How one side-based game's teams are being picked: 1v1 sides or 2v2 assignments. */
export interface SidePick {
  mode: '1v1' | '2v2';
  sideA: string;
  sideB: string;
  assign: Assign;
}

interface Props {
  games: GameType[];
  onToggleGame: (game: GameType) => void;
  namedPlayers: Player[];
  canTeams: boolean;
  /** Whether the gross/net and allowance rows are shown at all. */
  showScoring: boolean;
  allowanceGames: GameType[];
  netByGame: Partial<Record<GameType, boolean>>;
  onNetByGame: (game: GameType, net: boolean) => void;
  allowanceByGame: Partial<Record<GameType, number>>;
  onAllowance: (game: GameType, pct: number) => void;
  match: SidePick;
  onMatch: (patch: Partial<SidePick>) => void;
  nassau: SidePick;
  onNassau: (patch: Partial<SidePick>) => void;
  // Vegas is 2v2 only — there is no side to choose, just who is with whom.
  vegasAssign: Assign;
  onVegasAssign: (id: string, v: 'A' | 'B' | '-') => void;
  options: GameOptions;
  onOptions: (next: GameOptions) => void;
}

/** The body of New Round's Games row: the picks, the scoring, the teams, the options. */
export function GamesSection({
  games,
  onToggleGame,
  namedPlayers,
  canTeams,
  showScoring,
  allowanceGames,
  netByGame,
  onNetByGame,
  allowanceByGame,
  onAllowance,
  match,
  onMatch,
  nassau,
  onNassau,
  vegasAssign,
  onVegasAssign,
  options,
  onOptions,
}: Props) {
  const [expandedGame, setExpandedGame] = useState<GameType | null>(null);
  const showStableford = games.includes('stableford');
  const showWolf = games.includes('wolf');
  const showNassau = games.includes('nassau');
  const showMatchPlay = games.includes('matchPlay');
  const showVegas = games.includes('vegas');

  return (
    <>
      <section className="card">
        <div className="game-list">
          {GAMES.map((g) => (
            <div
              key={g.id}
              className={`game-card${games.includes(g.id) ? ' active' : ''}${expandedGame === g.id ? ' expanded' : ''}`}
            >
              {/* Two buttons side by side, not one inside the other: the
                  card used to be a role="button" wrapping the real ⓘ
                  button, a control nested in a control, which assistive
                  tech exposes unreliably. The card itself is now only a
                  box; the pick and the rules are each a button. */}
              <div className="game-card-row">
                <button
                  type="button"
                  className="game-card-btn"
                  aria-pressed={games.includes(g.id)}
                  onClick={() => onToggleGame(g.id)}
                >
                  <span className="game-check" aria-hidden="true">
                    {games.includes(g.id) ? '✓' : ''}
                  </span>
                  <span className="game-text">
                    <strong>{g.label}</strong>
                  </span>
                </button>
                <button
                  type="button"
                  className="game-info-btn"
                  aria-label={`${g.label} rules`}
                  aria-expanded={expandedGame === g.id}
                  onClick={() => setExpandedGame((cur) => (cur === g.id ? null : g.id))}
                >
                  ⓘ
                </button>
              </div>
              {/* The blurb lives behind the ⓘ with the rules: nine cards
                  each carrying a sentence made this row the longest part
                  of setup, and the name is what a regular picks by. */}
              {expandedGame === g.id && (
                <p className="game-info-text">
                  <strong>{g.blurb}</strong> {GAME_RULES[g.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {showScoring && (
        <section className="card">
          <h2>Scoring</h2>
          <p className="hint-inline">
            Handicaps apply at full allowance by default. Match Play and Nassau play off the
            low handicap — the lowest plays scratch and the rest take the difference, 90% of
            it in a four-ball. Set a game to gross to play it off the card, or change an
            allowance the way your group plays — 85% for four-ball stroke play, 95% for
            Stableford.
          </p>
          {allowanceGames.map((g) => {
            const canNet = canScoreNet(g);
            const net = canNet ? (netByGame[g] ?? true) : false;
            // An allowance cuts handicap strokes, so it only means
            // anything where handicap strokes are being used: a game set
            // to gross has none to cut. Quota has no gross/net choice at
            // all and always spends the handicap, so it always asks.
            const showAllowance = canNet ? net : true;
            // What the match is played off when nothing is chosen: the
            // handbook's 90% for a four-ball, 100% otherwise — the same
            // fallback `matchAllowanceFor` uses, so the row tells the truth.
            const fourBall =
              (g === 'matchPlay' && match.mode === '2v2') ||
              (g === 'nassau' && nassau.mode === '2v2');
            const fallback =
              g === 'matchPlay' || g === 'nassau'
                ? fourBall
                  ? MATCH_ALLOWANCE.fourBall
                  : MATCH_ALLOWANCE.singles
                : 100;
            return (
              <div key={g} className="score-mode-row">
                <span className="score-mode-name">{gameMeta(g).label}</span>
                {canNet && (
                  <div className="seg small">
                    {([false, true] as const).map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        className={`seg-btn${net === v ? ' active' : ''}`}
                        aria-pressed={net === v}
                        onClick={() => onNetByGame(g, v)}
                      >
                        {v ? 'Net' : 'Gross'}
                      </button>
                    ))}
                  </div>
                )}
                {showAllowance && (
                  <select
                    className="allowance-select"
                    value={allowanceByGame[g] ?? fallback}
                    onChange={(e) => onAllowance(g, Number(e.target.value))}
                    aria-label={`Handicap allowance for ${gameMeta(g).label}`}
                  >
                    {[100, 95, 90, 85, 75, 50].map((pct) => (
                      <option key={pct} value={pct}>
                        {pct}%
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </section>
      )}

      {showMatchPlay && (
        <TeamPicker
          label="Match Play teams"
          players={namedPlayers}
          canTeams={canTeams}
          mode={match.mode}
          onMode={(mode) => onMatch({ mode })}
          sideA={match.sideA}
          sideB={match.sideB}
          onSideA={(sideA) => onMatch({ sideA })}
          onSideB={(sideB) => onMatch({ sideB })}
          assign={match.assign}
          onAssign={(id, v) => onMatch({ assign: { ...match.assign, [id]: v } })}
        />
      )}

      {showVegas && (
        <TeamPicker
          label="Vegas teams"
          players={namedPlayers}
          canTeams={canTeams}
          teamsOnly
          mode="2v2"
          onMode={() => {}}
          sideA=""
          sideB=""
          onSideA={() => {}}
          onSideB={() => {}}
          assign={vegasAssign}
          onAssign={onVegasAssign}
        />
      )}

      {showNassau && (
        <TeamPicker
          label="Nassau teams"
          players={namedPlayers}
          canTeams={canTeams}
          mode={nassau.mode}
          onMode={(mode) => onNassau({ mode })}
          sideA={nassau.sideA}
          sideB={nassau.sideB}
          onSideA={(sideA) => onNassau({ sideA })}
          onSideB={(sideB) => onNassau({ sideB })}
          assign={nassau.assign}
          onAssign={(id, v) => onNassau({ assign: { ...nassau.assign, [id]: v } })}
        />
      )}

      {(showStableford || showWolf || showVegas || showNassau) && (
        <section className="card">
          <h2>Options</h2>
          {showStableford && (
            <label className="field">
              <span>Stableford scoring</span>
              <select
                value={options.stablefordMode}
                onChange={(e) =>
                  onOptions({
                    ...options,
                    stablefordMode: e.target.value as 'standard' | 'modified',
                  })
                }
              >
                <option value="standard">Standard (par = 2 pts)</option>
                <option value="modified">Modified (eagle = 5 pts)</option>
              </select>
            </label>
          )}
          {showNassau && (
            <label className="set-row">
              <span>
                <span className="set-label">Nassau auto-press</span>
                <span className="set-hint">Press automatically when a side goes 2 down</span>
              </span>
              <input
                className="switch"
                type="checkbox"
                checked={options.autoPress === true}
                onChange={(e) => onOptions({ ...options, autoPress: e.target.checked })}
              />
            </label>
          )}
          {showVegas && (
            <label className="set-row">
              <span>
                <span className="set-label">Vegas birdie flip</span>
                <span className="set-hint">A birdie turns the other side's number around</span>
              </span>
              <input
                className="switch"
                type="checkbox"
                checked={options.vegasFlip !== false}
                onChange={(e) => onOptions({ ...options, vegasFlip: e.target.checked })}
              />
            </label>
          )}
          {showWolf && (
            <div className="wolf-opts">
              <label className="field small">
                <span>Lone Wolf ×</span>
                <input
                  type="number"
                  min={1}
                  value={options.loneWolfMultiplier}
                  onChange={(e) =>
                    onOptions({ ...options, loneWolfMultiplier: Number(e.target.value) })
                  }
                />
              </label>
              <label className="field small">
                <span>Blind Wolf ×</span>
                <input
                  type="number"
                  min={1}
                  value={options.blindWolfMultiplier}
                  onChange={(e) =>
                    onOptions({ ...options, blindWolfMultiplier: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          )}
        </section>
      )}
    </>
  );
}
