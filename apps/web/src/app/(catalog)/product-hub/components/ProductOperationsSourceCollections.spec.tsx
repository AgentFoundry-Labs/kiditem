import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import { detectBrowserCollectionExtensionIds, detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaOperationsQueryKey } from '@/lib/sellpia-operations';
import { SELLPIA_OPERATION_PING, sellpiaInventoryFreshness, sellpiaOperation } from '@/test/fixtures/sellpia-operations';
import { ProductOperationsSourceCollections } from './ProductOperationsSourceCollections';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { organizationId: 'org-1' } }) }));

// 상품 운영 센터의 셀피아 원천 둘 — 재고(products.sellpia_inventory)와 상품 손익(analytics.sellpia_product_profitability)은
// 각자의 실행 kind이고 컨트롤도 따로다(KID-361). 가짜는 API·확장 경계뿐이다.
const FRESHNESS_PATH = '/api/inventory/sellpia-collection-status';
const INVENTORY_OPERATIONS = '/api/operations?kinds=products.sellpia_inventory&limit=20';
const PROFIT_OPERATIONS = '/api/operations?kinds=analytics.sellpia_product_profitability&limit=20';
const PROFIT_ID = '44444444-4444-4444-8444-444444444444';

const profitOperation = (overrides: Partial<OperationView> = {}) => sellpiaOperation({
  id: PROFIT_ID,
  kind: 'analytics.sellpia_product_profitability',
  window: { start: '2025-08-02', end: '2026-09-06' },
  ...overrides,
});

let profitOperations: OperationView[];

function renderCollections() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><ProductOperationsSourceCollections /></QueryClientProvider>) };
}

function extensionMessages(action: string) {
  return vi.mocked(sendToExtension).mock.calls.filter(([, message]) => (message as { action: string }).action === action);
}

beforeEach(() => {
  vi.clearAllMocks();
  profitOperations = [];
  vi.mocked(detectExtensionId).mockResolvedValue('ext');
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue(['ext']);
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
    const { action, kind } = message as { action: string; kind?: string };
    if (action === 'ping') return SELLPIA_OPERATION_PING;
    if (action === 'operation.start' && kind === 'analytics.sellpia_product_profitability') {
      profitOperations = [profitOperation()];
      return { success: true, operationId: PROFIT_ID, reused: false };
    }
    if (action === 'operation.cancel') {
      profitOperations = [profitOperation({ status: 'cancelled', errorCode: 'USER_CANCELLED' })];
      return { success: true };
    }
    throw new Error(`unexpected ${action} ${kind ?? ''}`);
  });
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === FRESHNESS_PATH) return sellpiaInventoryFreshness();
    if (path === INVENTORY_OPERATIONS) return { operations: [] };
    if (path === PROFIT_OPERATIONS) return { operations: profitOperations };
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === `/api/operations/${PROFIT_ID}/cancel`) return { operation: profitOperations[0] };
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('ProductOperationsSourceCollections', () => {
  it('원천마다 컨트롤이 따로이고 누른 원천(상품 손익)만 시작해 그 창을 도는 실행으로 보인다', async () => {
    renderCollections();

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 상품 손익 수집' }));

    expect(await screen.findByText('수집 중 · 2025-08-02 ~ 2026-09-06')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '셀피아 재고 수집' })).toBeEnabled();
    expect(extensionMessages('operation.start')).toEqual([
      ['ext', { action: 'operation.start', kind: 'analytics.sellpia_product_profitability', scope: {} }, 60_000],
    ]);
  });

  it('도는 상품 손익 실행을 실행 id로 멈춘다(확장 cancel 뒤 서버 cancel)', async () => {
    profitOperations = [profitOperation()];
    renderCollections();

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByRole('button', { name: '셀피아 상품 손익 수집' })).toBeEnabled();
    expect(extensionMessages('operation.cancel')).toEqual([['ext', { action: 'operation.cancel', operationId: PROFIT_ID }]]);
  });

  it('셀피아 kind를 모르는 옛 확장에는 시작을 보내지 않는다', async () => {
    vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
      ((message as { action: string }).action === 'ping' ? { success: true, capabilities: { operationRuntime: true } } : null));
    renderCollections();

    fireEvent.click(await screen.findByRole('button', { name: '셀피아 상품 손익 수집' }));

    expect(await screen.findByText('확장 프로그램을 업데이트해 주세요.')).toBeInTheDocument();
    expect(extensionMessages('operation.start')).toEqual([]);
  });

  it('새 성공 실행이 보일 때만 상품 운영 읽기를 새로 한다', async () => {
    profitOperations = [profitOperation({ id: '55555555-5555-4555-8555-555555555555', status: 'succeeded' })];
    const { client } = renderCollections();
    const dataStatusKey = queryKeys.products.operations.dataStatus(30);
    client.setQueryData(dataStatusKey, { ready: true });
    const profit = await screen.findByRole('button', { name: '셀피아 상품 손익 수집' });
    await waitFor(() => expect(profit).toBeEnabled());

    await act(() => client.refetchQueries({ queryKey: sellpiaOperationsQueryKey('analytics.sellpia_product_profitability') }));
    expect(client.getQueryState(dataStatusKey)?.isInvalidated).toBe(false);

    profitOperations = [profitOperation({ status: 'succeeded' }), ...profitOperations];
    await act(() => client.refetchQueries({ queryKey: sellpiaOperationsQueryKey('analytics.sellpia_product_profitability') }));

    await waitFor(() => expect(client.getQueryState(dataStatusKey)?.isInvalidated).toBe(true));
    expect(within(document.body).queryByText(/수집 중 ·/)).not.toBeInTheDocument();
  });
});
