import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * What a crawler sees. None of this is reachable from the app's own tests —
 * it lives in index.html and public/ — and all of it is the kind of thing
 * that quietly rots: a tag deleted in a tidy-up, a PNG regenerated at the
 * wrong size, a robots.txt that starts disallowing the app.
 */

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
// Still the Netlify origin: trunk.golf is bought and pointed in a follow-up,
// and the canonical moves with it, not before.
const SITE = 'https://pressgolf.netlify.app/';

const meta = (attr: 'property' | 'name', key: string): string | null => {
  const m = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`).exec(html);
  return m ? m[1] : null;
};

describe('index.html for crawlers and link unfurls', () => {
  it('names the page the same way everywhere', () => {
    expect(html).toContain('<title>Trunk — Golf Side Games</title>');
    expect(meta('property', 'og:title')).toBe('Trunk — Golf Side Games');
    expect(meta('name', 'twitter:title')).toBe('Trunk — Golf Side Games');
  });

  it('points everything at the one canonical URL', () => {
    expect(html).toContain(`<link rel="canonical" href="${SITE}" />`);
    expect(meta('property', 'og:url')).toBe(SITE);
    expect(meta('property', 'og:type')).toBe('website');
  });

  it('carries a description in both vocabularies, and a plain one', () => {
    const og = meta('property', 'og:description');
    expect(og).toMatch(/^Trunk is a mobile-first web app/);
    expect(meta('name', 'twitter:description')).toBe(og);
    expect(meta('name', 'description')).toBeTruthy();
  });

  it('names a large-image card at its absolute URL, with its size', () => {
    expect(meta('property', 'og:image')).toBe(`${SITE}og.png`);
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(meta('property', 'og:image:alt')).toBeTruthy();
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'twitter:image')).toBe(`${SITE}og.png`);
  });

  it('says something without JavaScript', () => {
    expect(html).toMatch(/<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/);
  });
});

describe('public/og.png', () => {
  it('is the 1200×630 the tags promise', () => {
    const png = readFileSync(resolve(root, 'public', 'og.png'));
    // PNG signature, then the IHDR chunk holds width and height at 16 and 20.
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});

describe('public/robots.txt', () => {
  it('lets everything in except the forms stub', () => {
    const robots = readFileSync(resolve(root, 'public', 'robots.txt'), 'utf8');
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/^Disallow: \/$/m);
  });
});
