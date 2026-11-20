// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HelpSheet } from './HelpSheet';

afterEach(cleanup);

describe('the opening of How to Play', () => {
  it('starts with the basics, with no video link above them', () => {
    // The walkthrough video (youtu.be/YDgTmnR_1eo) was deleted from YouTube
    // on 2026-11-20, so its row came out rather than point at nothing. When a
    // new walkthrough exists it goes back in with its own test; until then the
    // only link out of this sheet is the OpenStreetMap credit.
    const { container } = render(<HelpSheet onBack={() => {}} />);
    expect(container.querySelector('.help-sheet > :nth-child(2)')?.textContent).toMatch(/^The basics/);
    expect(screen.queryByRole('link', { name: /walkthrough|watch/i })).toBeNull();
    expect(container.innerHTML).not.toMatch(/youtu\.?be/i);
    const links = screen.getAllByRole('link').map((a) => new URL(a.getAttribute('href')!).hostname);
    expect(links).toEqual(['www.openstreetmap.org']);
  });
});

describe('the trips section', () => {
  it('explains trips, between the games and the league', () => {
    render(<HelpSheet onBack={() => {}} />);
    const trips = screen.getByRole('heading', { name: 'Trips' });
    const games = screen.getByRole('heading', { name: 'Games' });
    const league = screen.getByRole('heading', { name: 'Golf League' });
    expect(games.compareDocumentPosition(trips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trips.compareDocumentPosition(league) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trips.closest('section')?.textContent).toMatch(/settle the money once/);
  });
});
