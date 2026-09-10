import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  DashboardDataBasis,
  basisHasValues,
  basisSummary,
  type DashboardComparisonBasis,
  type DashboardPeriodBasis,
  type DashboardMetricBasis,
} from './DashboardDataBasis';

const periodBasis: DashboardPeriodBasis = {
  kind: 'period',
  from: '2026-09-01',
  to: '2026-09-03',
  targetDays: 3,
  includedDates: ['2026-09-01', '2026-09-03'],
  includedDays: 2,
  missingDates: ['2026-09-02'],
  invalidDates: [],
  sources: ['sellpia_sales', 'coupang_ads'],
  status: 'partial',
  partial: true,
  observedAt: '2026-09-04T00:00:00.000Z',
};

describe('DashboardDataBasis', () => {
  it('discloses selected range, included dates, missing dates, and sources', () => {
    render(<DashboardDataBasis basis={periodBasis} />);

    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('부분 집계');
    fireEvent.click(screen.getByText(/부분 집계/));
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('누락 날짜 2026-09-02');
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('sellpia_sales · coupang_ads');
  });

  it('treats a period basis with included dates as having values', () => {
    expect(basisHasValues(periodBasis)).toBe(true);
  });

  it('shows every evidence date and never substitutes observedAt for snapshot asOf', () => {
    const snapshot: DashboardMetricBasis = {
      kind: 'snapshot',
      asOf: null,
      observedAt: '2026-09-04T00:00:00.000Z',
      sources: ['inventory_snapshot'],
      status: 'stale',
    };

    render(<DashboardDataBasis basis={snapshot} />);

    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('스냅샷 오래됨');
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('기준 시점 확인 불가');
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('관측 2026-09-04T00:00:00.000Z');
    expect(screen.getByTestId('dashboard-data-basis')).not.toHaveTextContent('기준시점 2026-09-04');
  });

  it('shows current and previous comparison bases with matched offsets', () => {
    const comparison: DashboardComparisonBasis = {
      kind: 'comparison',
      current: {
        ...periodBasis,
        from: '2026-09-01',
        to: '2026-09-03',
        includedDates: ['2026-09-01', '2026-09-03'],
        missingDates: ['2026-09-02'],
        includedDays: 2,
      },
      previous: {
        ...periodBasis,
        from: '2026-08-25',
        to: '2026-08-27',
        includedDates: ['2026-08-25', '2026-08-27'],
        missingDates: ['2026-08-26'],
        includedDays: 2,
      },
      matchedOffsets: [0, 2],
      status: 'comparable',
      reason: null,
    };

    render(<DashboardDataBasis basis={comparison} />);
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('현재');
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('이전');
    fireEvent.click(screen.getByText(/비교 가능/));
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('공통 오프셋 0, 2');
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('2026-09-01, 2026-09-03');
    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('2026-08-25, 2026-08-27');
    expect(basisSummary(comparison)).toContain('공통 오프셋 0, 2');
  });

  it('keeps numeric values visible for an unknown snapshot', () => {
    expect(basisHasValues({
      kind: 'snapshot',
      asOf: null,
      observedAt: null,
      sources: ['inventory_snapshot'],
      status: 'unknown',
    })).toBe(true);
  });

  it('distinguishes a failed source query from an ordinary empty period', () => {
    const failedPeriod = {
      ...periodBasis,
      status: 'unverified' as const,
      partial: false,
      includedDates: [],
    includedDays: 0,
    missingDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    queryFailedSources: ['coupang_ads'],
    };

    render(<DashboardDataBasis basis={failedPeriod} />);

    expect(screen.getByTestId('dashboard-data-basis')).toHaveTextContent('조회 실패 · 쿠팡 광고');
  });
});
