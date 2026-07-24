import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import KpiDashboard from './KpiDashboard';

describe('KpiDashboard period averages', () => {
  it('uses the collected month day count for revenue and spend daily averages', () => {
    render(
      <KpiDashboard
        totalKpi={{}}
        wingAdData={null}
        period="month"
        roas={0}
        trendsDaily={null}
        accountSummary={{
          metrics: {
            spend: 1_288_571,
            revenue: 8_755_260,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            roas: 679.45,
            ctr: 0,
            cvr: 0,
          },
          orders: 0,
          periodDayCount: 23,
          latestBusinessDate: '2026-07-23',
          source: 'coupang_ads_daily',
        }}
      />,
    );

    expect(screen.getByText('일평균 전환매출')).toBeInTheDocument();
    expect(screen.getByText('380,663원')).toBeInTheDocument();
    expect(screen.getByText('일평균 광고비')).toBeInTheDocument();
    expect(screen.getByText('56,025원')).toBeInTheDocument();
  });
});
