// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useShareLink } from './shareTarget';
import { makeRound, player, holes } from './games/testFixtures';

/**
 * The hook behind both share sheets. The codec is `shareLink.test.ts`'s; what
 * is pinned here is the one state a sheet cannot recover from on its own —
 * a browser with no CompressionStream, where the encoder used to reject a
 * promise nobody caught and the sheet read "Building the link…" for good.
 */

const round = makeRound({ players: [player('a', 'Al'), player('b', 'Bo')], holes: holes(9) });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useShareLink', () => {
  it('builds a link and a code for a round', async () => {
    const { result } = renderHook(() => useShareLink(round));
    await waitFor(() => expect(result.current.kind).toBe('ready'));
    if (result.current.kind === 'ready') expect(result.current.url).toContain('#r=');
  });

  it('says so when this browser cannot make links, instead of building forever', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const { result } = renderHook(() => useShareLink(round));
    await waitFor(() => expect(result.current.kind).toBe('unsupported'));
  });
});
