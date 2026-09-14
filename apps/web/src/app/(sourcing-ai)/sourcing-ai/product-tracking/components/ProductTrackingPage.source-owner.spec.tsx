import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { extensionSessionReply } from '@/test/fixtures/extension-collection-session';
import { ProductTrackingPage } from './ProductTrackingPage';

const BASE = '/api/ads/wing-tracked-products';
const ATTEMPT_ID = '10000000-0000-4000-8000-000000000001';
const CANCEL_PATH = `${BASE}/attempts/${ATTEMPT_ID}/cancel`;
const TRACKED_ACTION = 'collectAdvertisingTrackedWingProducts';
const HANDOFF_REFUSED = '확장 프로그램이 수집을 넘겨받지 못했습니다. 확장 상태를 확인한 뒤 다시 시작해 주세요.';
const HANDOFF_UNANSWERED = '확장 프로그램이 수집을 넘겨받지 않았습니다. 확장 상태를 확인한 뒤 다시 시작해 주세요.';
const HANDOFF_OTHER_RUN = '확장 프로그램이 다른 수집을 처리하느라 이 수집을 넘겨받지 못했습니다. 잠시 후 다시 시작해 주세요.';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), delete: vi.fn(), post: vi.fn() },
}));

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/browser-collection-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/browser-collection-session')>()),
  // This browser holds no session for a running attempt, so a stop reaches the owner route.
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
    latestAttempt: null as null | Record<string, unknown>,
    latestComplete: {
      sourceImportRunId: '10000000-0000-4000-8000-000000000000',
      businessDate: '2026-09-03',
      capturedAt: '2026-09-03T03:00:00.000Z',
      expectedProductCount: 1,
      capturedProductCount: 1,
      failedProductCount: 0,
    },
  };
}

function latestAttempt(state: 'RUNNING' | 'FAILED', patch: Record<string, unknown> = {}) {
  return {
    attemptId: ATTEMPT_ID,
    state,
    startedAt: '2026-09-03T04:00:00.000Z',
    capturedAt: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

function attemptPlan(state: 'RUNNING' | 'COMPLETE' | 'FAILED' = 'RUNNING') {
  return {
    attemptId: ATTEMPT_ID,
    attemptToken: '20000000-0000-4000-8000-000000000001',
    state,
    expiresAt: '2099-01-01T00:00:00.000Z',
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

function trackedMessages() {
  return vi
    .mocked(sendToExtension)
    .mock.calls.filter(([, message]) => (message as { action: string }).action === TRACKED_ACTION);
}

describe('ProductTrackingPage tracked-Wing source owner', () => {
  const events: string[] = [];
  let status: ReturnType<typeof sourceStatus>;

  beforeEach(() => {
    vi.clearAllMocks();
    events.length = 0;
    status = sourceStatus();
    const products = Array.from({ length: 12 }, (_, index) => trackedProduct(index));
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === BASE) return products;
      if (path === `${BASE}/history?days=30`) return { items: [] };
      if (path === `${BASE}/attempts/current`) return status;
      throw new Error(`unexpected request: ${path}`);
    });
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path === `${BASE}/attempts`) {
        events.push('begin');
        status = { ...status, latestAttempt: latestAttempt('RUNNING') };
        return attemptPlan();
      }
      if (path === CANCEL_PATH) {
        status = { ...status, latestAttempt: latestAttempt('FAILED', { errorCode: 'USER_CANCELLED' }) };
        return status;
      }
      throw new Error(`unexpected POST ${path}`);
    });
    vi.mocked(detectExtensionId).mockImplementation(async () => {
      events.push('detect');
      return 'kiditem-extension';
    });
    vi.mocked(transferExtensionAuthTo).mockImplementation(async () => {
      events.push('auth');
    });
    // The tracked Wing run answers only when its collection ends; its session
    // shows it took the attempt.
    vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
      extensionSessionReply(message, 'advertising.wing_tracked_products') ?? new Promise(() => undefined));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('finds the extension and hands it auth before opening the attempt, then hands the attempt to the tracked Wing run', async () => {
    renderPage();

    await screen.findByText('추적 상품 1');
    fireEvent.click(screen.getByRole('button', { name: '지표 새로고침' }));

    expect(await screen.findByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(events).toEqual(['detect', 'auth', 'begin']);
    const expectedKeywords = ['A Pencil', ...Array.from({ length: 11 }, (_, index) => `키워드 ${index + 2}`)];
    expect(apiClient.post).toHaveBeenCalledWith(
      `${BASE}/attempts`,
      { keywords: expectedKeywords },
      { headers: { 'Idempotency-Key': expect.any(String) } },
    );
    const [, , options] = vi.mocked(apiClient.post).mock.calls[0]!;
    const idempotencyKey = (options?.headers as Record<string, string>)['Idempotency-Key'];
    expect(trackedMessages()).toEqual([[
      'kiditem-extension',
      { action: TRACKED_ACTION, idempotencyKey, keywords: expectedKeywords },
      190_000,
    ]]);
    expect(apiClient.post).not.toHaveBeenCalledWith(CANCEL_PATH);
  });

  it('opens no attempt and names the reason while no extension is connected', async () => {
    vi.mocked(detectExtensionId).mockResolvedValue(null);
    renderPage();

    await screen.findByText('추적 상품 1');
    fireEvent.click(screen.getByRole('button', { name: '지표 새로고침' }));

    expect(await screen.findByText('KidItem OS 익스텐션을 연결한 뒤 다시 시도해주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지표 새로고침' })).toBeEnabled();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(trackedMessages()).toEqual([]);
  });

  it('stops the opened attempt through the owner and gives the reason when the extension refuses it', async () => {
    vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
      (message as { action: string }).action === TRACKED_ACTION
        ? {
          success: false,
          attemptId: ATTEMPT_ID,
          terminalState: 'RUNNING',
          errorCode: 'TRACKED_WING_ATTEMPT_ENVIRONMENT_MISMATCH',
          error: 'Tracked Wing attempt belongs to another environment.',
        }
        : null);
    renderPage();

    await screen.findByText('추적 상품 1');
    fireEvent.click(screen.getByRole('button', { name: '지표 새로고침' }));

    expect(await screen.findByText(HANDOFF_REFUSED)).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith(CANCEL_PATH);
    expect(screen.getByRole('button', { name: '지표 새로고침' })).toBeEnabled();
  });

  it('stops the opened attempt through the owner when the tracked run answers with an older attempt it still runs', async () => {
    // After a stop from another browser, this browser's older tracked run is
    // still active, and the run answers with that attempt's result.
    vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
      (message as { action: string }).action === TRACKED_ACTION
        ? { success: true, attemptId: '10000000-0000-4000-8000-000000000009', terminalState: 'COMPLETE' }
        : null);
    renderPage();

    await screen.findByText('추적 상품 1');
    fireEvent.click(screen.getByRole('button', { name: '지표 새로고침' }));

    expect(await screen.findByText(HANDOFF_OTHER_RUN)).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith(CANCEL_PATH);
    expect(screen.getByRole('button', { name: '지표 새로고침' })).toBeEnabled();
  });

  it('stops the opened attempt through the owner when the extension shows no session within 20 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
      (message as { action: string }).action === TRACKED_ACTION ? new Promise(() => undefined) : null);
    renderPage();

    await screen.findByText('추적 상품 1');
    fireEvent.click(screen.getByRole('button', { name: '지표 새로고침' }));
    await waitFor(() => expect(trackedMessages()).toHaveLength(1));

    await act(() => vi.advanceTimersByTimeAsync(21_000));

    expect(await screen.findByText(HANDOFF_UNANSWERED)).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith(CANCEL_PATH);
  });

  it("shows the owner's running collection instead of opening another", async () => {
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== `${BASE}/attempts`) throw new Error(`unexpected POST ${path}`);
      status = { ...status, latestAttempt: latestAttempt('RUNNING') };
      throw new ApiError(409, 'Conflict', 'Conflict', {
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: ATTEMPT_ID,
      });
    });
    renderPage();

    await screen.findByText('추적 상품 1');
    fireEvent.click(screen.getByRole('button', { name: '지표 새로고침' }));

    expect(await screen.findByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(trackedMessages()).toEqual([]);
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
