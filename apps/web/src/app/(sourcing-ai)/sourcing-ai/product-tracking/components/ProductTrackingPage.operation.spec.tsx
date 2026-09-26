import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { businessDateKey, kstBusinessDate } from '@kiditem/shared/common';
import { ProductTrackingPage } from './ProductTrackingPage';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancelInExtension: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/operation-start', () => ({
  requestOperationStart: mocks.start,
  requestOperationCancel: mocks.cancelInExtension,
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: async (path: string) => {
      if (path === BASE) return products;
      if (path === `${BASE}/history?days=30`) return { items: [] };
      if (path === OPERATIONS_PATH) return { operations };
      throw new Error(`unexpected GET ${path}`);
    },
    getParsed: async (path: string) => {
      if (path === '/api/channels/accounts') return [account];
      throw new Error(`unexpected GET ${path}`);
    },
    post: (path: string) => mocks.post(path),
    delete: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('./WingTrackedHistoryChart', () => ({
  WingTrackedHistoryChart: () => <div>history chart</div>,
  TrendSparkline: () => <div>trend sparkline</div>,
}));

const BASE = '/api/ads/wing-tracked-products';
const KIND = 'advertising.wing_tracked_products';
const OPERATIONS_PATH = `/api/operations?kinds=${KIND}&limit=20`;
const OPERATION_ID = '10000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const account = { id: ACCOUNT_ID, channel: 'coupang', name: '대표 스토어', externalAccountId: null, vendorId: null, sellerId: null, isPrimary: true };

function trackedProduct(index: number) {
  return {
    id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
    productId: `wing-${index + 1}`,
    itemId: null,
    vendorItemId: null,
    productName: `추적 상품 ${index + 1}`,
    imagePath: null,
    brandName: null,
    categoryHierarchy: null,
    sourceKeyword: index === 0 ? '  Ａ   Pencil  ' : `키워드 ${index + 1}`,
    enabled: true,
    lastCapturedAt: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    latestSnapshot: null,
  };
}

function operation(status: 'executing' | 'succeeded' | 'failed' | 'cancelled', patch: Record<string, unknown> = {}) {
  return {
    id: OPERATION_ID,
    kind: KIND,
    status,
    lockKeys: status === 'executing' ? [`account:${ACCOUNT_ID}`] : [],
    plan: { channelAccountId: ACCOUNT_ID, businessDate: '2026-09-26', keywords: ['A Pencil'], maxPages: 5, products: [] },
    progress: null,
    result: status === 'succeeded' ? { businessDate: '2026-09-26', expectedProductCount: 1, capturedProductCount: 1 } : null,
    window: null,
    errorCode: status === 'cancelled' ? 'USER_CANCELLED' : null,
    errorMessage: null,
    startedAt: '2026-09-26T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-26T00:05:00.000Z',
    expiresAt: '2026-09-26T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...patch,
  };
}

let products: ReturnType<typeof trackedProduct>[];
let operations: ReturnType<typeof operation>[];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProductTrackingPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  products = Array.from({ length: 12 }, (_, index) => trackedProduct(index));
  operations = [];
  mocks.start.mockImplementation(async () => {
    operations = [operation('executing')];
    return { outcome: 'started', operationId: OPERATION_ID };
  });
  // 이 브라우저에는 그 실행이 없다 — 중단은 서버 cancel로 간다.
  mocks.cancelInExtension.mockRejectedValue(new Error('no extension run'));
  mocks.post.mockImplementation(async () => {
    operations = [operation('cancelled')];
    return { operation: operations[0] };
  });
});

describe('ProductTrackingPage tracked Wing operation (KID-362)', () => {
  it('starts advertising.wing_tracked_products with the canonical tracked keywords and the primary Coupang account', async () => {
    renderPage();
    await screen.findByText('추적 상품 1');
    fireEvent.click(await screen.findByRole('button', { name: '지표 새로고침' }));

    expect(await screen.findByRole('button', { name: '수집 중단' })).toBeEnabled();
    const expectedKeywords = ['A Pencil', ...Array.from({ length: 11 }, (_, index) => `키워드 ${index + 2}`)];
    expect(mocks.start.mock.calls).toEqual([[KIND, { channelAccountId: ACCOUNT_ID, keywords: expectedKeywords }, { capability: 'advertisingKeywordOperationKindsV1' }]]);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('refuses a UI scope above the server limit instead of silently truncating keywords', async () => {
    products = Array.from({ length: 13 }, (_, index) => trackedProduct(index));
    renderPage();
    await screen.findByText('추적 상품 1');
    fireEvent.click(await screen.findByRole('button', { name: '지표 새로고침' }));

    expect(toast.error).toHaveBeenCalledWith('한 번에 수집할 수 있는 추적 키워드는 최대 12개입니다');
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('stops the running operation through the server cancel and then shows it stopped', async () => {
    operations = [operation('executing')];
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith(`/api/operations/${OPERATION_ID}/cancel`);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the failed operation in the operator sentence while keeping the last success visible', async () => {
    operations = [
      operation('failed', { id: '10000000-0000-4000-8000-000000000002', errorCode: 'ADVERTISING_TRACKED_PRODUCT_NOT_FOUND', errorMessage: 'not found' }),
      operation('succeeded'),
    ];
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('윙 검색에서 찾지 못한 추적 상품이 있습니다.'));
    expect(screen.getByText('이전 완료 스냅샷 표시 중')).toBeInTheDocument();
    expect(screen.getByText(/마지막 완료 .* · 추적 1개/)).toBeInTheDocument();
  });

  it('shows the snapshot as ready only when the last success is today (KST) and covered every enabled tracked product', async () => {
    const today = businessDateKey(kstBusinessDate(new Date()));
    const succeeded = (businessDate: string, expectedProductCount: number) =>
      operation('succeeded', { result: { businessDate, expectedProductCount, capturedProductCount: expectedProductCount } });
    products = [trackedProduct(0)];
    operations = [succeeded(today, 1)];
    const first = renderPage();
    expect(await screen.findByText('최신 스냅샷 준비됨')).toBeInTheDocument();
    first.unmount();

    operations = [succeeded('2026-01-01', 1)];
    const stale = renderPage();
    expect(await screen.findByText('이전 완료 스냅샷 표시 중')).toBeInTheDocument();
    stale.unmount();

    products = [trackedProduct(0), trackedProduct(1)];
    operations = [succeeded(today, 1)];
    renderPage();
    expect(await screen.findByText('이전 완료 스냅샷 표시 중')).toBeInTheDocument();
  });
});
