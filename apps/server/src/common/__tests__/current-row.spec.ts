import { describe, expect, it } from 'vitest';
import { isNewerAttempt } from '../current-row';

describe('isNewerAttempt', () => {
  it('uses observation, publication time, then id as one deterministic order', () => {
    const current = {
      observedAt: new Date('2026-09-12T00:00:00.000Z'),
      importedAt: new Date('2026-09-12T00:01:00.000Z'),
      id: '00000000-0000-4000-8000-000000000002',
    };

    expect(isNewerAttempt({
      observedAt: new Date('2026-09-12T00:00:01.000Z'),
      importedAt: new Date('2026-09-11T23:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000001',
    }, current)).toBe(true);
    expect(isNewerAttempt({
      ...current,
      importedAt: new Date('2026-09-12T00:02:00.000Z'),
    }, current)).toBe(true);
    expect(isNewerAttempt({
      ...current,
      id: '00000000-0000-4000-8000-000000000003',
    }, current)).toBe(true);
  });

  it('treats missing timestamps as older', () => {
    const current = {
      observedAt: new Date('2026-09-12T00:00:00.000Z'),
      importedAt: new Date('2026-09-12T00:01:00.000Z'),
      id: '00000000-0000-4000-8000-000000000002',
    };

    expect(isNewerAttempt({ observedAt: null, importedAt: null, id: 'z' }, current))
      .toBe(false);
  });

  it('orders publication generations without narrowing bigint values', () => {
    expect(isNewerAttempt(
      { observedAt: 9_007_199_254_740_993n, importedAt: null, id: 'a' },
      { observedAt: 9_007_199_254_740_992n, importedAt: null, id: 'z' },
    )).toBe(true);
  });
});
