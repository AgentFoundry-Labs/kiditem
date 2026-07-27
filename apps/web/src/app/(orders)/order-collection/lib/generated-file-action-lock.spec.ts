import { describe, expect, it } from 'vitest';
import { createGeneratedFileActionLock } from './generated-file-action-lock';

describe('generated file action lock', () => {
  it('rejects overlapping files while allowing a disjoint action', async () => {
    const lock = createGeneratedFileActionLock();
    const releaseDelete = lock.acquire(['file-a', 'file-b']);

    expect(releaseDelete).not.toBeNull();
    expect(lock.isLocked('file-a')).toBe(true);
    expect(lock.isLocked('file-c')).toBe(false);
    await Promise.resolve();
    expect(lock.acquire(['file-b', 'file-c'])).toBeNull();
    const releaseDisjoint = lock.acquire(['file-c']);
    expect(releaseDisjoint).not.toBeNull();

    releaseDelete?.();
    expect(lock.isLocked('file-a')).toBe(false);
    expect(lock.isLocked('file-c')).toBe(true);
    releaseDisjoint?.();
  });

  it('keeps a newer owner locked when an old release is called twice', () => {
    const lock = createGeneratedFileActionLock();
    const releaseFirst = lock.acquire(['file-a']);
    releaseFirst?.();
    const releaseSecond = lock.acquire(['file-a']);

    releaseFirst?.();
    expect(lock.isLocked('file-a')).toBe(true);

    releaseSecond?.();
    expect(lock.isLocked('file-a')).toBe(false);
  });

  it('rejects empty or duplicate-only acquisition input', () => {
    const lock = createGeneratedFileActionLock();

    expect(lock.acquire([])).toBeNull();
    const release = lock.acquire(['file-a', 'file-a']);
    expect(release).not.toBeNull();
    expect(lock.lockedFileIds()).toEqual(['file-a']);
  });
});
