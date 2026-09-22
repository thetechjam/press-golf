// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HelpSheet, TUTORIAL_URL } from './HelpSheet';

/**
 * The walkthrough link in How to Play.
 *
 * It is the only thing in this sheet that leaves the app, which makes it the
 * only thing here that can rot without anything else noticing — the video is
 * on someone else's site and nothing in a build or a test run visits it. What
 * can be checked is the shape: that it points at YouTube, that it opens
 * without handing over the opener, and that it is above the reading rather
 * than below it.
 */

afterEach(cleanup);

const watch = () =>
  screen.queryByRole('link', { name: /watch the walkthrough/i }) as HTMLAnchorElement | null;

describe('the walkthrough link', () => {
  it('points at the published video', () => {
    render(<HelpSheet onBack={() => {}} />);
    expect(watch()!.getAttribute('href')).toBe(TUTORIAL_URL);
  });

  it('is a YouTube address with a video id on it', () => {
    // Not a string compare against a constant that could be edited to anything
    // — the shape is what says this is still a link to a video.
    const url = new URL(TUTORIAL_URL);
    expect(['youtu.be', 'www.youtube.com']).toContain(url.hostname);
    expect(url.pathname.replace('/', '')).toMatch(/^[A-Za-z0-9_-]{11}$/);
  });

  it('carries no share-tracking parameter', () => {
    // The URL arrives from YouTube's share button with ?si=…, which is a
    // per-share token. It has no business being compiled into the app.
    expect(new URL(TUTORIAL_URL).search).toBe('');
  });

  it('opens outside the app without handing over the opener', () => {
    render(<HelpSheet onBack={() => {}} />);
    const row = watch()!;
    expect(row.getAttribute('target')).toBe('_blank');
    expect(row.getAttribute('rel')).toMatch(/noopener/);
    expect(row.getAttribute('rel')).toMatch(/noreferrer/);
  });

  it('sits above the reading, not below it', () => {
    render(<HelpSheet onBack={() => {}} />);
    const basics = screen.getByText('The basics');
    expect(
      watch()!.compareDocumentPosition(basics) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('says how long the video is, and says it accurately', () => {
    // The video is 5:39. Its own narration claims "four minutes" — a line
    // written against an earlier edit and never re-checked, which is exactly
    // the mistake this guards against repeating in the app.
    render(<HelpSheet onBack={() => {}} />);
    expect(watch()!.textContent).toMatch(/under six minutes/i);

    // From the working directory, not import.meta.url — this file runs under
    // happy-dom, where that is not a file: URL.
    const srt = readFileSync(resolve('docs/video/press-tutorial.srt'), 'utf8');
    const last = srt.trim().split(/\n\s*\n/).pop()!.split('\n')[1];
    const [h, m, rest] = last.split('-->')[1].trim().split(':');
    const seconds = (Number(h) * 60 + Number(m)) * 60 + Number(rest.replace(',', '.'));
    expect(seconds).toBeLessThan(6 * 60);
    expect(seconds).toBeGreaterThan(5 * 60);
  });
});
