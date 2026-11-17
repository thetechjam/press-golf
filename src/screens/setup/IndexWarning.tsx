/**
 * A Handicap Index is on the card and the course cannot turn it into strokes.
 *
 * Course search clears slope and rating — it does not carry them — and a
 * player recalled from an earlier round still has their Index. Without both
 * figures the round scores gross and nothing on screen used to say so.
 */
export function IndexWarning() {
  return (
    <p className="check-note" role="status">
      <strong>Handicaps won’t apply</strong> until slope and rating are entered. A player has a
      Handicap Index, and without both figures it isn’t used.
    </p>
  );
}
