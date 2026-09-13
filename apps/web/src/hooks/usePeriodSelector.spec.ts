import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePeriodSelector } from './usePeriodSelector';

describe('usePeriodSelector', () => {
  afterEach(() => vi.useRealTimers());
  it('derives the default and options from the server business-date cutoff', () => {
    const { result } = renderHook(() => usePeriodSelector({
      months: 3,
      defaultTo: 'prev',
      referenceDate: '2026-01-04',
    }));

    expect(result.current.period).toBe('2025-12');
    expect(result.current.periodOptions.map((option) => option.value)).toEqual([
      '2026-01',
      '2025-12',
      '2025-11',
    ]);
  });

  it('uses the KST month when no server cutoff is available', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T16:00:00.000Z'));
    const { result, rerender } = renderHook(
      ({ referenceDate }) => usePeriodSelector({ months: 2, referenceDate }),
      { initialProps: { referenceDate: null as string | null } },
    );

    expect(result.current.period).toBe('2026-08');
    rerender({ referenceDate: '2026-09-01' });
    expect(result.current.period).toBe('2026-09');

    act(() => result.current.setPeriod('2026-06'));
    rerender({ referenceDate: '2026-10-01' });
    expect(result.current.period).toBe('2026-06');
  });
});
