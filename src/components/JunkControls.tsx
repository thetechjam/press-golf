import { useState } from 'react';
import type { Round, Hole, JunkClaims, JunkKind } from '../types';
import { JUNK, claimsOn, junkMeta, junkOnHole, toggleJunk } from '../games/junk';
import { PlayerAvatar } from './PlayerAvatar';
import { CoinIcon } from '../icons';
import { colorMap } from '../player';

interface Props {
  round: Round;
  hole: Hole;
  onChange: (junk: JunkClaims) => void;
}

/**
 * Claiming junk on the hole it happened on.
 *
 * Two taps for the common case, which is one person claiming one thing: pick
 * the player, tap what they got. It is a player first and the junk second
 * because that is the order it gets said out loud — "Al had a sandie" — and
 * because the alternative, six kinds each opening a list of players, puts the
 * rarely-used half of the decision first.
 *
 * Not a grid of every player against every kind. Four players and six kinds is
 * twenty-four targets, and at the 44px they would each need that is most of a
 * phone screen — on the one screen in this app with no vertical space to
 * spare.
 *
 * No state of its own that outlives the hole: `.hole-body` is keyed by hole
 * number, so moving to the next one remounts this and the picked player goes
 * with it. That is the right behaviour and it is worth knowing it comes from
 * there rather than from anything written here.
 */
export function JunkControls({ round, hole, onChange }: Props) {
  const claimed = junkOnHole(round, hole.number);
  const [open, setOpen] = useState(false);
  // Somebody is always picked, so the panel is its full size the moment it
  // opens. Picking on the first tap instead grew it under the thumb that was
  // about to make the second one — on the screen with the least room to move.
  // A hole that already has claims starts on the first person holding one,
  // which is nearly always the person about to be corrected.
  const [who, setWho] = useState<string>(claimed[0]?.playerId ?? round.players[0]?.id ?? '');
  const colors = colorMap(round);

  if (round.players.length < 2) return null;

  const summary = claimed
    .map((row) => `${row.name}: ${row.kinds.map((k) => junkMeta(k).label).join(', ')}`)
    .join(' · ');

  if (!open) {
    return (
      <button className="junk collapsed" onClick={() => setOpen(true)} aria-expanded={false}>
        <CoinIcon size={14} />
        <span className="collapsed-text">{summary || 'No junk on this hole'}</span>
        <span className="collapsed-hint">{claimed.length ? 'Change' : 'Claim'}</span>
      </button>
    );
  }

  const picked = round.players.find((p) => p.id === who) ?? round.players[0];
  const held = claimsOn(round, hole.number, picked.id);

  return (
    <div className="junk">
      {/* The picked name rides in the heading rather than above the six. It
          costs no height, and a tap on one of them credits money to somebody
          — the row should say who before it is tapped, not after. */}
      <div className="junk-head">
        <CoinIcon size={16} /> Junk on {hole.number} · <strong>{picked.name}</strong>
        <button className="junk-done" onClick={() => setOpen(false)}>
          Done
        </button>
      </div>

      <div className="junk-players" role="group" aria-label="Who claimed it">
        {round.players.map((p) => {
          const count = claimsOn(round, hole.number, p.id).length;
          return (
            <button
              key={p.id}
              className={`junk-chip${who === p.id ? ' active' : ''}`}
              aria-pressed={who === p.id}
              onClick={() => setWho(p.id)}
            >
              <PlayerAvatar name={p.name} color={colors[p.id]} size={20} />
              {p.name}
              {count > 0 && <span className="junk-count">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="junk-kinds" role="group" aria-label={`What ${picked.name} claimed`}>
        {JUNK.map((j) => {
          const on = held.includes(j.id as JunkKind);
          return (
            <button
              key={j.id}
              className={`junk-kind${on ? ' active' : ''}`}
              aria-pressed={on}
              title={j.blurb}
              onClick={() => onChange(toggleJunk(round, hole.number, picked.id, j.id))}
            >
              {j.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
