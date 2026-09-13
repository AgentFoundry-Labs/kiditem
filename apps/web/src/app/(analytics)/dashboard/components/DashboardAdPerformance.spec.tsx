import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardAdPerformance } from './DashboardAdPerformance';

const basis = {
  kind: 'period' as const,
  from: '2026-08-01',
  to: '2026-08-01',
  targetDays: 1,
  includedDates: ['2026-08-01'],
  invalidDates: [],
  sources: ['coupang_ads'],
};

describe('DashboardAdPerformance', () => {
  it('shows the selected range, effective source, cutoff, and each row basis', () => {
    render(
      <DashboardAdPerformance
        rangeLabel="2026-08-01 ~ 2026-08-01"
        source="coupang_ads"
        knownThrough="2026-08-01"
        effectiveAdSource="coupang_ads"
        rows={[
          { key: 'revenue', label: '광고전환매출', display: '20원', basis },
          { key: 'views', label: '노출', display: '100회', basis },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: /광고 성과/ })).toHaveTextContent(
      '2026-08-01 ~ 2026-08-01',
    );
    expect(screen.getByTestId('ad-performance-source')).toHaveTextContent(
      '쿠팡 광고 · 2026-08-01까지 · 기준 coupang_ads',
    );
    fireEvent.click(screen.getByRole('button', { name: '광고 성과 근거 안내' }));
    expect(screen.getAllByText('광고전환매출')).toHaveLength(3);
    expect(screen.getAllByText('노출')).toHaveLength(3);
  });
});
