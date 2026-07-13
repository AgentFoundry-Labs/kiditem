import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeadStock from './DeadStock';
import MappingAttention from './MappingAttention';
import OutOfStock from './OutOfStock';
import StockRetention from './StockRetention';
import ZeroItems from './ZeroItems';

const listSellpiaInventorySkus = vi.hoisted(() => vi.fn());
const listChannelSkuAvailability = vi.hoisted(() => vi.fn());

vi.mock('../../_shared/inventory-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../_shared/inventory-api')>();
  return {
    ...actual,
    listSellpiaInventorySkus,
    listChannelSkuAvailability,
  };
});

const summary = {
  totalSkus: 101,
  inStockSkus: 0,
  outOfStockSkus: 101,
  totalUnits: 0,
  pricedAssetValue: 0,
  unpricedSkuCount: 0,
};

function inventoryResponse(page: number, name: string) {
  return {
    items: [{
      masterProductId: page === 1
        ? '00000000-0000-4000-8000-000000000001'
        : '00000000-0000-4000-8000-000000000002',
      code: page === 1 ? 'SP-PAGE-1' : 'SP-PAGE-2',
      name,
      optionName: null,
      barcode: null,
      currentStock: 0,
      purchasePrice: 100,
      salePrice: 1000,
      isActive: true,
      stockValue: 0,
      lastImportRunId: null,
      lastImportedAt: null,
    }],
    total: 101,
    page,
    limit: 100,
    summary,
    latestImport: null,
  };
}

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
      salePrice: 1000,
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
  listSellpiaInventorySkus.mockReset();
  listChannelSkuAvailability.mockReset();
});

describe.each([
  ['Sellpia zero stock', ZeroItems],
  ['Sellpia asset retention', StockRetention],
] as const)('%s pagination', (_label, Component) => {
  it('uses the response total and requests the selected page', async () => {
    listSellpiaInventorySkus.mockImplementation(async ({ page }) =>
      inventoryResponse(page, page === 1 ? 'Sellpia 첫 페이지' : 'Sellpia 둘째 페이지'));
    renderWithQueryClient(<Component />);

    expect(await screen.findByText('Sellpia 첫 페이지')).toBeInTheDocument();
    expect(screen.getByText('101건 중 1-100')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2' }));

    expect(await screen.findByText('Sellpia 둘째 페이지')).toBeInTheDocument();
    await waitFor(() => expect(listSellpiaInventorySkus).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, limit: 100 }),
    ));
    expect(screen.getByText('101건 중 101-101')).toBeInTheDocument();
  });
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

describe('component-bottleneck pagination', () => {
  it('uses the server bottleneck filter and requests the selected page', async () => {
    listChannelSkuAvailability.mockImplementation(async ({ page }) =>
      channelResponse(page, 'matched'));
    renderWithQueryClient(<DeadStock />);

    expect(await screen.findByText('SP-COMPONENT')).toBeInTheDocument();
    expect(screen.getByText('101건 중 1-100')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2' }));

    await waitFor(() => expect(listChannelSkuAvailability).toHaveBeenLastCalledWith({
      status: 'all',
      hasBottleneck: true,
      page: 2,
      limit: 100,
    }));
    expect(await screen.findByText('101건 중 101-101')).toBeInTheDocument();
  });
});

describe('mapping-attention pagination', () => {
  it('pages unmatched and needs-review queues independently without a combined false empty state', async () => {
    listChannelSkuAvailability.mockImplementation(async ({ status, page }) =>
      status === 'unmatched'
        ? channelResponse(page, 'unmatched')
        : channelResponse(page, 'needs_review', 1));
    renderWithQueryClient(<MappingAttention />);

    const unmatched = await screen.findByRole('region', { name: '미매칭 SKU' });
    const needsReview = screen.getByRole('region', { name: '검토 필요 SKU' });
    expect(await within(unmatched).findByText('채널 상품 1')).toBeInTheDocument();
    expect(within(unmatched).getByText('101건 중 1-100')).toBeInTheDocument();
    expect(within(needsReview).getByText('채널 상품 1')).toBeInTheDocument();

    fireEvent.click(within(unmatched).getByRole('button', { name: '2' }));

    expect(await within(unmatched).findByText('채널 상품 2')).toBeInTheDocument();
    await waitFor(() => expect(listChannelSkuAvailability).toHaveBeenCalledWith({
      status: 'unmatched',
      page: 2,
      limit: 100,
    }));
    expect(within(unmatched).getByText('101건 중 101-101')).toBeInTheDocument();
    expect(within(needsReview).getByText('채널 상품 1')).toBeInTheDocument();
  });
});
