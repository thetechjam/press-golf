// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Stakes } from '../types';
import { StakesEditor } from './StakesEditor';

/** The editor with its stakes held the way Setup and the Board hold them. */
function Harness({ seen }: { seen: Stakes[] }) {
  const [stakes, setStakes] = useState<Stakes>({});
  return (
    <StakesEditor
      games={['skins']}
      stakes={stakes}
      onChange={(s) => {
        seen.push(s);
        setStakes(s);
      }}
    />
  );
}

afterEach(cleanup);

describe('the stake fields', () => {
  it('keep cents, and never store a negative stake', async () => {
    const user = userEvent.setup();
    const seen: Stakes[] = [];
    render(<Harness seen={seen} />);
    const field = screen.getByRole('spinbutton');

    await user.type(field, '2.5');
    expect(seen.at(-1)).toEqual({ skins: 2.5 });

    await user.clear(field);
    await user.type(field, '-5');
    expect(seen.every((s) => (s.skins ?? 0) >= 0)).toBe(true);
    expect(seen.at(-1)).toEqual({ skins: 0 });
  });

  it('let the box be cleared and retyped without a 0 appearing in it', async () => {
    const user = userEvent.setup();
    render(<Harness seen={[]} />);
    const field = screen.getByRole<HTMLInputElement>('spinbutton');
    await user.type(field, '5');
    await user.clear(field);
    expect(field.value).toBe('');
    await user.type(field, '3');
    expect(field.value).toBe('3');
  });
});
