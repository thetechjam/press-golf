// @vitest-environment happy-dom
import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CourseSearch } from './CourseSearch';
import { CourseRequestError } from '../courses/openGolfApi';

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
      throw new CourseRequestError(
        'Course search is taking too long. Check your connection and try again.'
      );
    });
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: /Course/ }), 'Peb');
    expect(await screen.findByText(/taking too long/)).toBeTruthy();
  });
});
