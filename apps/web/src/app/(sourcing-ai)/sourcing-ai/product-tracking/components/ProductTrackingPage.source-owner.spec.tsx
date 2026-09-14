import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { ProductTrackingPage } from './ProductTrackingPage';

const BASE = '/api/ads/wing-tracked-products';
const ATTEMPT_ID = '10000000-0000-4000-8000-000000000001';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), delete: vi.fn(), post: vi.fn() },
}));

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/browser-collection-session', () => ({
  // This browser holds no session for the attempt, so a stop reaches the owner route.
  sendBrowserCollectionControl: vi.fn(async () => {
    throw new Error('no extension session');
  }),
}));

vi.mock('./WingTrackedHistoryChart', () => ({
  WingTrackedHistoryChart: () => <div>history chart</div>,
  TrendSparkline: () => <div>trend sparkline</div>,
}));

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

function sourceStatus() {
  return {
    ready: true,
    latestAttempt: null,
    latestComplete: {
      sourceImportRunId: ATTEMPT_ID,
      businessDate: '2026-09-03',
      capturedAt: '2026-09-03T03:00:00.000Z',
      expectedProductCount: 1,
      capturedProductCount: 1,
      failedProductCount: 0,
    },
  };
}

function attemptPlan(state: 'RUNNING' | 'COMPLETE' | 'FAILED' = 'RUNNING') {
  return {
    attemptId: ATTEMPT_ID,
    attemptToken: '20000000-0000-4000-8000-000000000001',
    state,
    expiresAt: '2026-09-03T04:00:00.000Z',
    businessDate: '2026-09-03',
    sourceKeywordFallback: 'any_requested_keyword_for_unassigned_product' as const,
    keywords: [],
    products: [],
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductTrackingPage />
    </QueryClientProvider>,
  );
}

describe('ProductTrackingPage tracked-Wing source owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const products = Array.from({ length: 12 }, (_, index) => trackedProduct(index));
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === BASE) return products;
      if (path === `${BASE}/history?days=30`) return { items: [] };
      if (path === `${BASE}/attempts/current`) return sourceStatus();
      throw new Error(`unexpected request: ${path}`);
    });
    vi.mocked(apiClient.post).mockResolvedValue(attemptPlan());
    vi.mocked(detectExtensionId).mockResolvedValue('kiditem-extension');
    vi.mocked(sendToExtension).mockResolvedValue({
      success: true,
      attemptId: ATTEMPT_ID,
      terminalState: 'COMPLETE',
    });
  });

  it('begins a server-owned attempt, then invokes the exact direct extension action', async () => {
    renderPage();

    await screen.findByText('추적 상품 1');
    fireEvent.click(screen.getByRole('button', { name: '지표 새로고침' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const expectedKeywords = ['A Pencil', ...Array.from({ length: 11 }, (_, index) => `키워드 ${index + 2}`)];
    expect(apiClient.post).toHaveBeenCalledWith(
      `${BASE}/attempts`,
      { keywords: expectedKeywords },
      { headers: { 'Idempotency-Key': expect.any(String) } },
    );
    const [, , options] = vi.mocked(apiClient.post).mock.calls[0]!;
    const idempotencyKey = (options?.headers as Record<string, string>)['Idempotency-Key'];
    await waitFor(() => expect(sendToExtension).toHaveBeenCalledWith(
      'kiditem-extension',
      {
        action: 'collectAdvertisingTrackedWingProducts',
        idempotencyKey,
        keywords: expectedKeywords,
      },
      null,
    ));
    expect(screen.getByText('최신 스냅샷 준비됨')).toBeInTheDocument();
  });

  it('converges a replayed COMPLETE plan without contacting the extension', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(attemptPlan('COMPLETE'));

    renderPage();
    await screen.findByText('추적 상품 1');
    fireEvent.click(screen.getByRole('button', { name: '지표 새로고침' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('추적 상품 지표를 새로고침했습니다'));
    expect(detectExtensionId).not.toHaveBeenCalled();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('surfaces a replayed FAILED plan and starts a new user retry key', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(attemptPlan('FAILED'));

    renderPage();
    await screen.findByText('추적 상품 1');
    const refresh = screen.getByRole('button', { name: '지표 새로고침' });

    fireEvent.click(refresh);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      '이전 추적 상품 수집이 실패했습니다. 새로고침을 다시 시도해주세요.',
    ));
    expect(detectExtensionId).not.toHaveBeenCalled();
    expect(sendToExtension).not.toHaveBeenCalled();

    await waitFor(() => expect(refresh).not.toBeDisabled());
    fireEvent.click(refresh);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    const firstKey = (
      vi.mocked(apiClient.post).mock.calls[0]?.[2]?.headers as Record<string, string>
    )['Idempotency-Key'];
    const retryKey = (
      vi.mocked(apiClient.post).mock.calls[1]?.[2]?.headers as Record<string, string>
    )['Idempotency-Key'];
    expect(retryKey).not.toBe(firstKey);
    await waitFor(() => expect(sendToExtension).toHaveBeenCalledTimes(1));
  });

  it('reuses the same request key after a begin response is lost', async () => {
    const plan = attemptPlan();
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new Error('begin response lost'))
      .mockResolvedValueOnce(plan);

    renderPage();
    await screen.findByText('추적 상품 1');
    const refresh = screen.getByRole('button', { name: '지표 새로고침' });

    fireEvent.click(refresh);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('begin response lost'));
    await waitFor(() => expect(refresh).not.toBeDisabled());
    fireEvent.click(refresh);

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    const firstKey = (
      vi.mocked(apiClient.post).mock.calls[0]?.[2]?.headers as Record<string, string>
    )['Idempotency-Key'];
    const retryKey = (
      vi.mocked(apiClient.post).mock.calls[1]?.[2]?.headers as Record<string, string>
    )['Idempotency-Key'];
    expect(retryKey).toBe(firstKey);
    await waitFor(() => expect(sendToExtension).toHaveBeenCalledWith(
      'kiditem-extension',
      expect.objectContaining({ idempotencyKey: firstKey }),
      null,
    ));
  });

  it('starts a new request key only after the owner confirms a terminal failure', async () => {
    vi.mocked(sendToExtension)
      .mockResolvedValueOnce({
        success: false,
        attemptId: ATTEMPT_ID,
        terminalState: 'FAILED',
        retryRequired: true,
        error: 'tracked Wing failed',
      })
      .mockResolvedValueOnce({
        success: true,
        attemptId: ATTEMPT_ID,
        terminalState: 'COMPLETE',
      });

    renderPage();
    await screen.findByText('추적 상품 1');
    const refresh = screen.getByRole('button', { name: '지표 새로고침' });

    fireEvent.click(refresh);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('tracked Wing failed'));
    await waitFor(() => expect(refresh).not.toBeDisabled());
    fireEvent.click(refresh);

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    const firstKey = (
      vi.mocked(apiClient.post).mock.calls[0]?.[2]?.headers as Record<string, string>
    )['Idempotency-Key'];
    const retryKey = (
      vi.mocked(apiClient.post).mock.calls[1]?.[2]?.headers as Record<string, string>
    )['Idempotency-Key'];
    expect(retryKey).not.toBe(firstKey);
  });

  it('keeps the request key while an extension terminal outcome remains unconfirmed', async () => {
    vi.mocked(sendToExtension)
      .mockResolvedValueOnce({
        success: false,
        attemptId: ATTEMPT_ID,
        terminalState: 'RUNNING',
        error: 'terminal response lost',
      })
      .mockResolvedValueOnce({
        success: true,
        attemptId: ATTEMPT_ID,
        terminalState: 'COMPLETE',
      });

    renderPage();
    await screen.findByText('추적 상품 1');
    const refresh = screen.getByRole('button', { name: '지표 새로고침' });

    fireEvent.click(refresh);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('terminal response lost'));
    await waitFor(() => expect(refresh).not.toBeDisabled());
    fireEvent.click(refresh);

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    const firstKey = (
      vi.mocked(apiClient.post).mock.calls[0]?.[2]?.headers as Record<string, string>
    )['Idempotency-Key'];
    const retryKey = (
      vi.mocked(apiClient.post).mock.calls[1]?.[2]?.headers as Record<string, string>
    )['Idempotency-Key'];
    expect(retryKey).toBe(firstKey);
  });

  it('refuses a UI scope above the server limit instead of silently truncating keywords', async () => {
    const products = Array.from({ length: 13 }, (_, index) => trackedProduct(index));
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === BASE) return products;
      if (path === `${BASE}/history?days=30`) return { items: [] };
      if (path === `${BASE}/attempts/current`) return sourceStatus();
      throw new Error(`unexpected request: ${path}`);
    });

    renderPage();

    await screen.findByText('추적 상품 1');
    fireEvent.click(screen.getByRole('button', { name: '지표 새로고침' }));

    expect(toast.error).toHaveBeenCalledWith('한 번에 수집할 수 있는 추적 키워드는 최대 12개입니다');
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('shows the running collection with a stop that ends it through the owner route, then shows it stopped', async () => {
    const runningId = '30000000-0000-4000-8000-000000000002';
    const cancelPath = `${BASE}/attempts/${runningId}/cancel`;
    const latest = (state: 'RUNNING' | 'FAILED') => ({
      attemptId: runningId,
      state,
      startedAt: '2026-09-03T04:00:00.000Z',
      capturedAt: null,
      expiresAt: '2099-01-01T00:00:00.000Z',
      errorCode: state === 'FAILED' ? 'USER_CANCELLED' : null,
      errorMessage: state === 'FAILED' ? '운영자가 수집을 중단했습니다.' : null,
    });
    let current = { ...sourceStatus(), latestAttempt: latest('RUNNING') };
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === BASE) return [trackedProduct(0)];
      if (path === `${BASE}/history?days=30`) return { items: [] };
      if (path === `${BASE}/attempts/current`) return current;
      throw new Error(`unexpected request: ${path}`);
    });
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== cancelPath) throw new Error(`unexpected POST ${path}`);
      current = { ...sourceStatus(), latestAttempt: latest('FAILED') };
      return current;
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith(cancelPath);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('shows the failed attempt while keeping the previous complete snapshot visible', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === BASE) return [trackedProduct(0)];
      if (path === `${BASE}/history?days=30`) return { items: [] };
      if (path === `${BASE}/attempts/current`) {
        return {
          ...sourceStatus(),
          ready: false,
          latestAttempt: {
            attemptId: '30000000-0000-4000-8000-000000000001',
            state: 'FAILED' as const,
            startedAt: '2026-09-03T04:00:00.000Z',
            capturedAt: null,
            expiresAt: '2026-09-03T04:30:00.000Z',
            errorCode: 'TRACKED_WING_KEYWORD_COLLECTION_FAILED',
            errorMessage: 'A planned keyword failed.',
          },
        };
      }
      throw new Error(`unexpected request: ${path}`);
    });

    renderPage();

    expect(await screen.findByText('이전 완료 스냅샷 표시 중')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'TRACKED_WING_KEYWORD_COLLECTION_FAILED',
    );
    expect(screen.getByText(/마지막 완료/)).toBeInTheDocument();
  });
});
