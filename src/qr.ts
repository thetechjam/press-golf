/**
 * A QR encoder, because a share link nobody can point a camera at is only half
 * the feature — and because the alternative was Press's first runtime
 * dependency, for a page that has to work with no signal on the 14th tee.
 *
 * Deliberately not general-purpose. It encodes one thing: a Press share URL,
 * at error-correction level L, up to version 20. Those limits are what keep it
 * to one readable file, and each is a decision rather than an omission:
 *
 * **Level L** (7% recovery) rather than the usual M (15%). The recovery levels
 * exist for codes that get scuffed, printed badly, or read at an angle off a
 * label. This one is shown on a phone screen, held a foot from another phone,
 * where the only thing that actually goes wrong is modules too small for the
 * camera to resolve. Spending 15% of the payload on damage recovery makes
 * every module smaller, so on this screen M is worse at the job than L.
 *
 * **Two segments.** A URL fragment marker (`#`) is not in QR's alphanumeric
 * character set, which would otherwise force the whole link into byte mode at
 * eight bits a character. So the prefix goes in a byte segment and the base32
 * payload — which `shareLink.ts` picked its alphabet to make possible — goes
 * in an alphanumeric one at five and a half. For a four-ball on eighteen holes
 * that is the difference between a 73x73 code and a 57x57 one.
 *
 * `qr.test.ts` checks the output by decoding it with a real QR reader rather
 * than by asserting on module positions: a hand-written encoder is worth
 * exactly as much as a scanner's willingness to read it.
 */

/* ------------------------------------------------------------------ *
 * Tables
 * ------------------------------------------------------------------ */

/** Total codewords (data + error correction) per version, 1..20. */
const TOTAL_CODEWORDS = [
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
];

/** Error-correction codewords in each block, at level L. */
const EC_PER_BLOCK = [
  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
];

/** How many blocks the data is split into, at level L. */
const BLOCK_COUNT = [1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8];

/** Row/column centres of the alignment patterns. Version 1 has none. */
const ALIGNMENT: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46],
  [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
  [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
];

export const MAX_VERSION = TOTAL_CODEWORDS.length;

/**
 * QR's alphanumeric set, in its code order. Two characters share eleven bits,
 * against eight for one byte-mode character — which is why `shareLink.ts`
 * encodes its payload in base32 and upper-cases the URL around it.
 */
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/**
 * How many data codewords a version holds, and how they are split into blocks.
 *
 * The split is derived rather than tabled: the specification's rule is that
 * blocks differ by at most one codeword, with the shorter ones first. That
 * turns three columns of a forty-row table into two lines that cannot fall out
 * of step with each other.
 */
function blocksFor(version: number): { short: number; shortCount: number; longCount: number; ec: number } {
  const ec = EC_PER_BLOCK[version - 1];
  const count = BLOCK_COUNT[version - 1];
  const data = TOTAL_CODEWORDS[version - 1] - ec * count;
  const short = Math.floor(data / count);
  const longCount = data % count;
  return { short, shortCount: count - longCount, longCount, ec };
}

const dataCodewords = (version: number): number =>
  TOTAL_CODEWORDS[version - 1] - EC_PER_BLOCK[version - 1] * BLOCK_COUNT[version - 1];

/* ------------------------------------------------------------------ *
 * Bits
 * ------------------------------------------------------------------ */

class BitBuffer {
  readonly bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
  }

  get length(): number {
    return this.bits.length;
  }

  /** The bits as bytes, zero-padded to the next byte boundary. */
  toBytes(): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (this.bits[i + j] ?? 0);
      bytes.push(byte);
    }
    return bytes;
  }
}

/** Character-count field widths, which grow with the version. */
const countBits = (version: number, mode: 'byte' | 'alnum'): number => {
  if (version <= 9) return mode === 'byte' ? 8 : 9;
  if (version <= 26) return mode === 'byte' ? 16 : 11;
  return mode === 'byte' ? 16 : 13;
};

interface Segment {
  mode: 'byte' | 'alnum';
  /** Bytes for a byte segment, alphanumeric codes for an alphanumeric one. */
  values: number[];
}

/**
 * Splits the text into the cheapest segments this encoder knows how to write:
 * one alphanumeric run for the longest alphanumeric tail, and a byte segment
 * for whatever precedes it.
 *
 * Not a general optimiser. It is shaped for the one input it gets — a URL
 * whose prefix contains `#` and whose payload is deliberately all base32 — and
 * degrades to a single byte segment for anything else, which is correct, just
 * larger.
 */
function segments(text: string): Segment[] {
  const bytes = new TextEncoder().encode(text);
  let start = text.length;
  while (start > 0 && ALNUM.includes(text[start - 1])) start -= 1;

  // A short alphanumeric tail costs more in segment overhead than it saves.
  if (text.length - start < 8) {
    return [{ mode: 'byte', values: [...bytes] }];
  }

  const tail = [...text.slice(start)].map((c) => ALNUM.indexOf(c));
  const head = new TextEncoder().encode(text.slice(0, start));
  const out: Segment[] = [];
  if (head.length) out.push({ mode: 'byte', values: [...head] });
  out.push({ mode: 'alnum', values: tail });
  return out;
}

/** Bits a segment occupies at a given version, header included. */
function segmentBits(segment: Segment, version: number): number {
  const header = 4 + countBits(version, segment.mode);
  if (segment.mode === 'byte') return header + segment.values.length * 8;
  const pairs = Math.floor(segment.values.length / 2);
  return header + pairs * 11 + (segment.values.length % 2) * 6;
}

function writeSegments(segs: Segment[], version: number): BitBuffer {
  const buffer = new BitBuffer();
  for (const segment of segs) {
    buffer.push(segment.mode === 'byte' ? 0b0100 : 0b0010, 4);
    buffer.push(segment.values.length, countBits(version, segment.mode));
    if (segment.mode === 'byte') {
      for (const b of segment.values) buffer.push(b, 8);
    } else {
      for (let i = 0; i + 1 < segment.values.length; i += 2) {
        buffer.push(segment.values[i] * 45 + segment.values[i + 1], 11);
      }
      if (segment.values.length % 2) buffer.push(segment.values[segment.values.length - 1], 6);
    }
  }
  return buffer;
}

/* ------------------------------------------------------------------ *
 * Reed-Solomon over GF(256)
 * ------------------------------------------------------------------ */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    // The field's defining polynomial, x^8 + x^4 + x^3 + x^2 + 1.
    x = x << 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}

const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The generator polynomial for `degree` error-correction codewords. */
function generator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** The remainder of the data divided by the generator — the block's ECC. */
function ecFor(data: number[], degree: number): number[] {
  const gen = generator(degree);
  const rest = [...data, ...new Array<number>(degree).fill(0)];
  for (let i = 0; i < data.length; i += 1) {
    const factor = rest[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j += 1) rest[i + j] ^= mul(gen[j], factor);
  }
  return rest.slice(data.length);
}

/* ------------------------------------------------------------------ *
 * Codeword assembly
 * ------------------------------------------------------------------ */

/** Alternating pad bytes, added after the terminator to fill the version. */
const PAD = [0xec, 0x11];

function codewordsFor(text: string, version: number): number[] {
  const buffer = writeSegments(segments(text), version);
  const capacity = dataCodewords(version) * 8;

  // Terminator: up to four zero bits, fewer if the data already fills it.
  buffer.push(0, Math.min(4, capacity - buffer.length));
  while (buffer.length % 8 !== 0) buffer.push(0, 1);
  const data = buffer.toBytes();
  for (let i = 0; data.length < dataCodewords(version); i += 1) data.push(PAD[i % 2]);

  // Blocks are interleaved codeword by codeword, so a scuff across the code
  // damages a little of every block rather than destroying one of them.
  const { short, shortCount, longCount, ec } = blocksFor(version);
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let at = 0;
  for (let i = 0; i < shortCount + longCount; i += 1) {
    const size = i < shortCount ? short : short + 1;
    const block = data.slice(at, at + size);
    at += size;
    blocks.push(block);
    ecBlocks.push(ecFor(block, ec));
  }

  const out: number[] = [];
  for (let i = 0; i < short + 1; i += 1) {
    for (const block of blocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ec; i += 1) for (const block of ecBlocks) out.push(block[i]);
  return out;
}

/** The smallest version this text fits in, or null when it fits in none. */
export function versionFor(text: string): number | null {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const bits = segments(text).reduce((n, s) => n + segmentBits(s, version), 0);
    if (bits <= dataCodewords(version) * 8) return version;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The grid
 * ------------------------------------------------------------------ */

type Grid = (boolean | null)[][];

const FINDER = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1],
];

/** Lays down everything whose position is fixed by the version. */
function functionPatterns(size: number, version: number): Grid {
  const grid: Grid = Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));

  const finder = (top: number, left: number) => {
    // The separator is the ring of light modules around the finder, drawn by
    // writing the 9x9 box false first and the pattern over it.
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const y = top + r;
        const x = left + c;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        grid[y][x] = r >= 0 && r < 7 && c >= 0 && c < 7 ? FINDER[r][c] === 1 : false;
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    const on = i % 2 === 0;
    grid[6][i] = on;
    grid[i][6] = on;
  }

  const centres = ALIGNMENT[version - 1];
  for (const r of centres) {
    for (const c of centres) {
      // Not where a finder already sits.
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          grid[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        }
      }
    }
  }

  // Reserved for the format information, written after masking.
  for (let i = 0; i < 9; i += 1) {
    if (grid[8][i] === null) grid[8][i] = false;
    if (grid[i][8] === null) grid[i][8] = false;
  }
  for (let i = 0; i < 8; i += 1) {
    grid[8][size - 1 - i] = false;
    grid[size - 1 - i][8] = false;
  }
  // The one module that is always dark, whatever the data says.
  grid[size - 8][8] = true;

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const on = ((bits >> i) & 1) === 1;
      grid[Math.floor(i / 3)][size - 11 + (i % 3)] = on;
      grid[size - 11 + (i % 3)][Math.floor(i / 3)] = on;
    }
  }

  return grid;
}

/** Six version bits plus a twelve-bit BCH check, for versions 7 and up. */
function versionBits(version: number): number {
  let rest = version;
  for (let i = 0; i < 12; i += 1) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
  return (version << 12) | (rest & 0xfff);
}

/** Five format bits (level L and the mask) plus a BCH check, then masked. */
function formatBits(mask: number): number {
  const data = (0b01 << 3) | mask;
  let rest = data;
  for (let i = 0; i < 10; i += 1) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
  return (((data << 10) | (rest & 0x3ff)) ^ 0x5412) & 0x7fff;
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/**
 * Walks the data codewords into the grid, two columns at a time from the
 * bottom right, skipping the column the vertical timing pattern occupies.
 */
function placeData(grid: Grid, codewords: number[], size: number): boolean[] {
  const placed: boolean[] = [];
  let bit = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (grid[row][col] !== null) continue;
        const byte = codewords[bit >> 3] ?? 0;
        grid[row][col] = ((byte >> (7 - (bit & 7))) & 1) === 1;
        placed[row * size + col] = true;
        bit += 1;
      }
    }
    upward = !upward;
  }
  return placed;
}

/**
 * The specification's four penalties, which exist to steer the mask away from
 * patterns a scanner would misread — long runs, solid blocks, and above all
 * anything resembling a finder pattern out in the data.
 *
 * Exported for its tests. Every mask produces a readable code, so a wrong
 * score here costs legibility rather than correctness — which is exactly why
 * it needs testing directly: nothing else in the suite would go red.
 */
export function penalty(grid: boolean[][], size: number): number {
  let score = 0;

  const runs = (get: (a: number, b: number) => boolean) => {
    for (let a = 0; a < size; a += 1) {
      let run = 1;
      for (let b = 1; b < size; b += 1) {
        if (get(a, b) === get(a, b - 1)) {
          run += 1;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
  };
  runs((r, c) => grid[r][c]);
  runs((c, r) => grid[r][c]);

  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = grid[r][c];
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
    }
  }

  // 1:1:3:1:1 with four light modules on one side — the finder's signature.
  const FINDER_RUN = [true, false, true, true, true, false, true];
  const matches = (line: boolean[], at: number): boolean =>
    FINDER_RUN.every((want, i) => line[at + i] === want);
  const quiet = (line: boolean[], from: number, to: number): boolean => {
    for (let i = from; i < to; i += 1) if (line[i] !== false && line[i] !== undefined) return false;
    return true;
  };
  const lines: boolean[][] = [];
  for (let r = 0; r < size; r += 1) lines.push(grid[r]);
  for (let c = 0; c < size; c += 1) lines.push(grid.map((row) => row[c]));
  for (const line of lines) {
    for (let i = 0; i + 7 <= size; i += 1) {
      if (!matches(line, i)) continue;
      if (quiet(line, i - 4, i) || quiet(line, i + 7, i + 11)) score += 40;
    }
  }

  let dark = 0;
  for (const row of grid) for (const v of row) if (v) dark += 1;
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

export interface QrCode {
  version: number;
  size: number;
  /** Which of the eight masks was applied. */
  mask: number;
  /** Row-major modules; true is dark. */
  modules: boolean[][];
}

/**
 * The QR code for `text`, or null when it is too long for version 20.
 *
 * Returned as modules rather than as an image so the caller decides how to
 * draw it — the share sheet paints an SVG path, which stays crisp at any size
 * and in either theme, where a canvas would need re-rendering for both.
 *
 * `mask` forces one of the eight rather than letting the penalty rules pick.
 * Every mask produces a readable code, so this changes only how easy the code
 * is to scan — it exists so that the choosing itself can be tested, which
 * nothing that merely decodes the output ever could.
 */
export function encodeQR(text: string, mask?: number): QrCode | null {
  const version = versionFor(text);
  if (version === null) return null;
  const size = version * 4 + 17;
  const base = functionPatterns(size, version);
  const codewords = codewordsFor(text, version);

  const grid = base.map((row) => [...row]);
  const isData = placeData(grid, codewords, size);
  // Every module has a value by now; anything still null would be a hole in
  // the layout tables rather than a module the data failed to reach.
  const filled = grid.map((row) => row.map((v) => v === true));

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  let bestMask = 0;
  for (let candidateMask = 0; candidateMask < 8; candidateMask += 1) {
    if (mask !== undefined && candidateMask !== mask) continue;
    const candidate = filled.map((row, r) =>
      row.map((v, c) => (isData[r * size + c] && MASKS[candidateMask](r, c) ? !v : v))
    );
    writeFormat(candidate, size, candidateMask);
    const score = penalty(candidate, size);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
      bestMask = candidateMask;
    }
  }
  if (!best) return null;
  return { version, size, mask: bestMask, modules: best };
}

function writeFormat(grid: boolean[][], size: number, mask: number): void {
  const bits = formatBits(mask);
  // The fifteen bits go down in reading order, most significant first — `k` is
  // a position along that run, not a bit number. Written the other way round
  // the code still looks like a QR code, still has every pattern in the right
  // place, and no scanner on earth will read it.
  const on = (k: number) => ((bits >> (14 - k)) & 1) === 1;

  // First copy: along the bottom of the top-left finder, then up its right.
  for (let k = 0; k <= 5; k += 1) grid[8][k] = on(k);
  grid[8][7] = on(6);
  grid[8][8] = on(7);
  grid[7][8] = on(8);
  for (let k = 9; k <= 14; k += 1) grid[14 - k][8] = on(k);

  // Second copy, so a code with one corner damaged is still readable. The
  // vertical run stops at the seventh bit: the module below it is the one that
  // is always dark, and a format bit written over it costs the whole code.
  for (let k = 0; k <= 6; k += 1) grid[size - 1 - k][8] = on(k);
  for (let k = 7; k <= 14; k += 1) grid[8][size - 15 + k] = on(k);
  grid[size - 8][8] = true;
}


/**
 * The code as one SVG path, plus the viewBox side it is drawn in.
 *
 * One path rather than a rect per module: a version 10 code is 3,249 modules,
 * and roughly half of them dark is 1,600 DOM nodes for something that never
 * changes. The quiet zone is included because a code drawn flush to the edge
 * of its container is one a scanner will not see.
 */
export function qrPath(code: QrCode, quietZone = 4): { path: string; side: number } {
  const parts: string[] = [];
  for (let r = 0; r < code.size; r += 1) {
    for (let c = 0; c < code.size; c += 1) {
      if (code.modules[r][c]) parts.push(`M${c + quietZone} ${r + quietZone}h1v1h-1z`);
    }
  }
  return { path: parts.join(''), side: code.size + quietZone * 2 };
}
