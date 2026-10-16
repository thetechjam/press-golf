import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The app is called Trunk. It was called Press until October 2026, and the
 * old name is still correct in two places a rename must not touch: the
 * storage keys (`press.rounds.v1` and friends — renaming them would lose
 * everyone's rounds) and the Netlify form name (`press-feedback`, bound to
 * the Netlify dashboard). Everywhere a person reads the name — the page
 * title, the manifest, the splash, the share cards — it has to say Trunk,
 * and this is the check that a stray "Press" has not crept back in.
 *
 * `pressgolf.netlify.app` is the origin the app still ships from until
 * trunk.golf is live, so URLs are stripped before the files are read.
 */

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8').replace(/pressgolf\.netlify\.app/g, '');

/** "Press" or "PRESS" as a word: the app's old name, not a Nassau press. */
const OLD_NAME = /\b(Press|PRESS)\b/;

describe('the name on the surfaces people read', () => {
  it('index.html names the app Trunk', () => {
    const html = read('index.html');
    expect(html).toContain('<title>Trunk — Golf Side Games</title>');
    expect(html).toContain('aria-label="Trunk"');
    expect(html).not.toMatch(OLD_NAME);
  });

  it('the manifest names the app Trunk', () => {
    const cfg = read('vite.config.ts');
    expect(cfg).toMatch(/name: 'Trunk — Golf Side Games'/);
    expect(cfg).toMatch(/short_name: 'Trunk'/);
    expect(cfg).not.toMatch(OLD_NAME);
  });

  it('the share cards sign off at the trunk', () => {
    for (const p of ['src/shareCard.ts', 'src/scorecardCard.ts']) {
      expect(read(p), p).toContain("'SETTLED AT THE TRUNK'");
      expect(read(p), p).not.toMatch(OLD_NAME);
    }
    expect(read('src/shareCanvas.ts')).toContain("'TRUNK'");
    expect(read('src/shareCanvas.ts')).not.toMatch(OLD_NAME);
    expect(read('src/trips.ts')).toContain("'Settled at the Trunk'");
  });

  it('the privacy page and the brand sheet name Trunk', () => {
    expect(read('public/privacy.html')).not.toMatch(OLD_NAME);
    expect(read('PRIVACY.md')).not.toMatch(OLD_NAME);
    expect(read('BRAND.md')).toMatch(/^# Trunk/);
  });

  it('keeps what must not change', () => {
    expect(read('src/storage.ts')).toContain("'press.rounds.v1'");
    expect(read('src/feedback.ts')).toContain("'press.feedback.queue.v1'");
    expect(read('public/__forms.html')).toContain('name="press-feedback"');
    expect(read('src/backup.ts')).toContain("app: 'press'");
  });
});
