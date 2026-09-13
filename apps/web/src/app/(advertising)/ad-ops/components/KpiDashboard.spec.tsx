import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdTrendsSummary } from '@kiditem/shared/advertising';
import KpiDashboard from './KpiDashboard';

function measuredSummary(overrides: Partial<AdTrendsSummary> = {}): AdTrendsSummary {
  return {
    source: 'coupang_ads',
    periodDayCount: 23,
    latestBusinessDate: '2026-07-23',
    observedAt: '2026-07-24T00:10:00.000Z',
    metrics: {
      spend: 1_288_571,
      revenue: 8_755_260,
      impressions: 120_000,
      clicks: 3_000,
      conversions: 250,
      roas: 679.45,
      ctr: 2.5,
      cvr: 8.33,
    },
    orders: 240,
    ...overrides,
  };
}

describe('KpiDashboard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders measured campaign-sweep totals over the server-counted measured days', () => {
    // The browser clock says the 5th; only the server's 23 measured days count.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-05T03:00:00.000Z'));

    render(<KpiDashboard period="month" summary={measuredSummary()} />);

    expect(screen.getByText('8,755,260')).toBeInTheDocument();
    expect(screen.getByText('1,288,571')).toBeInTheDocument();
    expect(screen.getByText('380,663원')).toBeInTheDocument();
    expect(screen.getByText('56,025원')).toBeInTheDocument();
    expect(screen.getByText('430원')).toBeInTheDocument();
    expect(screen.getByText('5,154원')).toBeInTheDocument();
    expect(screen.getByText('250건')).toBeInTheDocument();
    expect(screen.getByText('679.5%')).toBeInTheDocument();
    expect(screen.getByText('광고비/전환매출')).toBeInTheDocument();
    expect(screen.getByText('14.7%')).toBeInTheDocument();
    expect(screen.getByText('2.5%')).toBeInTheDocument();
    expect(screen.getByText('8.3%')).toBeInTheDocument();
    expect(
      screen.getAllByText('이번달 중 측정 23일 · 쿠팡 광고 캠페인 합산 · 2026-07-23까지'),
    ).toHaveLength(2);
  });

  it('renders an unavailable summary as unknown values with no goal, budget or benchmark', () => {
    const { container } = render(
      <KpiDashboard
        period="14d"
        summary={{
          source: 'unavailable',
          periodDayCount: 0,
          latestBusinessDate: null,
          observedAt: null,
          metrics: null,
          orders: null,
        }}
      />,
    );

    expect(screen.getAllByText('14일 중 측정 0일 · 미수집')).toHaveLength(2);
    expect(screen.getAllByText('-')).toHaveLength(13);
    expect(container).not.toHaveTextContent(/목표|예산|업계|달성/);
    expect(screen.queryAllByText(/^0(원|건|%)?$/)).toEqual([]);
  });

  it('keeps measured zeros while unmeasured ratios and conversion counts stay unknown', () => {
    render(
      <KpiDashboard
        period="7d"
        summary={measuredSummary({
          periodDayCount: 7,
          metrics: {
            spend: 0,
            revenue: 0,
            impressions: 0,
            clicks: 0,
            conversions: null,
            roas: null,
            ctr: null,
            cvr: null,
          },
          orders: null,
        })}
      />,
    );

    expect(screen.getAllByText('0')).toHaveLength(4);
    expect(screen.getAllByText('0원')).toHaveLength(2);
    expect(screen.getAllByText('-')).toHaveLength(7);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument();
  });
});
