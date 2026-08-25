import { describe, it, expect } from 'vitest';
import { playerColor, initials } from './player';

/** WCAG relative luminance of a #rrggbb string. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const againstWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

describe('playerColor', () => {
  // Every badge draws a white monogram over the color, at 9–12px — small text,
  // so the 4.5:1 floor applies. Three hues used to sit just under it.
  it('carries white text at AA on every hue', () => {
    for (let i = 0; i < 8; i += 1) {
      const color = playerColor(i);
      expect(againstWhite(color), `${color} at index ${i}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('wraps past the end of the palette', () => {
    expect(playerColor(8)).toBe(playerColor(0));
    expect(playerColor(9)).toBe(playerColor(1));
  });

  it('gives distinct colors to a full foursome', () => {
    const four = [0, 1, 2, 3].map(playerColor);
    expect(new Set(four).size).toBe(4);
  });
});

describe('initials', () => {
  it('takes two letters from a single name', () => {
    expect(initials('Jesse')).toBe('JE');
  });

  it('takes first and last initials from a full name', () => {
    expect(initials('Jesse Morrison')).toBe('JM');
    expect(initials('Big Tony Delgado')).toBe('BD');
  });

  it('falls back for an empty name', () => {
    expect(initials('   ')).toBe('?');
  });
});
