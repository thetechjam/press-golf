import { describe, it, expect } from 'vitest';
import type { Round } from '../types';
import {
  MAX_TEAMS,
  MIN_MEMBERS,
  MAX_MEMBERS,
  isScramble,
  teamOf,
  defaultTeamName,
  memberShort,
  shotsOnHole,
  shotRows,
  shotLabel,
  creditShot,
  teamShotStats,
  driveStatus,
  uncreditedDrives,
  scrambleSummaryLines,
} from './scramble';
import { makeRound, holes, scrambleRound, scoresFrom } from './testFixtures';
import { activeResults } from '.';
import { computeAwards } from './awards';

/** Credits several shots in turn, as taps on the hole would. */
const credit = (round: Round, taps: [number, string, number, number][]): Round =>
  taps.reduce((r, [hole, team, shot, member]) => creditShot(r, hole, team, shot, member), round);

describe('the limits', () => {
  it('are the ones the spec sets', () => {
    expect([MAX_TEAMS, MIN_MEMBERS, MAX_MEMBERS]).toEqual([4, 2, 4]);
  });
});

describe('telling a scramble apart', () => {
  it('is the setup on options, not anything in games', () => {
    expect(isScramble(scrambleRound())).toBe(true);
    expect(isScramble(makeRound({ games: ['strokePlay'] }))).toBe(false);
  });

  it('finds a team by its player id', () => {
    const r = scrambleRound();
    expect(teamOf(r, 't1')?.members).toEqual(['Jesse', 'Sam', 'Al']);
    expect(teamOf(r, 'nope')).toBeUndefined();
    expect(teamOf(makeRound(), 'p1')).toBeUndefined();
  });

  it('reads a setup of the wrong shape as no team rather than crashing', () => {
    const r = scrambleRound();
    r.options.scramble = { teams: 'oops' } as unknown as Round['options']['scramble'];
    expect(teamOf(r, 't1')).toBeUndefined();
    expect(scrambleSummaryLines(r)).toEqual([]);
  });
});

describe('names', () => {
  it('names a team of two after both', () => {
    expect(defaultTeamName(['Jesse', 'Sam'], 0)).toBe('Jesse & Sam');
  });

  it('names a bigger team after the first two and a count', () => {
    expect(defaultTeamName(['Jesse', 'Sam', 'Al'], 0)).toBe('Jesse, Sam +1');
    expect(defaultTeamName(['Jesse', 'Sam', 'Al', 'Cy'], 0)).toBe('Jesse, Sam +2');
  });

  it('uses first names and skips blanks', () => {
    expect(defaultTeamName(['Jesse Smith', '  ', 'Sam Ortega'], 0)).toBe('Jesse & Sam');
    expect(defaultTeamName(['Jesse'], 0)).toBe('Jesse');
  });

  it('counts teams from 1 when nobody is named', () => {
    expect(defaultTeamName([], 1)).toBe('Team 2');
    expect(defaultTeamName(['', ' '], 0)).toBe('Team 1');
  });

  it('shortens a member to a first name, or a position for a blank', () => {
    const team = { id: 't', members: ['Jesse Smith', '', '  Al  '] };
    expect(memberShort(team, 0)).toBe('Jesse');
    expect(memberShort(team, 1)).toBe('P2');
    expect(memberShort(team, 2)).toBe('Al');
    expect(memberShort(team, 3)).toBe('P4');
  });
});

describe('shot rows and labels', () => {
  it('offers par rows until a score is posted, then the score', () => {
    expect(shotRows(null, 4)).toBe(4);
    expect(shotRows(6, 4)).toBe(6);
    expect(shotRows(3, 5)).toBe(3);
  });

  it('labels the tee shot, the middle shots and the one that went in', () => {
    expect(shotLabel(0, null)).toBe('Tee shot');
    expect(shotLabel(1, null)).toBe('Shot 2');
    expect(shotLabel(3, null)).toBe('Shot 4');
    expect(shotLabel(3, 4)).toBe('Holed');
    expect(shotLabel(2, 4)).toBe('Shot 3');
  });

  it('keeps the drive a tee shot on an ace', () => {
    expect(shotLabel(0, 1)).toBe('Tee shot');
  });
});

describe('crediting a shot', () => {
  it('credits a member, and a second tap on them clears it', () => {
    const r = scrambleRound();
    const once = creditShot(r, 1, 't1', 0, 1);
    expect(shotsOnHole(once, 1, 't1')).toEqual([1]);
    const twice = creditShot(once, 1, 't1', 0, 1);
    expect(shotsOnHole(twice, 1, 't1')).toEqual([]);
  });

  it('moves a credit to another member on a tap on them', () => {
    const r = credit(scrambleRound(), [
      [1, 't1', 0, 1],
      [1, 't1', 0, 2],
    ]);
    expect(shotsOnHole(r, 1, 't1')).toEqual([2]);
  });

  it('pads the shots before it with "not said"', () => {
    const r = creditShot(scrambleRound(), 1, 't1', 3, 0);
    expect(r.shots).toEqual({ 1: { t1: [-1, -1, -1, 0] } });
  });

  it('trims trailing "not said" when the last shot is cleared', () => {
    const r = credit(scrambleRound(), [
      [1, 't1', 0, 0],
      [1, 't1', 3, 1],
      [1, 't1', 3, 1],
    ]);
    expect(r.shots).toEqual({ 1: { t1: [0] } });
  });

  it('leaves no empty hole or team behind, and no shots at all when nothing is left', () => {
    const base = scrambleRound({
      teams: [
        { name: 'A', members: ['Al', 'Bo'] },
        { name: 'B', members: ['Cy', 'Di'] },
      ],
    });
    const r = credit(base, [
      [1, 't1', 0, 0],
      [1, 't2', 0, 1],
      [1, 't2', 0, 1],
    ]);
    expect(r.shots).toEqual({ 1: { t1: [0] } });
    const cleared = creditShot(r, 1, 't1', 0, 0);
    expect(cleared.shots).toBeUndefined();
    expect('shots' in cleared).toBe(false);
  });

  it('clears with -1 as well as with a second tap', () => {
    const r = creditShot(creditShot(scrambleRound(), 2, 't1', 0, 2), 2, 't1', 0, -1);
    expect(r.shots).toBeUndefined();
  });

  it('never changes the round it was handed', () => {
    const r = creditShot(scrambleRound(), 1, 't1', 0, 0);
    const frozen = JSON.stringify(r);
    const next = credit(r, [
      [1, 't1', 1, 2],
      [1, 't1', 0, 0],
      [4, 't1', 0, 1],
    ]);
    expect(JSON.stringify(r)).toBe(frozen);
    expect(next).not.toBe(r);
    expect(next.shots).toEqual({ 1: { t1: [-1, 2] }, 4: { t1: [1] } });
  });

  it('ignores a shot position that is not one', () => {
    const r = scrambleRound();
    expect(creditShot(r, 1, 't1', -1, 0)).toBe(r);
    expect(creditShot(r, 1, 't1', 1.5, 0)).toBe(r);
  });

  it('reads a credit to a member the team does not have as "not said"', () => {
    const r: Round = { ...scrambleRound(), shots: { 1: { t1: [0, 7, 'x' as unknown as number, 2] } } };
    expect(shotsOnHole(r, 1, 't1')).toEqual([0, -1, -1, 2]);
    expect(shotsOnHole(r, 2, 't1')).toEqual([]);
  });
});

describe('counting a team’s shots', () => {
  const played = (): Round => {
    const hs = holes(4);
    return credit(
      scrambleRound({ holes: hs, scores: scoresFrom(hs, { t1: [4, 3, null, null] }) }),
      [
        [1, 't1', 0, 0],
        [1, 't1', 1, 1],
        [1, 't1', 2, 1],
        [1, 't1', 3, 2],
        [2, 't1', 0, 1],
        [2, 't1', 2, 0],
        [3, 't1', 0, 2],
      ]
    );
  };

  it('counts drives, shots and holed-out per member', () => {
    const s = teamShotStats(played(), 't1');
    expect(s.teamId).toBe('t1');
    expect(s.members).toEqual([
      { name: 'Jesse', drives: 1, shots: 2, holed: 1 },
      { name: 'Sam', drives: 1, shots: 3, holed: 0 },
      { name: 'Al', drives: 1, shots: 2, holed: 1 },
    ]);
  });

  it('credits the holed-out shot to whoever played the last of the score', () => {
    // Hole 2 is a 3 and the third shot is Jesse's: he holed it.
    const r = played();
    expect(teamShotStats(r, 't1').members[0].holed).toBe(1);
    const moved = creditShot(r, 2, 't1', 2, 1);
    expect(teamShotStats(moved, 't1').members.map((m) => m.holed)).toEqual([0, 1, 1]);
  });

  it('counts a hole open only while it has neither a score nor a drive', () => {
    // Hole 3 has a drive and no score; hole 4 has neither.
    expect(teamShotStats(played(), 't1').open).toBe(1);
  });

  it('ignores credits past a posted score — a 5 corrected to a 4 loses the fifth', () => {
    const hs = holes(1);
    const five = credit(scrambleRound({ holes: hs, scores: { 1: { t1: 5 } } }), [
      [1, 't1', 0, 0],
      [1, 't1', 4, 1],
    ]);
    expect(teamShotStats(five, 't1').members[1]).toEqual({ name: 'Sam', drives: 0, shots: 1, holed: 1 });
    const four = { ...five, scores: { 1: { t1: 4 } } };
    expect(teamShotStats(four, 't1').members[1]).toEqual({ name: 'Sam', drives: 0, shots: 0, holed: 0 });
    // Kept on the round, so correcting it back restores the credit.
    expect(shotsOnHole(four, 1, 't1')).toEqual([0, -1, -1, -1, 1]);
  });

  it('counts only the holes being played', () => {
    const hs = holes(2);
    const r = credit(scrambleRound({ holes: hs }), [
      [1, 't1', 0, 0],
      [9, 't1', 0, 0],
    ]);
    expect(teamShotStats(r, 't1').members[0].drives).toBe(1);
  });

  it('names a blank member by position', () => {
    const r = scrambleRound({ teams: [{ members: ['Jesse', ''] }] });
    expect(teamShotStats(r, 't1').members.map((m) => m.name)).toEqual(['Jesse', 'P2']);
  });

  it('has no members for a team the round does not have', () => {
    expect(teamShotStats(scrambleRound({ holes: holes(3) }), 'x')).toEqual({
      teamId: 'x',
      members: [],
      open: 3,
    });
  });
});

describe('the tee-shot minimum', () => {
  /**
   * A card of `n` holes where the first `drives.length` are scored (a 4 each)
   * with the tee shot credited to that member position — -1 for a hole scored
   * without saying — and the rest not yet played.
   */
  const card = (
    n: number,
    min: number | undefined,
    drives: number[],
    members = ['Jesse', 'Sam', 'Al']
  ): Round => {
    const hs = holes(n);
    const scores = scoresFrom(hs, { t1: drives.map(() => 4) });
    const base = scrambleRound({ holes: hs, scores, minDrives: min, teams: [{ members }] });
    return drives.reduce((r, m, i) => (m >= 0 ? creditShot(r, i + 1, 't1', 0, m) : r), base);
  };

  it('says nothing when there is no minimum', () => {
    expect(driveStatus(card(9, undefined, [0, 1]), 't1')).toEqual({
      state: 'none',
      min: 0,
      owed: [],
      owedTotal: 0,
      open: 7,
      note: '',
    });
  });

  it('is met when nobody owes', () => {
    const s = driveStatus(card(9, 2, [0, 1, 2, 0, 1, 2]), 't1');
    expect(s.state).toBe('met');
    expect(s.note).toBe('Everyone has their 2.');
    expect(s.owed).toEqual([]);
    expect(s.owedTotal).toBe(0);
  });

  it('lists who is owed, most first, while there are holes enough', () => {
    // Min 3 on eighteen: Jesse 3, Sam 1, Al 2 after eleven, five of them
    // scored without a drive picked, so seven holes still open.
    const s = driveStatus(card(18, 3, [0, 0, 0, 1, 2, 2, -1, -1, -1, -1, -1]), 't1');
    expect(s.state).toBe('owed');
    expect(s.min).toBe(3);
    expect(s.owed).toEqual([
      { member: 1, name: 'Sam', count: 2 },
      { member: 2, name: 'Al', count: 1 },
    ]);
    expect(s.owedTotal).toBe(3);
    expect(s.open).toBe(7);
    expect(s.note).toBe('Still owed: Sam 2, Al 1. 7 holes left.');
  });

  it('is tight when every drive left is spoken for', () => {
    const s = driveStatus(card(9, 3, [0, 0, 0, 1, 2, 2]), 't1');
    expect(s.state).toBe('tight');
    expect(s.owedTotal).toBe(3);
    expect(s.open).toBe(3);
    expect(s.note).toBe('Every tee shot left is spoken for: Sam 2, Al 1.');
  });

  it('is short when more is owed than there are holes', () => {
    const s = driveStatus(card(9, 3, [0, 0, 0, 1, 2, 2, -1]), 't1');
    expect(s.state).toBe('short');
    expect(s.owedTotal).toBe(3);
    expect(s.open).toBe(2);
    expect(s.note).toBe(
      '3 tee shots still owed (Sam 2, Al 1) with 2 holes left. The minimum can’t be met.'
    );
  });

  it('says "1 hole left" for one', () => {
    const s = driveStatus(card(9, 2, [0, 0, 0, 0, 0, 0, 0, -1], ['Jesse', 'Sam']), 't1');
    expect(s.state).toBe('short');
    expect(s.note).toBe(
      '2 tee shots still owed (Sam 2) with 1 hole left. The minimum can’t be met.'
    );
  });

  it('says "1 tee shot" for one, and "no holes" once the round is out of them', () => {
    const s = driveStatus(card(9, 1, [0, 0, 0, 0, 0, 0, 0, 0, 0], ['Jesse', 'Sam']), 't1');
    expect(s.state).toBe('short');
    expect(s.note).toBe(
      '1 tee shot still owed (Sam 1) with no holes left. The minimum can’t be met.'
    );
  });

  it('keeps member order between people owed the same', () => {
    const s = driveStatus(card(9, 1, [], ['Jesse', 'Sam', 'Al']), 't1');
    expect(s.owed.map((o) => o.name)).toEqual(['Jesse', 'Sam', 'Al']);
    expect(s.note).toBe('Still owed: Jesse 1, Sam 1, Al 1. 9 holes left.');
  });

  it('ignores a minimum that is not a whole number above zero', () => {
    for (const min of [0, -1, 1.5]) expect(driveStatus(card(9, min, [0]), 't1').state).toBe('none');
  });

  it('does not count a drive on a hole posted as zero shots', () => {
    // Defensive: entry never writes a 0, but a hand-edited file could.
    const hs = holes(1);
    const r = creditShot(scrambleRound({ holes: hs, scores: { 1: { t1: 0 } }, minDrives: 1 }), 1, 't1', 0, 0);
    expect(teamShotStats(r, 't1').members[0].drives).toBe(0);
  });
});

describe('scored holes with no drive picked', () => {
  it('lists them in playing order', () => {
    // A shotgun start on the 4th: the holes are 4..9, 1..3 in the order played.
    const hs = holes(9);
    const rotated = [...hs.slice(3), ...hs.slice(0, 3)];
    const scores = { 4: { t1: 4 }, 5: { t1: 3 }, 6: { t1: 5 }, 1: { t1: 4 } };
    const r = creditShot(scrambleRound({ holes: rotated, scores }), 5, 't1', 0, 1);
    expect(uncreditedDrives(r, 't1')).toEqual([4, 6, 1]);
  });

  it('is empty for an unplayed card', () => {
    expect(uncreditedDrives(scrambleRound(), 't1')).toEqual([]);
  });
});

describe('a shotgun start', () => {
  it('counts by hole number, whatever order the holes are played in', () => {
    const hs = holes(9);
    const rotated = [...hs.slice(6), ...hs.slice(0, 6)];
    const r = credit(
      scrambleRound({ holes: rotated, scores: { 7: { t1: 4 }, 8: { t1: 3 } }, minDrives: 1 }),
      [
        [7, 't1', 0, 0],
        [7, 't1', 3, 2],
        [8, 't1', 0, 1],
        [8, 't1', 2, 1],
      ]
    );
    const s = teamShotStats(r, 't1');
    expect(s.members.map((m) => [m.drives, m.shots, m.holed])).toEqual([
      [1, 1, 0],
      [1, 2, 1],
      [0, 1, 1],
    ]);
    expect(s.open).toBe(7);
    expect(driveStatus(r, 't1').note).toBe('Still owed: Al 1. 7 holes left.');
  });
});

describe('the plain-text share', () => {
  it('is empty with nothing credited', () => {
    expect(scrambleSummaryLines(scrambleRound())).toEqual([]);
    expect(scrambleSummaryLines(makeRound())).toEqual([]);
  });

  it('gives one bare line for one team', () => {
    const r = credit(scrambleRound(), [
      [1, 't1', 0, 0],
      [2, 't1', 0, 0],
      [3, 't1', 0, 1],
    ]);
    expect(scrambleSummaryLines(r)).toEqual(['Tee shots: Jesse 2, Sam 1, Al 0']);
  });

  it('leads each line with the team for several, and skips a team with no credits', () => {
    const r = credit(
      scrambleRound({
        teams: [
          { name: 'Jesse & Sam', members: ['Jesse', 'Sam'] },
          { name: 'Cy & Di', members: ['Cy', 'Di'] },
          { name: 'Ed & Flo', members: ['Ed', 'Flo'] },
        ],
      }),
      [
        [1, 't1', 0, 1],
        [1, 't3', 0, 0],
        [2, 't3', 1, 1],
      ]
    );
    expect(scrambleSummaryLines(r)).toEqual([
      'Jesse & Sam — tee shots: Jesse 0, Sam 1',
      'Ed & Flo — tee shots: Ed 1, Flo 0',
    ]);
  });
});

describe('the rest of the app', () => {
  it('titles the stroke-play result Scramble, and changes nothing else about it', () => {
    const hs = holes(2);
    const teams = [
      { name: 'A', members: ['Al', 'Bo'] },
      { name: 'B', members: ['Cy', 'Di'] },
    ];
    const r = scrambleRound({ holes: hs, teams, scores: scoresFrom(hs, { t1: [4, 3], t2: [4, 4] }) });
    const [result] = activeResults(r);
    expect(result.title).toBe('Scramble');
    const { options: _o, ...plain } = r;
    const stroke = activeResults({ ...plain, options: { ...r.options, scramble: undefined } })[0];
    expect({ ...result, title: stroke.title }).toEqual(stroke);
    expect(stroke.title).toBe('Stroke Play');
  });

  it('gives a scramble no awards — they are personal feats', () => {
    const hs = holes(18);
    const scores = scoresFrom(hs, { t1: hs.map((_, i) => (i === 3 ? 1 : 3)) });
    const r = { ...scrambleRound({ holes: hs, scores }), status: 'finished' as const };
    expect(computeAwards(r)).toEqual([]);
    const { scramble: _s, ...options } = r.options;
    expect(computeAwards({ ...r, options }).length).toBeGreaterThan(0);
  });
});
