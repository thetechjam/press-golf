import type { GameOptions, GameType, Round } from './types';

/**
 * The games, stakes and options of the most recent regular round, for New
 * Round to start from.
 *
 * A weekly group plays the same $5 Nassau with auto-press and $2 skins every
 * week, and was re-picking the games, retyping both stakes and turning
 * auto-press back on every time — with the Money row collapsed by default,
 * so a forgotten stake was a round played for nothing. The players were
 * already remembered; this remembers the rest.
 *
 * Teams are not carried: they name player ids, and the next round's players
 * have new ones. The 1v1/2v2 modes are. League nights are skipped — they
 * settle on points and have a setup of their own.
 */
export interface LastSetup {
  games: GameType[];
  options: Pick<
    GameOptions,
    'stakes' | 'stablefordMode' | 'loneWolfMultiplier' | 'blindWolfMultiplier' | 'autoPress' | 'vegasFlip'
  >;
  netByGame: NonNullable<GameOptions['netByGame']>;
  allowanceByGame: NonNullable<GameOptions['allowanceByGame']>;
  nassauMode: '1v1' | '2v2';
  matchMode: '1v1' | '2v2';
}

/** Rounds are newest first, as `listRounds()` returns them. */
export function lastSetup(rounds: Round[]): LastSetup | null {
  const last = rounds.find((r) => !r.options.league && r.games.length > 0);
  if (!last) return null;
  const o = last.options;
  const stakes: GameOptions['stakes'] = {};
  for (const g of last.games) {
    const v = o.stakes?.[g];
    if (typeof v === 'number' && v > 0) stakes[g] = v;
  }
  return {
    games: [...last.games],
    options: {
      stakes,
      stablefordMode: o.stablefordMode,
      loneWolfMultiplier: o.loneWolfMultiplier,
      blindWolfMultiplier: o.blindWolfMultiplier,
      ...(o.autoPress === undefined ? {} : { autoPress: o.autoPress }),
      ...(o.vegasFlip === undefined ? {} : { vegasFlip: o.vegasFlip }),
    },
    netByGame: { ...(o.netByGame ?? {}) },
    allowanceByGame: { ...(o.allowanceByGame ?? {}) },
    nassauMode: o.nassau?.mode ?? '1v1',
    matchMode: o.matchPlay?.mode ?? '1v1',
  };
}
