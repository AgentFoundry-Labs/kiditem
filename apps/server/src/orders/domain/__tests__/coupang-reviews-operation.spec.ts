import { describe, expect, it } from 'vitest';
import { coupangReviewMonthWindows, coupangReviewOperationWindow } from '../coupang-reviews-operation';

describe('쿠팡 상품평 월 창', () => {
  it('KST 오늘 기준 최신 달부터: 이번 달은 오늘까지, 지난 달은 말일까지(연 경계 포함)', () => {
    // UTC 1월 15일 16시 = KST 1월 16일 01시
    const windows = coupangReviewMonthWindows(3, new Date('2026-01-15T16:00:00.000Z'));
    expect(windows).toEqual([
      { index: 0, label: '2026-01', start: '2026-01-01T00:00:00+09:00', end: '2026-01-16T23:59:59+09:00' },
      { index: 1, label: '2025-12', start: '2025-12-01T00:00:00+09:00', end: '2025-12-31T23:59:59+09:00' },
      { index: 2, label: '2025-11', start: '2025-11-01T00:00:00+09:00', end: '2025-11-30T23:59:59+09:00' },
    ]);
    expect(coupangReviewOperationWindow(windows)).toEqual({ start: '2025-11-01', end: '2026-01-16' });
  });
});
