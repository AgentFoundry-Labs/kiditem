import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { OrderProcessingWorkspace } from './OrderProcessingWorkspace';

vi.mock('./SmartPicking', () => ({ default: () => <div>스마트 피킹</div> }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/orders',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const orderItem = {
  id: '00000000-0000-4000-8000-000000000001',
  platform: 'coupang',
  externalOrderId: '12345',
  externalNumber: 'CO-1',
  displayOrderNumber: 'CO-1',
  shipmentBoxId: 12345,
  status: 'ACCEPT',
  customerName: '홍길동',
  receiverName: '홍길동',
  receiverAddr: '서울시 중구',
  memo: null,
  orderedAt: '2026-04-25T00:00:00.000Z',
  shippedAt: null,
  deliveredAt: null,
  trackingNumber: null,
  shippingCompany: null,
  totalPrice: 35000,
  totalQuantity: 2,
  lineItemCount: 1,
  primaryProductName: '키즈 티셔츠',
  primaryOptionName: '120 / Blue',
  lineItems: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      productName: '키즈 티셔츠',
      optionName: '120 / Blue',
      sku: 'SKU-001',
      quantity: 2,
      unitPrice: 17500,
      totalPrice: 35000,
      status: 'ACCEPT',
      externalLineId: '98765',
    },
  ],
};

const emptyResponse = { items: [], total: 0, deliveryCompanies: [] };

function makeAcceptResponse() {
  return { items: [orderItem], total: 1, deliveryCompanies: [] };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrderProcessingWorkspace />
    </QueryClientProvider>,
  );
}

describe('<OrderProcessingWorkspace> (W3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default: skip scheduled sync (hour not in SYNC_HOURS)
    vi.spyOn(global.Date.prototype, 'getHours').mockReturnValue(10);
  });

  it('calls GET /api/orders?status=ACCEPT via getParsed and renders primaryProductName, displayOrderNumber, totalQuantity', async () => {
    const getParsedSpy = vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.includes('status=ACCEPT')) return Promise.resolve(makeAcceptResponse());
      return Promise.resolve(emptyResponse);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('키즈 티셔츠')).toBeTruthy();
    });

    // displayOrderNumber rendered
    expect(screen.getByText(/#CO-1/)).toBeTruthy();
    // totalQuantity rendered
    expect(screen.getByText(/2개/)).toBeTruthy();

    // All status fetches go through getParsed, not get
    const calledPaths = getParsedSpy.mock.calls.map(([path]) => path);
    expect(calledPaths.some((p) => p.includes('/api/orders?status='))).toBe(true);
  });

  it('confirm mutation posts to /api/orders with { action: confirm, shipmentBoxIds }', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.includes('status=ACCEPT')) return Promise.resolve(makeAcceptResponse());
      return Promise.resolve(emptyResponse);
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ message: '발주확인 완료' });

    renderPage();

    // Wait for order row to appear
    await waitFor(() => {
      expect(screen.getByText('키즈 티셔츠')).toBeTruthy();
    });

    // Select the order via the row checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is select-all, second is the row checkbox
    await userEvent.click(checkboxes[1]!);

    // Click CONFIRM button
    const confirmBtn = screen.getByRole('button', { name: /CONFIRM/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/orders', {
        action: 'confirm',
        shipmentBoxIds: [12345],
      });
    });
  });

  it('scheduled sync posts to /api/coupang-sync/orders with { from, to } when hour is in SYNC_HOURS', async () => {
    // Override hour to a sync hour
    vi.spyOn(global.Date.prototype, 'getHours').mockReturnValue(9);
    // Clear sessionStorage so sync guard passes
    sessionStorage.clear();

    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.includes('status=ACCEPT')) return Promise.resolve(makeAcceptResponse());
      return Promise.resolve(emptyResponse);
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      synced: 5,
      errors: 0,
    });

    renderPage();

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/coupang-sync/orders',
        expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
      );
    });

    // Ensure the old endpoint is NOT called
    const syncCalls = postSpy.mock.calls.filter(([path]) => path === '/api/coupang-sync/orders');
    expect(syncCalls.length).toBeGreaterThan(0);
    const wrongCalls = postSpy.mock.calls.filter(([path]) => path === '/api/coupang-sync');
    expect(wrongCalls.length).toBe(0);
  });
});
