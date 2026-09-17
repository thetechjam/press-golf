// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SettingsSheet } from './SettingsSheet';
import { TIP_JAR_HANDLE } from '../tipJar';

/**
 * The one row in Press that asks for something.
 *
 * It is a link out of the app, which makes it the only row here that can be
 * wrong in ways the app cannot see — a dead handle, an opener the new tab can
 * reach back through, or a build where it should not exist at all. Those are
 * what this covers; where it sits in the list is the rest.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const tipRow = () =>
  screen.queryByRole('link', { name: /buy me a coffee/i }) as HTMLAnchorElement | null;

/**
 * Whether the row is on screen at all, by its words rather than its role.
 *
 * `queryByRole('link')` only matches an anchor that has an href — so dropping
 * the gate and rendering `href={null}` leaves a coffee row sitting in Settings
 * that does nothing when tapped, and a role query calls that "absent". Absence
 * has to be asked about in the terms a user would notice it in.
 */
const tipRowText = () => screen.queryByText(/buy me a coffee/i);

describe('the tip jar row', () => {
  it('links to the handle Press is actually collecting on', () => {
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    expect(tipRow()!.getAttribute('href')).toBe(`https://buymeacoffee.com/${TIP_JAR_HANDLE}`);
  });

  it('opens outside the app without handing over the opener', () => {
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    const row = tipRow()!;
    expect(row.getAttribute('target')).toBe('_blank');
    // Without noopener the payment page gets a handle on the window that
    // opened it. `rel` is the whole defence, so it is asserted, not assumed.
    expect(row.getAttribute('rel')).toMatch(/noopener/);
    expect(row.getAttribute('rel')).toMatch(/noreferrer/);
  });

  it('says why it is there, in one line', () => {
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    expect(tipRow()!.textContent).toMatch(/free, with no ads and no account/i);
  });

  it('sits below everything the app is for', () => {
    render(<SettingsSheet onClose={() => {}} screen="home" />);
    const feedback = screen.getByText('Send feedback');
    const about = document.querySelector('.about')!;
    const row = tipRow()!;
    // After Send feedback, before the version block: asking comes last.
    expect(feedback.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is not in the native build, where a tip link is a rejected build', async () => {
    // Apple reads a link out to a tip page as a purchase route around IAP.
    // The bridge is the only thing that says which build this is.
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, Plugins: {} });
    vi.resetModules();
    const { SettingsSheet: Native } = await import('./SettingsSheet');
    render(<Native onClose={() => {}} screen="home" />);
    expect(tipRowText()).toBeNull();
    // The rest of Settings is untouched — this removes a row, not a section.
    expect(screen.getByText('Send feedback')).toBeTruthy();
  });

  it('is not there at all when there is no handle to send anyone to', async () => {
    vi.resetModules();
    vi.doMock('../tipJar', () => ({ TIP_JAR_HANDLE: '', tipJarUrl: () => null }));
    const { SettingsSheet: NoJar } = await import('./SettingsSheet');
    render(<NoJar onClose={() => {}} screen="home" />);
    expect(tipRowText()).toBeNull();
    vi.doUnmock('../tipJar');
  });
});
