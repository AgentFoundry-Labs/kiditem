import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { buildPeriodBasis } from '@kiditem/shared/dashboard';
import SalesPlans from './SalesPlans';
import { apiClient } from '@/lib/api-client';

const april = buildPeriodBasis({
  from: '2026-04-01',
  to: '2026-04-30',
  includedDates: Array.from({ length: 30 }, (_, index) => `2026-04-${String(index + 1).padStart(2, '0')}`),
  sources: ['orders'],
});
const measured = { lines: 1, notAppliedLines: 0, unmeasuredLines: 0 };

/** KID-85 follow-up P3-13 — achievement is the server's rate, never browser arithmetic. */
describe('SalesPlans achievement', () => {
  it("renders the server's achievement rate for each target", async () => {
    vi.spyOn(apiClient, 'getParsed').mockResolvedValue([{
      id: '11111111-1111-4111-8111-111111111111',
      period: '2026-04',
      targetRevenue: 100_000,
      targetOrders: 10,
      targetProfit: 0,
      notes: null,
      actuals: {
        revenue: 50_000,
        orderCount: 5,
        netProfit: 20_000,
        observedAt: '2026-05-01T00:00:00.000Z',
        basis: {
          requestedWindow: { from: '2026-04-01', to: '2026-04-30' },
          revenue: april,
          adCost: april,
          profit: april,
          costInputs: { unmappedLines: 0, purchaseCost: measured, commission: measured, otherCost: measured, advertising: measured },
        },
      },
      achievement: { revenue: 77, orders: 33, profit: null },
    }]);

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SalesPlans />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('77%')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    // 50,000 / 100,000 and 5 / 10 would both be 50%.
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });
});
