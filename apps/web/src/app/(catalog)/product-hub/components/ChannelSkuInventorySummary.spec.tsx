import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ChannelSkuInventorySummary } from './ChannelSkuInventorySummary';

function renderSummary() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ChannelSkuInventorySummary />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChannelSkuInventorySummary', () => {
  it('shows global channel mapping and sellable-capacity evidence without attributing it to the catalog product', async () => {
    vi.spyOn(apiClient, 'getParsed').mockResolvedValueOnce({
      items: [],
      total: 2_241,
      page: 1,
      limit: 1,
      summary: {
        total: 2_241,
        inStock: 12,
        outOfStock: 3,
        unmatched: 2_086,
        needsReview: 140,
      },
    } as never);

    renderSummary();

    expect(screen.getByText('채널 SKU 전체 현황')).toBeInTheDocument();
    expect(await screen.findByText('2,241')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('2,086')).toBeInTheDocument();
    expect(screen.getByText('140')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '쇼핑몰 상품 매칭 관리' })).toHaveAttribute(
      'href',
      '/product-hub/matching',
    );
    expect(screen.getByText(/카탈로그 상품에 자동 귀속하지 않습니다/)).toBeInTheDocument();
  });

  it('keeps the matching destination available when the summary request fails', async () => {
    vi.spyOn(apiClient, 'getParsed').mockRejectedValueOnce(new Error('network'));

    renderSummary();

    expect(await screen.findByText('채널 SKU 현황을 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '쇼핑몰 상품 매칭 관리' })).toHaveAttribute(
      'href',
      '/product-hub/matching',
    );
  });
});
