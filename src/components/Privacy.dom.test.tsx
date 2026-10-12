// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SendRound } from './SendRound';
import { ShareSheet } from './ShareSheet';
import { SettingsSheet } from './SettingsSheet';
import type { Round } from '../types';

/**
 * Two promises the app makes about data, pinned where they are made: the
 * link sheets say what a link is, and Settings points at the privacy page.
 */

const hs = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));
const round: Round = {
  id: 'r1',
  course: 'Test Links',
  date: '2026-10-11',
  createdAt: 1,
  updatedAt: 2,
  players: [
    { id: 'p1', name: 'Al', handicap: 6 },
    { id: 'p2', name: 'Bo', handicap: 10 },
  ],
  holes: hs,
  games: ['skins'],
  options: {
    useNet: true,
    stablefordMode: 'standard',
    loneWolfMultiplier: 2,
    blindWolfMultiplier: 3,
    stakes: { skins: 5 },
  },
  scores: { 1: { p1: 4, p2: 5 } },
  wolf: {},
  status: 'in_progress',
};

const NOT_ENCRYPTED = /compressed, not encrypted/i;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('what a share link is', () => {
  it('is said on the hand-over sheet, once the link is built', async () => {
    render(<SendRound round={round} onClose={() => {}} />);
    expect(await screen.findByText(NOT_ENCRYPTED, {}, { timeout: 5000 })).toBeTruthy();
  });

  it('is said on the results share sheet too', async () => {
    render(<ShareSheet round={{ ...round, status: 'finished' }} summary="Al won" onClose={() => {}} />);
    expect(await screen.findByText(NOT_ENCRYPTED, {}, { timeout: 5000 })).toBeTruthy();
  });
});

describe('the privacy page', () => {
  it('is linked from the About block in Settings', () => {
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    const link = screen.getByRole('link', { name: /privacy/i });
    expect(link.getAttribute('href')).toBe('/privacy.html');
  });
});
