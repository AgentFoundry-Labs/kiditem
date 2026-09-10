import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { OrderProcessingWorkspace } from './OrderProcessingWorkspace';

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

const emptyResponse = { items: [], total: 0 };

function makeAcceptResponse() {
  return { items: [orderItem], total: 1 };
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
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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

  it('keeps provider order actions visibly unsupported and does not post a mutation', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.includes('status=ACCEPT')) return Promise.resolve(makeAcceptResponse());
      return Promise.resolve(emptyResponse);
    });

    const postSpy = vi.spyOn(apiClient, 'post');

    renderPage();

    // Wait for order row to appear
    await waitFor(() => {
      expect(screen.getByText('키즈 티셔츠')).toBeTruthy();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[1]!);
    const confirmBtn = screen.getByRole('button', { name: /CONFIRM/i });
    const invoiceBtn = screen.getByRole('button', { name: /INVOICE/i });
    expect(confirmBtn).toBeDisabled();
    expect(invoiceBtn).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('현재 지원하지 않습니다');
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('does not run the retired scheduled Coupang sync', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T09:00:00+09:00'));

    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.includes('status=ACCEPT')) return Promise.resolve(makeAcceptResponse());
      return Promise.resolve(emptyResponse);
    });

    const postSpy = vi.spyOn(apiClient, 'post');

    renderPage();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('키즈 티셔츠')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001);
    });
    expect(postSpy).not.toHaveBeenCalled();
  });
});
