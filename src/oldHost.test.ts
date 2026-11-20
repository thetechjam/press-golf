import { describe, it, expect, afterEach, vi } from 'vitest';
import { isOldHost, onOldHost, shareBase } from './oldHost';

/**
 * The move notice and the share-link rewrite both hang off one question —
 * is this the old pressgolf.netlify.app address? — and a wrong yes anywhere
 * else would tell trunk.golf users their app had moved. So: exactly that
 * host, any case, and nothing that merely contains it.
 */

describe('isOldHost', () => {
  it('is true for the old address, in any case', () => {
    expect(isOldHost('pressgolf.netlify.app')).toBe(true);
    expect(isOldHost('PRESSGOLF.NETLIFY.APP')).toBe(true);
    expect(isOldHost('PressGolf.Netlify.App')).toBe(true);
    expect(isOldHost('pressgolf.netlify.app.')).toBe(true);
  });

  it('is false where Trunk lives now, and on every other address it runs at', () => {
    for (const host of ['trunk.golf', 'www.trunk.golf', 'trunkgolf.com', 'localhost', '127.0.0.1', '']) {
      expect(isOldHost(host), host).toBe(false);
    }
  });

  it('is false for deploy previews and branch deploys of the old site', () => {
    expect(isOldHost('deploy-preview-125--pressgolf.netlify.app')).toBe(false);
    expect(isOldHost('main--pressgolf.netlify.app')).toBe(false);
  });

  it('is false for look-alikes', () => {
    for (const host of [
      'notpressgolf.netlify.app',
      'pressgolf.netlify.app.evil.com',
      'pressgolf-netlify.app',
      'pressgolf.netlify.apps',
      'xpressgolf.netlify.app',
      'pressgolf.netlify.app..',
    ]) {
      expect(isOldHost(host), host).toBe(false);
    }
  });
});

describe('onOldHost', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the page’s own host', () => {
    vi.stubGlobal('location', { hostname: 'pressgolf.netlify.app' });
    expect(onOldHost()).toBe(true);
    vi.stubGlobal('location', { hostname: 'trunk.golf' });
    expect(onOldHost()).toBe(false);
  });

  it('is never true inside the native shell', () => {
    vi.stubGlobal('location', { hostname: 'pressgolf.netlify.app' });
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    expect(onOldHost()).toBe(false);
  });

  it('is false with no location at all', () => {
    vi.stubGlobal('location', undefined);
    expect(onOldHost()).toBe(false);
  });
});

describe('shareBase', () => {
  it('points a link made on the old address at trunk.golf, keeping the path', () => {
    expect(shareBase('https://pressgolf.netlify.app/')).toBe('https://trunk.golf/');
    expect(shareBase('https://PRESSGOLF.NETLIFY.APP/#r=ABC')).toBe('https://trunk.golf/');
    expect(shareBase('https://pressgolf.netlify.app/play?x=1#r=ABC')).toBe('https://trunk.golf/play?x=1');
  });

  it('leaves every other address exactly as it was', () => {
    for (const href of [
      'https://trunk.golf/',
      'https://trunk.golf/#r=ABC',
      'http://localhost:5173/',
      'https://deploy-preview-125--pressgolf.netlify.app/',
      'https://notpressgolf.netlify.app/',
      'https://pressgolf.netlify.app.evil.com/',
      'capacitor://localhost/',
    ]) {
      expect(shareBase(href), href).toBe(href);
    }
  });

  it('passes through something that is not a URL rather than throwing', () => {
    expect(shareBase('not a url')).toBe('not a url');
  });
});
