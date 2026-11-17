// @vitest-environment happy-dom
import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CourseSearch } from './CourseSearch';
import { CourseTimeoutError } from '../courses/openGolfApi';

function Harness() {
  const [value, setValue] = useState('');
  return <CourseSearch value={value} onChange={setValue} onPick={() => {}} />;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CourseSearch errors', () => {
  it('shows the friendly message when a lookup takes too long', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new CourseTimeoutError(
        'Course search is taking too long. Check your connection and try again.'
      );
    });
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: /Course/ }), 'Peb');
    expect(await screen.findByText(/taking too long/)).toBeTruthy();
  });

  it('shows the friendly fallback, not the status code, when search returns a 5xx', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: /Course/ }), 'Peb');
    expect(
      await screen.findByText('Search unavailable — your typed course name still works.')
    ).toBeTruthy();
    expect(screen.queryByText(/503/)).toBeNull();
  });

  it('shows the friendly fallback when a picked course returns an HTTP error', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('/search')
        ? {
            ok: true,
            json: async () => ({ courses: [{ id: '1', name: 'Pebble Beach', par: 72 }] }),
          }
        : { ok: false, status: 404, json: async () => ({}) }
    );
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: /Course/ }), 'Peb');
    await user.click(await screen.findByRole('button', { name: /Pebble Beach/ }));
    expect(
      await screen.findByText('Could not load that course. Pick another or keep your typed name.')
    ).toBeTruthy();
    expect(screen.queryByText(/404/)).toBeNull();
  });
});
