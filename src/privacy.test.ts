import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The privacy page makes claims about the code. Each claim here is one the
 * code can be checked against; if a feature changes what leaves the device,
 * the page has to change with it, and this is the reminder.
 */

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'public', 'privacy.html'), 'utf8');
const md = readFileSync(resolve(root, 'PRIVACY.md'), 'utf8');
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');

/** The claims both copies must carry, word for word. */
const CLAIMS = [
  'no accounts, no analytics',
  'local storage',
  'api.opengolfapi.org',
  'Netlify Forms',
  'Include this round',
  'compressed, not encrypted',
  'plain JSON',
  'Clear waiting reports',
  'Erase everything',
  // Served at the old address too, where "this site (trunk.golf)" alone is
  // wrong; it says the old address is going and how the rounds come across.
  'pressgolf.netlify.app if that is where you opened Trunk',
  'older address is being retired',
  'restore it at trunk.golf',
];

describe('the privacy page', () => {
  it('exists as a real file the SPA redirect will not swallow', () => {
    expect(html).toContain('<title>Trunk — Privacy</title>');
    expect(html).toContain('<link rel="canonical" href="https://trunk.golf/privacy.html" />');
  });

  it('makes the same claims in the page and in PRIVACY.md', () => {
    for (const claim of CLAIMS) {
      expect(html, `privacy.html: ${claim}`).toContain(claim);
      expect(md, `PRIVACY.md: ${claim}`).toContain(claim);
    }
  });

  it('names the one external API the app calls, and nothing else', () => {
    // If a second host ever appears in connect-src, the page must say what it
    // is for. Read the CSP so the two cannot drift apart silently.
    const toml = readFileSync(resolve(root, 'netlify.toml'), 'utf8');
    const csp = /Content-Security-Policy = "([^"]+)"/.exec(toml)![1];
    const connect = /connect-src ([^;]+)/.exec(csp)![1].split(/\s+/).filter((s) => s.startsWith('http'));
    expect(connect).toEqual(['https://api.opengolfapi.org']);
    for (const host of connect) expect(html).toContain(host.replace('https://', ''));
  });

  it('points people at the renamed GitHub repo', () => {
    for (const [name, text] of [['privacy.html', html], ['PRIVACY.md', md]] as const) {
      expect(text, name).toContain('github.com/thetechjam/trunk-golf');
      expect(text, name).not.toContain('github.com/thetechjam/press-golf');
    }
    expect(html).toContain('href="https://github.com/thetechjam/trunk-golf"');
  });

  it('is linked from the README', () => {
    expect(readme).toMatch(/\(\.\/PRIVACY\.md\)|\(PRIVACY\.md\)|privacy\.html/);
  });
});
