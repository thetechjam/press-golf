import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { encodeQR, penalty, qrPath, versionFor, MAX_VERSION } from './qr';
import { encodeRound, shareUrlQR } from './shareLink';
import { makeRound, holes18, scoresFrom } from './games/testFixtures';

/**
 * These tests read the encoder's output with a real QR decoder rather than
 * asserting on module positions.
 *
 * That is the only check worth having here. A hand-written encoder can put
 * every finder, every timing pattern and every alignment square exactly where
 * the specification says and still be unreadable — which is precisely what
 * happened while this was being written, twice: once from a BCH remainder
 * computed the wrong way, and once from the fifteen format bits laid down
 * least-significant first instead of most. Both produced something that looks
 * like a QR code in every way except the one that matters.
 */

/** Paints the modules as an RGBA bitmap, the way a camera would see them. */
function bitmap(modules: boolean[][], scale = 4, quiet = 4) {
  const size = modules.length;
  const side = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!modules[r][c]) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const px = (((r + quiet) * scale + y) * side + ((c + quiet) * scale + x)) * 4;
          data[px] = data[px + 1] = data[px + 2] = 0;
        }
      }
    }
  }
  return { data, side };
}

/** What a scanner reads off the code, or null when it cannot read one. */
function scan(text: string): string | null {
  const code = encodeQR(text);
  if (!code) return null;
  const { data, side } = bitmap(code.modules);
  return jsQR(data, side, side)?.data ?? null;
}

/** A share URL whose payload is `n` characters of base32. */
const urlOf = (n: number) =>
  'HTTPS://PRESSGOLF.NETLIFY.APP/#R=' +
  Array.from({ length: n }, (_, i) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(i * 13 + 7) % 32]).join('');

/**
 * The version sweep decodes 215 QR codes with a real scanner, which costs about
 * three seconds on an idle machine — inside Vitest's 5s default, but not by
 * enough. It has already timed out once on a machine that was also running a
 * preview server and a browser, which is the shape of a CI box on a bad day.
 *
 * The budget is raised rather than the sweep trimmed. Its redundancy is the
 * point: several payload lengths land in each version and the odd step keeps
 * them crossing byte boundaries, which is how it caught a BCH remainder
 * computed the wrong way and fifteen format bits laid down backwards. Buying
 * two seconds by decoding fewer codes would be selling the only test that can
 * see either. 30s still fails a genuine hang; it just does not fail a slow
 * afternoon.
 */
const SWEEP_TIMEOUT = 30_000;

describe('what a scanner reads', () => {
  it('reads back every version the encoder can produce', () => {
    const covered = new Set<number>();
    const failed: string[] = [];
    // Stepped rather than exhaustive: every step lands in a version, and the
    // step is odd so the payload keeps crossing byte boundaries.
    for (let n = 1; n <= 1500; n += 7) {
      const text = urlOf(n);
      const version = versionFor(text);
      if (version === null) continue;
      covered.add(version);
      if (scan(text) !== text) failed.push(`v${version} at ${n} characters`);
    }
    expect(failed).toEqual([]);
    expect(covered.has(1)).toBe(false); // the prefix alone is past version 1
    expect([...covered]).toEqual(
      Array.from({ length: MAX_VERSION - 2 }, (_, i) => i + 3)
    );
  }, SWEEP_TIMEOUT);

  it('reads back the smallest codes', () => {
    for (const text of ['A', 'HI', 'PRESS', '12345678']) expect(scan(text)).toBe(text);
  });

  it('reads back text that has to go through byte mode', () => {
    for (const text of ['http://localhost:5173/#r=abc', 'Ünicode ⛳ round', 'x'.repeat(300)]) {
      expect(scan(text)).toBe(text);
    }
  });

  it('says no rather than producing a code it cannot fit', () => {
    expect(encodeQR(urlOf(5000))).toBeNull();
    expect(versionFor(urlOf(5000))).toBeNull();
  });
});

describe('the two segments', () => {
  it('spends less on a payload it can write in alphanumeric mode', () => {
    // The whole reason `shareLink.ts` uses base32 and upper-cases the URL. One
    // lowercase character in the payload forces byte mode for all of it, and
    // that is what this compares against.
    const alnum = urlOf(500);
    const byte = alnum.slice(0, -1) + 'z';
    expect(versionFor(alnum)!).toBeLessThan(versionFor(byte)!);
  });

  it('does not bother splitting for a tail too short to pay for itself', () => {
    // A segment costs a mode indicator and a length field; below a handful of
    // characters that is more than the mode saves.
    expect(scan('café AB')).toBe('café AB');
  });
});

describe('the grid itself', () => {
  const code = encodeQR(urlOf(200))!;

  it('is square, and sized by its version', () => {
    expect(code.size).toBe(code.version * 4 + 17);
    expect(code.modules.length).toBe(code.size);
    expect(code.modules.every((r) => r.length === code.size)).toBe(true);
  });

  it('puts a finder in three corners, and an alignment square in the fourth', () => {
    const finder = (top: number, left: number) =>
      code.modules[top][left] &&
      code.modules[top + 6][left + 6] &&
      !code.modules[top + 1][left + 1] &&
      code.modules[top + 3][left + 3];
    expect(finder(0, 0)).toBe(true);
    expect(finder(0, code.size - 7)).toBe(true);
    expect(finder(code.size - 7, 0)).toBe(true);

    // The fourth corner gets no finder — that asymmetry is how a scanner works
    // out which way up the code is. It carries an alignment pattern instead:
    // five wide, dark border, light ring, dark centre.
    const centre = code.size - 7;
    expect(code.modules[centre][centre]).toBe(true);
    expect(code.modules[centre - 1][centre - 1]).toBe(false);
    expect(code.modules[centre - 2][centre - 2]).toBe(true);
    expect(code.modules[centre + 2][centre + 2]).toBe(true);
  });

  it('alternates the timing patterns', () => {
    for (let i = 8; i < code.size - 8; i += 1) {
      expect(code.modules[6][i]).toBe(i % 2 === 0);
      expect(code.modules[i][6]).toBe(i % 2 === 0);
    }
  });

  it('keeps the module that is always dark, dark', () => {
    expect(code.modules[code.size - 8][8]).toBe(true);
  });
});

describe('choosing a mask', () => {
  it('scores the four penalties the way the specification does', () => {
    // An all-dark grid, where three of the four rules have something to say
    // and the arithmetic can be done by hand.
    const size = 21;
    const grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(true));
    // Runs: every one of the 42 lines is 21 long — 3 for reaching five, then
    // one for each module past it, so 19 a line.
    const runs = 42 * 19;
    // Blocks: every 2x2 window is solid, and there are 20 x 20 of them.
    const blocks = 20 * 20 * 3;
    // Balance: 100% dark is ten steps of 5% away from even, at 10 each.
    const balance = 100;
    // Nothing resembles a finder, so the third rule scores nothing.
    expect(penalty(grid, size)).toBe(runs + blocks + balance);
  });

  it('picks the mask that scores lowest', () => {
    // Any of the eight produces a readable code, so nothing else in this file
    // would notice the choice being made badly, or not made at all.
    for (const text of [urlOf(120), urlOf(400), 'PRESS']) {
      const auto = encodeQR(text)!;
      const scores = Array.from(
        { length: 8 },
        (_, m) => penalty(encodeQR(text, m)!.modules, auto.size)
      );
      expect(auto.mask).toBe(scores.indexOf(Math.min(...scores)));
      expect(penalty(auto.modules, auto.size)).toBe(Math.min(...scores));
    }
  });

  it('still reads back whichever mask it is forced onto', () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const code = encodeQR('HTTPS://PRESSGOLF.NETLIFY.APP/#R=ABCDEFGH234567', mask)!;
      expect(code.mask).toBe(mask);
      const { data, side } = bitmap(code.modules);
      expect(jsQR(data, side, side)?.data).toBe('HTTPS://PRESSGOLF.NETLIFY.APP/#R=ABCDEFGH234567');
    }
  });
});

describe('drawing it', () => {
  it('draws one square per dark module, inside a quiet zone', () => {
    const code = encodeQR('PRESS')!;
    const { path, side } = qrPath(code);
    const dark = code.modules.flat().filter(Boolean).length;
    expect(path.split('M').length - 1).toBe(dark);
    // Without the quiet zone a scanner cannot find the code's edges at all.
    expect(side).toBe(code.size + 8);
  });
});

describe('a real Press round', () => {
  it('fits in a code you can scan off a phone screen', async () => {
    const hs = holes18();
    const ids = ['k3f9ab21', 'm7q2xz04', 'b8t5cc19', 'z1n6dd77'];
    const round = makeRound({
      players: ids.map((id, i) => ({
        id,
        name: ['Alex', 'Sam', 'Jordan', 'Casey'][i],
        handicap: [8, 14, 4, 21][i],
      })),
      holes: hs,
      games: ['skins', 'nassau', 'stableford'],
      options: {
        useNet: true,
        stakes: { skins: 5, nassau: 20, stableford: 1 },
        nassau: { mode: '2v2', teamA: [ids[0], ids[1]], teamB: [ids[2], ids[3]] },
      },
      scores: scoresFrom(
        hs,
        Object.fromEntries(ids.map((id, i) => [id, hs.map((h) => h.par + ((i + h.number) % 3))]))
      ),
    });

    const url = shareUrlQR(
      'https://pressgolf.netlify.app/',
      (await encodeRound({ ...round, course: 'Torrey Pines South' }))!
    );
    const code = encodeQR(url)!;
    // Version 13 is 69 modules a side, which a phone camera reads off another
    // phone's screen without complaint. The payload alone very nearly fills
    // version 12, so the prefix decides this on its own and there is no
    // shortening of the link that would buy a version back — which makes this
    // a budget for the round format rather than for the URL: a field added to
    // `shareLink.ts` that pushes past version 14 is one that should be paid
    // for somewhere else.
    expect(code.version).toBeLessThanOrEqual(14);
    expect(scan(url)).toBe(url);
  });
});
