import { GAMES } from '../games';
import { GAME_RULES } from '../games/rules';

interface Props {
  onBack: () => void;
}

export function HelpSheet({ onBack }: Props) {
  return (
    <div className="help-sheet">
      <button className="btn-ghost fb-back" onClick={onBack}>
        ‹ Settings
      </button>

      <section className="help-section">
        <h3>The basics</h3>
        <p>
          Start a round, add players, and pick which games to track — you can run
          several at once. Enter scores hole by hole and every game's standings
          update live.
        </p>
        <p>
          Turn on <strong>net scoring</strong> to apply player handicaps, so
          games stay fair between different skill levels.
        </p>
      </section>

      <section className="help-section">
        <h3>Games</h3>
        {GAMES.map((g) => (
          <div key={g.id} className="help-game">
            <div className="help-game-label">{g.label}</div>
            <p>{GAME_RULES[g.id] ?? g.blurb}</p>
          </div>
        ))}
      </section>

      <section className="help-section">
        <h3>Golf League</h3>
        <p>
          A separate mode for a recurring weekly league night: two teams, each
          with an A match, a B match, and a team match, all scored off
          handicaps. Points accumulate across the season on the League Setup screen.
        </p>
      </section>
    </div>
  );
}
