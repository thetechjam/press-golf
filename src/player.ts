import type { Round } from './types';

// Distinct badge hues, assigned by player order so colors never collide within a
// round. All are dark enough for white text in both light and dark themes.
const PALETTE = [
  '#1a7d5e', // fairway green (brand)
  '#2f6db0', // blue
  '#c2571f', // orange
  '#7c4dbd', // purple
  '#b83280', // magenta
  '#0f8a8a', // teal
  '#9a7209', // gold-brown
  '#4d7c1f', // olive
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
