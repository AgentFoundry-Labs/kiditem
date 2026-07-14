import { describe, expect, it } from 'vitest';
import { createGeneratedFileActionLock } from './generated-file-action-lock';

describe('generated file action lock', () => {
  it('blocks a send while a delayed delete owns the lock', async () => {
    const lock = createGeneratedFileActionLock();
    const releaseDelete = lock.acquire();

    expect(releaseDelete).not.toBeNull();
    expect(lock.isLocked()).toBe(true);
    await Promise.resolve();
    expect(lock.acquire()).toBeNull();

    releaseDelete?.();
    expect(lock.isLocked()).toBe(false);
    expect(lock.acquire()).not.toBeNull();
  });

  it('keeps a newer owner locked when an old release is called twice', () => {
    const lock = createGeneratedFileActionLock();
    const releaseFirst = lock.acquire();
    releaseFirst?.();
    const releaseSecond = lock.acquire();

    releaseFirst?.();
    expect(lock.isLocked()).toBe(true);

    releaseSecond?.();
    expect(lock.isLocked()).toBe(false);
  });
});
