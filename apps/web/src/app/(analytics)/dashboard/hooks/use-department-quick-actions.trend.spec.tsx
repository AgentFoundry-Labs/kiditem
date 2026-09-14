import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { useDepartmentQuickActions } from './use-department-quick-actions';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// Other department actions are outside this Trend integration. The trend control and React Query are real.
vi.mock('@/hooks/useAllMarketplaceOrderCollection', () => ({ usePersistedAllMarketplaceOrderCollection: () => ({ collectAllOrders: vi.fn() }) }));
vi.mock('@/hooks/useRocketChannelAccounts', () => ({ useRocketChannelAccounts: () => ({ rocketAccounts: [], isBootstrapping: false }) }));
vi.mock('@/app/(inventory)/_shared/sellpia-inventory-source-owner', () => ({ useSellpiaInventorySourceOwner: () => ({ start: vi.fn(), state: null, isStarting: false }) }));
vi.mock('@/lib/coupang-shipment-summary-action', () => ({ collectAndPersistCoupangShipmentSummary: vi.fn() }));
vi.mock('@/hooks/use-rocket-po-source', () => ({ useRocketPoCollection: () => ({ start: vi.fn() }) }));

const STATUS_PATH = '/api/sourcing/trend/status';
const STATUS_KEY = ['sourcing', 'trend', 'source-status'];
const idle = { latestAttempt: null, actualCutoffAt: null };
const running = { latestAttempt: { attemptId: 'naver-run', state: 'RUNNING', errorMessage: null }, actualCutoffAt: null };
let status: Record<string, unknown>;

function renderActions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useDepartmentQuickActions(), { wrapper }), client };
}

describe('Dashboard trend action', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    status = { naver: idle, shorts: idle };
    vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
      if (path === STATUS_PATH) return status;
      throw new Error(`unexpected GET ${path}`);
    });
  });

  it('does not collect on mount and starts the default trend sources through the shared control', async () => {
    vi.mocked(apiClient.post).mockImplementation(() => {
      status = { naver: running, shorts: idle };
      return new Promise(() => undefined);
    });
    const { result, client } = renderActions();
    await waitFor(() => expect(client.getQueryData(STATUS_KEY)).toBeDefined());
    expect(apiClient.post).not.toHaveBeenCalled();

    await act(async () => { await result.current.start('collectTrend'); });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/api/sourcing/trend/collect', { sources: ['naver', 'shorts'] }, expect.any(Object),
    ));
    expect(toast.success).not.toHaveBeenCalled();
    client.clear();
  });

  it('sends no second start while a trend collection is running', async () => {
    status = { naver: running, shorts: idle };
    const { result, client } = renderActions();
    await waitFor(() => expect(client.getQueryData(STATUS_KEY)).toBeDefined());

    await act(async () => { await result.current.start('collectTrend'); });

    expect(apiClient.post).not.toHaveBeenCalled();
    client.clear();
  });
});
