import { GAMES } from '../games';
import { GAME_RULES } from '../games/rules';

/**
 * The walkthrough, for anyone who would rather be shown than read.
 *
 * Exported so a test can pin it: a help link that 404s is worse than no help
 * link, and this is the one string here that nothing else in the app would
 * catch if it rotted.
 */
export const TUTORIAL_URL = 'https://youtu.be/YDgTmnR_1eo';

interface Props {
  onBack: () => void;
}

export function HelpSheet({ onBack }: Props) {
  return (
    <div className="help-sheet">
      <button className="btn-ghost fb-back" onClick={onBack}>
        ‹ Settings
      </button>

      {/* Above the text rather than below it: somebody who opens How to Play
          and would rather watch than read should not have to scroll past the
          reading to find that out. It leaves the app, so it is an <a> — and
          unlike the tip jar there is nothing to gate, a tutorial link is not
          a purchase route. */}
      <a
        className="help-watch"
        href={TUTORIAL_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="help-watch-play" aria-hidden="true">▶</span>
        <span>
          <strong>Watch the walkthrough</strong>
          <small>Under six minutes · YouTube</small>
        </span>
      </a>

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
          A separate mode for a weekly league night: two teams of two. The low
          handicaps play each other in the A match, the others in the B match,
          and each team plays a better-ball team match — a point for each, three
          a night. Strokes come off the lowest handicap of the four, at most one
          a hole and nine a match. A 9 is the most any hole can take; a player
          who picks up takes an X (behind "…") and loses the hole in their
          match, while their partner's ball still counts for the team.
        </p>
      </section>
    </div>
  );
}
