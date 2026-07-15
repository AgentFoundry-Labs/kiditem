import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { purchaseOrdersApi } from './lib/purchase-orders-api';
import { usePurchaseOrderSubmission } from './hooks/usePurchaseOrderSubmission';
import PurchaseOrdersPage from './page';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn() },
}));

vi.mock('./lib/purchase-orders-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/purchase-orders-api')>();
  return {
    ...actual,
    purchaseOrdersApi: {
      ...actual.purchaseOrdersApi,
      list: vi.fn(),
    },
  };
});

vi.mock('./hooks/usePurchaseOrderSubmission', () => ({
  usePurchaseOrderSubmission: vi.fn(),
}));

const rocketAccountId = '11111111-1111-4111-8111-111111111111';

describe('PurchaseOrdersPage Rocket preview route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(purchaseOrdersApi.list).mockResolvedValue({
      items: [],
      total: 0,
      counts: {
        all: 0,
        draft: 0,
        pending: 0,
        ordered: 0,
        shipped: 0,
        received: 0,
        cancelled: 0,
      },
    });
    vi.mocked(apiClient.getParsed).mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        channel: 'coupang',
        name: 'Wing',
        externalAccountId: null,
        vendorId: 'WING',
        sellerId: null,
        isPrimary: true,
      },
      {
        id: rocketAccountId,
        channel: 'rocket',
        name: '로켓 공급사',
        externalAccountId: null,
        vendorId: 'ROCKET',
        sellerId: null,
        isPrimary: false,
      },
    ]);
    vi.mocked(usePurchaseOrderSubmission).mockReturnValue({
      submit: vi.fn(),
      submittingId: null,
    });
  });

  it('mounts the review-only workspace behind an active Rocket account selector', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <PurchaseOrdersPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('combobox', { name: '로켓 채널 계정' }))
      .toHaveValue(rocketAccountId);
    expect(screen.getByRole('button', { name: '미리보기 다시 계산' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '로켓 발주 확정' })).toBeDisabled();
    expect(screen.getByText('0.1.19에서는 검토만 가능')).toBeInTheDocument();
  });
});
