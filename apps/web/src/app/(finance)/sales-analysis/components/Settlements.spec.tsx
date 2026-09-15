import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import Settlements from './Settlements';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

function card(label: string): string | null | undefined {
  return screen.getByText(label).nextElementSibling?.textContent;
}

/** KID-85 follow-up P3-13 — the settlement cards render server totals, not browser sums. */
describe('Settlements summary cards', () => {
  it("renders the server's settlement totals", async () => {
    vi.spyOn(apiClient, 'getParsed').mockResolvedValue({
      items: [{
        id: '11111111-1111-4111-8111-111111111111',
        period: '2026-04',
        expectedAmount: 2_000,
        actualAmount: 1_500,
        commission: 0,
        shippingFee: 0,
        adjustments: 0,
        difference: -500,
        orderCount: 0,
        returnCount: 0,
        status: 'confirmed',
        settledAt: null,
        notes: null,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      }],
      summary: {
        totalExpected: 7_777,
        totalConfirmedActual: 5_555,
        totalConfirmedDifference: -333,
        pendingCount: 4,
      },
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Settlements />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('2026-04')).toBeInTheDocument();
    expect(card('총 예상 정산액')).toBe('7,777');
    expect(card('확인된 입금액')).toBe('5,555');
    expect(card('확인된 차이 합계')).toBe('-333');
    expect(card('미확인 월')).toBe('4건');
  });

  it('renders - on every card when no settlement row contributes to its total', async () => {
    vi.spyOn(apiClient, 'getParsed').mockResolvedValue({
      items: [],
      summary: {
        totalExpected: null,
        totalConfirmedActual: null,
        totalConfirmedDifference: null,
        pendingCount: null,
      },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <Settlements />
      </QueryClientProvider>,
    );

    // The cards read "-" while loading as well, so wait for the read to land.
    await waitFor(() => {
      expect(queryClient.getQueryCache().findAll({ queryKey: queryKeys.settlements.all })[0]?.state.status)
        .toBe('success');
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(card('총 예상 정산액')).toBe('-');
    expect(card('확인된 입금액')).toBe('-');
    expect(card('확인된 차이 합계')).toBe('-');
    expect(card('미확인 월')).toBe('-');
  });
});
