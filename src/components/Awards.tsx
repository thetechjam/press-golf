import type { Round } from '../types';
import { computeAwards } from '../games/awards';
import { colorMap } from '../player';
import { StarIcon } from '../icons';
import { PlayerAvatar } from './PlayerAvatar';

interface Props {
  round: Round;
}

/** The round's superlatives. Renders nothing when the round earned none. */
export function Awards({ round }: Props) {
  const awards = computeAwards(round);
  if (awards.length === 0) return null;

  const colors = colorMap(round);
  const nameOf = (id: string) => round.players.find((p) => p.id === id)?.name ?? '';

  return (
    <section className="board awards">
      <div className="board-head">
        <span className="board-title">
          <StarIcon size={16} /> Awards
        </span>
      </div>

      <ul className="board-list award-list">
        {awards.map((a) => (
          <li key={a.id} className="award-row">
            <span className="award-avatars">
              {a.playerIds.map((id) => (
                <PlayerAvatar key={id} name={nameOf(id)} color={colors[id]} size={26} />
              ))}
            </span>
            <span className="award-text">
              <span className="award-head">
                <span className="award-title">{a.title}</span>
                <span className="award-detail">{a.detail}</span>
              </span>
              <span className="award-line">{a.line}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
