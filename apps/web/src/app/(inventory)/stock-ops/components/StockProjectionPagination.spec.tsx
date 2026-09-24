import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OutOfStock from './OutOfStock';

const listChannelSkuAvailability = vi.hoisted(() => vi.fn());

vi.mock('../../_shared/inventory-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../_shared/inventory-api')>();
  return {
    ...actual,
    listChannelSkuAvailability,
  };
});

function channelItem(
  page: number,
  mappingStatus: 'unmatched' | 'needs_review' | 'matched',
) {
  return {
    channelAccount: {
      id: '10000000-0000-4000-8000-000000000001',
      channel: 'coupang',
      name: '쿠팡 일반배송',
    },
    product: {
      id: '20000000-0000-4000-8000-000000000001',
      externalProductId: `PRODUCT-${page}`,
      registeredName: `채널 상품 ${page}`,
      displayName: null,
      status: 'active',
    },
    sku: {
      id: page === 1
        ? '30000000-0000-4000-8000-000000000001'
        : '30000000-0000-4000-8000-000000000002',
      externalSkuId: `SKU-${page}`,
      sellerSku: null,
      optionName: `채널 옵션 ${page}`,
      barcode: null,
      modelNumber: null,
      status: 'active',
      mappingStatus,
      sellableStock: mappingStatus === 'matched' ? 0 : null,
      updatedAt: '2026-07-12T00:00:00.000Z',
    },
    components: mappingStatus === 'matched' ? [{
      masterProductId: '40000000-0000-4000-8000-000000000001',
      code: 'SP-COMPONENT',
      name: '구성품',
      optionName: null,
      barcode: null,
      currentStock: 0,
      purchasePrice: 100,
      quantity: 1,
      mappingSource: 'manual',
      componentCapacity: 0,
      isBottleneck: true,
    }] : [],
    warnings: [],
  };
}

function channelResponse(
  page: number,
  mappingStatus: 'unmatched' | 'needs_review' | 'matched',
  total = 101,
) {
  return {
    items: total === 0 ? [] : [channelItem(page, mappingStatus)],
    total,
    page,
    limit: 100,
    summary: {
      total: 102,
      inStock: 0,
      outOfStock: mappingStatus === 'matched' ? 101 : 0,
      unmatched: 101,
      needsReview: 1,
    },
  };
}

function renderWithQueryClient(component: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{component}</QueryClientProvider>,
  );
}

beforeEach(() => {
  listChannelSkuAvailability.mockReset();
});

describe('channel zero-stock pagination', () => {
  it('uses the response total and requests the selected page', async () => {
    listChannelSkuAvailability.mockImplementation(async ({ page }) =>
      channelResponse(page, 'matched'));
    renderWithQueryClient(<OutOfStock />);

    expect(await screen.findByText('채널 상품 1')).toBeInTheDocument();
    expect(screen.getByText('101건 중 1-100')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2' }));

    expect(await screen.findByText('채널 상품 2')).toBeInTheDocument();
    await waitFor(() => expect(listChannelSkuAvailability).toHaveBeenLastCalledWith({
      status: 'out_of_stock',
      page: 2,
      limit: 100,
    }));
    expect(screen.getByText('101건 중 101-101')).toBeInTheDocument();
  });
});
