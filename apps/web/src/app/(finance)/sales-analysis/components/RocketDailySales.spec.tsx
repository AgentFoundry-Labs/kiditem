import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import RocketDailySales from './RocketDailySales';

vi.mock('next/dynamic', () => ({
  default: () => ({ data }: { data: unknown[] }) => (
    <div data-testid="rocket-daily-chart">{data.length}일 차트</div>
  ),
}));

describe('RocketDailySales', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockReset();
  });

  it('connects collected daily rocket sales to the chart', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      year: 2026,
      month: 7,
      days: [
        { date: '2026-07-01', revenue: 100_000, poCount: 2, itemQty: 8 },
        { date: '2026-07-02', revenue: 150_000, poCount: 3, itemQty: 12 },
      ],
      total: { revenue: 250_000, poCount: 5, itemQty: 20 },
    } as never);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RocketDailySales />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/쿠팡 로켓 일별 추이/)).toBeInTheDocument();
    expect(screen.getByTestId('rocket-daily-chart')).toHaveTextContent('2일 차트');
    expect(screen.getAllByText('250,000원')).toHaveLength(2);
  });
});
