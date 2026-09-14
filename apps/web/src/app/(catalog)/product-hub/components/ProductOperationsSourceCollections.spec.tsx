import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import {
  detectBrowserCollectionExtensionIds,
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { extensionSessionReply } from '@/test/fixtures/extension-collection-session';
import { ProductOperationsSourceCollections } from './ProductOperationsSourceCollections';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectBrowserCollectionExtensionIds: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { organizationId: 'org-1' } }),
}));

const FRESHNESS_PATH = '/api/inventory/sellpia-freshness';
const STATUS_PATH = '/api/sellpia-product-sales/status';
const BEGIN_PATH = '/api/sellpia-product-sales/attempts';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const COMPLETE_RUN_ID = '22222222-2222-4222-8222-222222222222';
const NEXT_RUN_ID = '33333333-3333-4333-8333-333333333333';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AttemptState = 'RUNNING' | 'COMPLETE' | 'FAILED';

function profitabilityAttempt(state: AttemptState, patch: Record<string, unknown> = {}) {
  return {
    attemptId: ATTEMPT_ID,
    state,
    expiresAt: '2099-01-01T00:00:00.000Z',
    capturedAt: '2026-09-14T00:00:00.000Z',
    generation: state === 'COMPLETE' ? '8' : null,
    errorCode: null,
    errorMessage: null,
    plan: { from: '2025-08-02', to: '2026-09-06', coveredMonths: ['2025-08', '2026-09'] },
    ...patch,
  };
}

function complete(sourceImportRunId: string) {
  return {
    sourceImportRunId,
    generation: '8',
    coveredThrough: '2026-09-06',
    capturedAt: '2026-09-14T00:00:00.000Z',
    mappingGeneration: '3',
  };
}

const freshness = {
  status: 'fresh',
  sourceBinding: { origin: 'https://kiditem.sellpia.com', accountKey: 'kiditem', confirmed: true },
  lastVerifiedAt: '2026-09-14T00:30:00.000Z',
  expiresAt: null,
  requestedGeneration: '7',
  verifiedGeneration: '7',
  refreshRequestedAt: null,
  refreshReason: null,
  requestedSyncScope: 'inventory',
  syncNotBefore: null,
  activeSync: null,
  lastAttempt: null,
};

let profitabilityStatus: Record<string, unknown>;

function renderCollections() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <ProductOperationsSourceCollections />
      </QueryClientProvider>,
    ),
  };
}

function extensionMessages(action: string) {
  return vi
    .mocked(sendToExtension)
    .mock.calls.filter(([, message]) => (message as { action: string }).action === action);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  profitabilityStatus = { latestAttempt: null, latestComplete: null, ready: false };
  vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({
    status: 'ready',
    extensionId: 'sellpia-extension',
    version: '1',
  });
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue([]);
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
    extensionSessionReply(message) ?? new Promise(() => undefined));
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === FRESHNESS_PATH) return freshness;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
    if (path === STATUS_PATH) return profitabilityStatus;
    throw new ApiError(404, 'NOT_FOUND', 'not found');
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === BEGIN_PATH) {
      profitabilityStatus = {
        latestAttempt: profitabilityAttempt('RUNNING'),
        latestComplete: null,
        ready: false,
      };
      return {
        ...profitabilityAttempt('RUNNING'),
        attemptToken: '44444444-4444-4444-8444-444444444444',
      };
    }
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('ProductOperationsSourceCollections', () => {
  it('gives each Sellpia source its own control and starts only the source pressed', async () => {
    renderCollections();

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 상품 손익 수집' }));

    expect(await screen.findByText('수집 중 · 2025-08-02 ~ 2026-09-06')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '셀피아 재고 수집' })).toBeEnabled();
    expect(vi.mocked(apiClient.post).mock.calls).toEqual([
      [BEGIN_PATH, {}, { headers: { 'Idempotency-Key': expect.stringMatching(UUID) } }],
    ]);
    expect(extensionMessages('collectSellpiaProductProfit')).toEqual([
      ['sellpia-extension', { action: 'collectSellpiaProductProfit', attemptId: ATTEMPT_ID }, 190_000],
    ]);
    expect(extensionMessages('collectSellpiaInventory')).toEqual([]);
  });

  it('stops the profitability attempt it opened when the extension does not take it', async () => {
    const cancelPath = `${BEGIN_PATH}/${ATTEMPT_ID}/cancel`;
    vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
      (message as { action: string }).action === 'collectSellpiaProductProfit'
        ? { success: false, error: '셀피아 로그인이 필요합니다.' }
        : null);
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path === BEGIN_PATH) {
        return { ...profitabilityAttempt('RUNNING'), attemptToken: '44444444-4444-4444-8444-444444444444' };
      }
      if (path === cancelPath) return profitabilityAttempt('FAILED');
      throw new Error(`unexpected POST ${path}`);
    });
    renderCollections();

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 상품 손익 수집' }));

    expect(await screen.findByText('셀피아 로그인이 필요합니다.')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith(cancelPath);
  });

  it('stops a running profitability collection through the owner route when no extension holds it', async () => {
    profitabilityStatus = {
      latestAttempt: profitabilityAttempt('RUNNING'),
      latestComplete: null,
      ready: false,
    };
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== `${BEGIN_PATH}/${ATTEMPT_ID}/cancel`) throw new Error(`unexpected POST ${path}`);
      const cancelled = profitabilityAttempt('FAILED', {
        errorCode: 'USER_CANCELLED',
        errorMessage: '운영자가 수집을 중단했습니다.',
      });
      profitabilityStatus = { latestAttempt: cancelled, latestComplete: null, ready: false };
      return cancelled;
    });
    renderCollections();

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByRole('button', { name: '셀피아 상품 손익 수집' })).toBeEnabled();
    expect(apiClient.post).toHaveBeenCalledWith(`${BEGIN_PATH}/${ATTEMPT_ID}/cancel`);
  });

  it('joins a profitability collection the owner already runs instead of starting another', async () => {
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== BEGIN_PATH) throw new Error(`unexpected POST ${path}`);
      profitabilityStatus = {
        latestAttempt: profitabilityAttempt('RUNNING'),
        latestComplete: null,
        ready: false,
      };
      throw new ApiError(409, 'Conflict', 'Conflict', {
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: ATTEMPT_ID,
      });
    });
    renderCollections();

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 상품 손익 수집' }));

    expect(await screen.findByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(extensionMessages('collectSellpiaProductProfit')).toEqual([]);
  });

  it('opens no profitability attempt while the extension is not connected', async () => {
    vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({ status: 'not_found' });
    renderCollections();

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 상품 손익 수집' }));

    expect(
      await screen.findByText('셀피아 수익성 수집 익스텐션을 연결한 뒤 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('refreshes product operation reads only after a new profitability publication', async () => {
    profitabilityStatus = {
      latestAttempt: profitabilityAttempt('COMPLETE'),
      latestComplete: complete(COMPLETE_RUN_ID),
      ready: true,
    };
    const { client } = renderCollections();
    const dataStatusKey = queryKeys.products.operations.dataStatus(30);
    client.setQueryData(dataStatusKey, { ready: true });
    expect(await screen.findByRole('button', { name: '셀피아 상품 손익 수집' })).toBeEnabled();

    await act(() => client.refetchQueries({ queryKey: queryKeys.inventory.sellpiaProductProfitabilitySource() }));
    expect(client.getQueryState(dataStatusKey)?.isInvalidated).toBe(false);

    profitabilityStatus = { ...profitabilityStatus, latestComplete: complete(NEXT_RUN_ID) };
    await act(() => client.refetchQueries({ queryKey: queryKeys.inventory.sellpiaProductProfitabilitySource() }));

    await waitFor(() => expect(client.getQueryState(dataStatusKey)?.isInvalidated).toBe(true));
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
