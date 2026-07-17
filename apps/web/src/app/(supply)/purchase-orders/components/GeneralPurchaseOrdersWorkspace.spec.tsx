import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { purchaseOrdersApi } from '../lib/purchase-orders-api';
import { usePurchaseOrderSubmission } from '../hooks/usePurchaseOrderSubmission';
import { GeneralPurchaseOrdersWorkspace } from './GeneralPurchaseOrdersWorkspace';

vi.mock('../lib/purchase-orders-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/purchase-orders-api')>();
  return {
    ...actual,
    purchaseOrdersApi: {
      ...actual.purchaseOrdersApi,
      list: vi.fn(),
    },
  };
});

vi.mock('../hooks/usePurchaseOrderSubmission', () => ({
  usePurchaseOrderSubmission: vi.fn(),
}));

vi.mock('./RocketPurchasePreviewSection', () => ({
  RocketPurchasePreviewSection: () => <section>로켓 검토 미리보기</section>,
}));

describe('GeneralPurchaseOrdersWorkspace deep links', () => {
  beforeEach(() => {
    vi.mocked(usePurchaseOrderSubmission).mockReturnValue({
      submit: vi.fn(),
      submittingId: null,
    });
    vi.mocked(purchaseOrdersApi.list).mockResolvedValue({
      items: [{
        id: 'po-1',
        supplierName: '보넷 공급사',
        totalAmountCny: '100',
        status: 'pending',
        orderDate: '2026-07-16T00:00:00.000Z',
        expectedDeliveryDate: null,
        trackingNumber: null,
        items: [],
        supplier: null,
        latestSubmissionAttempt: null,
      }],
      total: 1,
      counts: {
        all: 1,
        draft: 0,
        pending: 1,
        ordered: 0,
        shipped: 0,
        received: 0,
        cancelled: 0,
      },
    });
  });

  it('filters by the deep-link identifiers and marks the real order row selected', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GeneralPurchaseOrdersWorkspace orderId="po-1" supplierId="supplier-1" />
      </QueryClientProvider>,
    );

    const supplierCell = await screen.findByText('보넷 공급사');
    const row = supplierCell.closest('tr');

    expect(purchaseOrdersApi.list).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'po-1',
      supplierId: 'supplier-1',
    }));
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row).toHaveClass('bg-purple-50');
  });

  it('preserves the former page heading and optional compact Rocket preview', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GeneralPurchaseOrdersWorkspace headingLevel={1} includeRocketPreview />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: '발주 관리' }))
      .toBeInTheDocument();
    expect(screen.getByText('로켓 검토 미리보기')).toBeInTheDocument();
  });
});
