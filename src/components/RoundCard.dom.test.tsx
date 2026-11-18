// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RoundCard } from './RoundCard';
import { ResumeCard } from './ResumeCard';
import { makeRound, scrambleRound } from '../games/testFixtures';

/**
 * A scramble in the lists. Its `games` say only stroke play and its players
 * are teams, so read naively the card would call it a stroke-play round
 * between "players" named after teams.
 */

afterEach(cleanup);

const two = scrambleRound({
  teams: [
    { name: 'Hackers', members: ['Jesse', 'Sam'] },
    { name: 'Fore Play', members: ['Al', 'Bo'] },
  ],
});

describe('the round card', () => {
  it('labels a scramble as one, and counts teams', () => {
    const { container } = render(<RoundCard round={two} onOpen={() => {}} />);
    const kind = container.querySelector('.round-kind')!;
    expect(kind.textContent).toBe(' Scramble');
    expect(kind.querySelector('svg')).toBeTruthy();
    const sub = container.querySelector('.round-sub')!.textContent!;
    expect(sub).toContain('2 teams');
    expect(sub).not.toContain('players');
    expect(container.textContent).not.toContain('Stroke Play');
  });

  it('leaves every other round as it was', () => {
    const { container } = render(<RoundCard round={makeRound()} onOpen={() => {}} />);
    expect(container.querySelector('.round-kind')).toBeNull();
    expect(container.querySelector('.round-sub')!.textContent).toContain('2 players');
  });
});

describe('the resume card', () => {
  it('says Scramble where it would say In progress', () => {
    const { container } = render(<ResumeCard round={two} onResume={() => {}} />);
    const eyebrow = container.querySelector('.resume-eyebrow')!;
    expect(eyebrow.textContent).toContain('Scramble');
    expect(eyebrow.textContent).not.toContain('In progress');
    expect(eyebrow.querySelector('svg')).toBeTruthy();
  });
});
