import type { Round } from './types';
import { nameKey } from './people';

// Distinct badge hues, assigned by player order so colors never collide within a
// round. Every entry carries white monogram text, so every entry must clear
// 4.5:1 against #fff — orange, teal and gold-brown originally sat at 4.49,
// 4.18 and 4.39 despite the comment here claiming otherwise, and were darkened
// to 5.0+. Measured ratios are noted so the next hue added has a bar to meet.
const PALETTE = [
  '#1a7d5e', // fairway green (brand) — 5.07:1
  '#2f6db0', // blue — 5.34:1
  '#b8501b', // orange — 5.00:1
  '#7c4dbd', // purple — 5.75:1
  '#b83280', // magenta — 5.52:1
  '#0d7272', // teal — 5.73:1
  '#856208', // gold-brown — 5.60:1
  '#4d7c1f', // olive — 4.98:1
];

/** Stable color for a player, keyed by their position in round.players. */
export function playerColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

/** 1–2 letter monogram from a name: "Jesse" → "JE", "Jesse Morrison" → "JM". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** playerId → badge color, for surfaces that only carry ids (leaderboards, settlement). */
export function colorMap(round: Round): Record<string, string> {
  const map: Record<string, string> = {};
  round.players.forEach((p, i) => {
    map[p.id] = playerColor(i);
  });
  return map;
}

/**
 * A person's badge color across rounds: the seat they had in the most recent
 * round they played, so the badge on Stats or a trip matches the one on the
 * card the group last looked at. `rounds` must be newest first; `fallback` is
 * used for someone in none of them.
 */
export function seatColor(rounds: Round[], name: string, fallback: number): string {
  const key = nameKey(name);
  for (const r of rounds) {
    const at = r.players.findIndex((p) => nameKey(p.name) === key);
    if (at >= 0) return playerColor(at);
  }
  return playerColor(fallback);
}
