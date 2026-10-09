import { describe, it, expect } from 'vitest';
import { lastSetup } from './lastSetup';
import { makeRound, player } from './games/testFixtures';

const two = [player('p1', 'Al'), player('p2', 'Bo')];

describe('lastSetup', () => {
  it('is null with nothing to remember', () => {
    expect(lastSetup([])).toBeNull();
  });

  it('takes the games, stakes and options of the newest regular round', () => {
    const night = makeRound({
      players: two,
      games: [],
      options: { league: { pointsPerMatch: 1, teams: [{ aId: 'p1', bId: 'p2' }, { aId: 'p1', bId: 'p2' }] } },
    });
    const weekly = makeRound({
      players: two,
      games: ['nassau', 'skins'],
      options: {
        stakes: { nassau: 5, skins: 2, wolf: 9 },
        autoPress: true,
        netByGame: { skins: false },
        allowanceByGame: { nassau: 90 },
        nassau: { mode: '2v2', teamA: ['p1'], teamB: ['p2'] },
      },
    });
    const older = makeRound({ players: two, games: ['wolf'], options: { stakes: { wolf: 1 } } });
    const got = lastSetup([night, weekly, older]);
    expect(got).toMatchObject({
      games: ['nassau', 'skins'],
      // Only the games played: the stray Wolf stake is not in play.
      options: { stakes: { nassau: 5, skins: 2 }, autoPress: true },
      netByGame: { skins: false },
      allowanceByGame: { nassau: 90 },
      nassauMode: '2v2',
      matchMode: '1v1',
    });
    expect(got!.options.stakes).not.toHaveProperty('wolf');
  });

  it('leaves an option it did not have unset, so the default still applies', () => {
    const r = makeRound({ players: two, games: ['vegas'] });
    expect(lastSetup([r])!.options).not.toHaveProperty('vegasFlip');
    expect(lastSetup([r])!.options).not.toHaveProperty('autoPress');
  });
});
