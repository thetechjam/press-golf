// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TrendLine } from './StatCharts';
import type { RoundPoint } from '../stats';

const pts = (...toPar: number[]): RoundPoint[] =>
  toPar.map((t, i) => ({ date: `2026-05-0${i + 1}`, course: 'Oakmont', holes: 18, toPar: t }));

afterEach(cleanup);

describe('TrendLine', () => {
  it('says so in words when every round was the same score', () => {
    render(<TrendLine points={pts(18, 18, 18)} color="#000" />);
    expect(document.querySelector('svg')).toBeNull();
    expect(document.querySelector('.trend-caption')?.textContent).toBe('+18 in each of 3 rounds');
  });

  it('draws the line, the average and a dot per round when scores moved', () => {
    render(<TrendLine points={pts(10, 14, 12)} color="#000" />);
    expect(document.querySelector('svg path')).not.toBeNull();
    expect(document.querySelector('.trend-avg')).not.toBeNull();
    // Three round dots, plus the best-round ring and the selection dot.
    expect(document.querySelectorAll('svg circle')).toHaveLength(5);
  });

  it('does not stretch a one-stroke wobble across the full height', () => {
    render(<TrendLine points={pts(10, 11, 10)} color="#000" />);
    const ys = [...document.querySelectorAll('svg circle:not([class])')].map((c) =>
      Number(c.getAttribute('cy'))
    );
    const drop = Math.max(...ys) - Math.min(...ys);
    expect(drop).toBeLessThan((72 - 16) / 2);
  });
});
