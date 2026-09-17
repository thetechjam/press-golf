import { describe, it, expect } from 'vitest';
import { tipJarUrl, TIP_JAR_HANDLE } from './tipJar';

/**
 * A tip jar is a link to somewhere outside the app, which is the one kind of
 * thing this codebase cannot verify by running. So the tests cover the part it
 * can: that a missing handle produces no link rather than a broken one.
 */

describe('the tip jar', () => {
  it('builds the page from the handle', () => {
    expect(tipJarUrl()).toBe(`https://buymeacoffee.com/${TIP_JAR_HANDLE}`);
  });

  it('is a real handle, not a placeholder', () => {
    // The whole reason the row is gated: shipping `buymeacoffee.com/` or
    // `.../your-handle-here` is worse than shipping no row.
    expect(TIP_JAR_HANDLE).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(TIP_JAR_HANDLE).not.toMatch(/handle|your|example|todo/i);
  });

  it('points at buymeacoffee and nowhere else', () => {
    expect(new URL(tipJarUrl()!).origin).toBe('https://buymeacoffee.com');
  });

  it('has no link at all when there is no handle', () => {
    // The row keys off null, so this is what makes the row disappear rather
    // than linking to buymeacoffee.com/ with nothing after the slash.
    expect(tipJarUrl('')).toBeNull();
    expect(tipJarUrl('   ')).toBeNull();
  });

  it('trims a handle that arrived with whitespace on it', () => {
    expect(tipJarUrl('  thetechjam ')).toBe('https://buymeacoffee.com/thetechjam');
  });
});
