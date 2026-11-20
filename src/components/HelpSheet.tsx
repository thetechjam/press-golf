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
          Type a <strong>handicap</strong> beside a player — or a Handicap Index,
          on a course with a slope and rating — and games score net for
          everyone, with each game set to gross or net in the Scoring row. Blank
          handicaps play gross. In Match Play and Nassau the lowest handicap plays
          off scratch and the others take the difference — 90% of it in a
          four-ball — as the Rules of Handicapping recommend.
        </p>
        <p>
          Put a <strong>stake</strong> on a game in the Money row and Trunk keeps
          a running total through the round, then settles the group up in the
          fewest payments. Stakes and handicaps can be changed mid-round.
        </p>
        <p>
          A round can be <strong>sent by link or QR code</strong>: the whole card
          travels inside the link and never touches a server. The link is
          compressed, not encrypted — anyone who has it can read the names,
          scores and stakes inside, so share it as you would the scorecard.
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
        <h3>Trips</h3>
        <p>
          Playing several rounds over a long weekend? Put them on a trip and
          settle the money once at the end, instead of after every round. In
          New Round, open the <strong>Trip</strong> row and choose{' '}
          <strong>+ New trip</strong> to name it. While the trip is going, the
          next round you start is already on it.
        </p>
        <p>
          Each round still shows its own settlement. The trip screen — from the
          trip card on Home, or the link under a round's results — adds every
          round up by player and works out the fewest payments for the whole
          trip, with a button to send them to the group. Rounds can be put on a
          trip or taken off it later, and league nights stay out of trips.
        </p>
        <p>
          Players are matched by name from round to round. If somebody was typed
          two ways — Al and Alex — Trunk asks whether they are the same person
          before adding their money together.
        </p>
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
          match, while their partner's ball still counts for the team. A team
          one player short still plays: the missing player's match is
          forfeited, and the partner plays their own match and the team point.
          Called for darkness or weather after five holes, the Board ends every
          match as it stands — and can resume it on another day. Handicaps
          follow the league system: 90% of the average over par of the last
          five matches, 70% until a player has three.
        </p>
      </section>

      <section className="help-section">
        <h3>Scramble</h3>
        <p>
          A separate mode from Home for a scramble: teams of two to four, each
          playing one ball and posting one score. Every player hits, the team
          picks the best shot, and everyone plays from there. Trunk keeps each
          team's score as stroke play — low team wins, and with a stake it
          takes that much from each of the others.
        </p>
        <p>
          Under each team's score, tap whose ball was played: the tee shot
          first, and the rest of the hole under <strong>All shots</strong>.
          Tap a name again to clear it. If the event says every player's drive
          has to be used a set number of times, set the{' '}
          <strong>tee shot minimum</strong> in Format; the Board keeps count of
          who is still owed one and says when the holes left can no longer
          cover it. Par 3s count. A shotgun start is the Starting hole in the
          same row.
        </p>
      </section>

      <section className="help-section">
        <h3>Course data</h3>
        <p>
          Course search is powered by OpenGolfAPI. Course data ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>{' '}
          contributors (ODbL 1.0) via OpenGolfAPI. Check a card before you play
          off it — open data is sometimes a par out — and save the checked one.
        </p>
      </section>
    </div>
  );
}
