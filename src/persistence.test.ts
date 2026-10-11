import { describe, it, expect, beforeEach } from 'vitest';
import {
  describePersistence,
  persistenceStatus,
  requestPersistentStorage,
  resetPersistenceForTests,
} from './persistence';

beforeEach(resetPersistenceForTests);

describe('requestPersistentStorage', () => {
  it('is unknown where the API does not exist', async () => {
    expect(await requestPersistentStorage(undefined)).toBe('unknown');
    expect(persistenceStatus()).toBe('unknown');
  });

  it('records a yes', async () => {
    const storage = { persisted: async () => false, persist: async () => true };
    expect(await requestPersistentStorage(storage)).toBe('persisted');
    expect(describePersistence()).toBe('Storage protected');
  });

  it('records a no', async () => {
    const storage = { persisted: async () => false, persist: async () => false };
    expect(await requestPersistentStorage(storage)).toBe('best-effort');
    expect(describePersistence()).toBe('Storage not protected — back up or install');
  });

  it('does not ask again once storage is already persistent', async () => {
    let asked = 0;
    const storage = {
      persisted: async () => true,
      persist: async () => {
        asked += 1;
        return true;
      },
    };
    expect(await requestPersistentStorage(storage)).toBe('persisted');
    expect(asked).toBe(0);
  });

  it('treats a throwing API as unknown rather than failing startup', async () => {
    const storage = {
      persisted: async () => {
        throw new Error('nope');
      },
      persist: async () => true,
    };
    expect(await requestPersistentStorage(storage)).toBe('unknown');
    expect(describePersistence('unknown')).toBe('Storage status unknown');
  });
});
