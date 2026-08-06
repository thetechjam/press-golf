import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Guards the Vite `define`. If the define is removed or misspelled, the app
// would silently show a stale hand-typed version instead of the real one.
describe('__APP_VERSION__', () => {
  it('matches the version in package.json', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version: string };
    expect(__APP_VERSION__).toBe(pkg.version);
  });
});
