import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { useDepartmentQuickActions } from './use-department-quick-actions';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// Other department actions are outside this Trend integration. The Trend hook and React Query are real.
vi.mock('@/hooks/useAllMarketplaceOrderCollection', () => ({ usePersistedAllMarketplaceOrderCollection: () => ({ collectAllOrders: vi.fn() }) }));
vi.mock('@/hooks/useRocketChannelAccounts', () => ({ useRocketChannelAccounts: () => ({ rocketAccounts: [], isBootstrapping: false }) }));
vi.mock('@/hooks/useSellpiaInventoryFreshness', () => ({ useSellpiaInventoryFreshness: () => ({ requestRefresh: vi.fn() }) }));
vi.mock('@/lib/coupang-shipment-summary-action', () => ({ collectAndPersistCoupangShipmentSummary: vi.fn() }));
vi.mock('@/lib/rocket-purchase-collection-action', () => ({ collectAndPersistRocketPurchaseOrders: vi.fn() }));

function renderActions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useDepartmentQuickActions(), { wrapper }), client };
}

describe('Dashboard direct Trend action', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ naver: { latestAttempt: null, actualCutoffAt: null }, shorts: { latestAttempt: null, actualCutoffAt: null } });
  });

  it('keeps an uncertain Dashboard request key, then uses a new key after a terminal failure', async () => {
    const { result, client } = renderActions();
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('response lost'));
    await act(async () => { await result.current.start('collectTrend'); });
    expect(toast.success).not.toHaveBeenCalled();
    vi.mocked(apiClient.post).mockResolvedValue({ results: [{ source: 'naver', state: 'FAILED', ok: false, collected: 0 }] });
    await act(async () => { await result.current.start('collectTrend'); });
    const calls = vi.mocked(apiClient.post).mock.calls;
    expect(calls[1][2]).toEqual(calls[0][2]);
    await act(async () => { await result.current.start('collectTrend'); });
    expect(calls[2][2]).not.toEqual(calls[0][2]);
    expect(toast.success).not.toHaveBeenCalled();
    client.clear();
  });

  it.each(['RUNNING', 'COMPLETE'] as const)('reports %s distinctly without changing default sources', async (state) => {
    const { result, client } = renderActions();
    vi.mocked(apiClient.post).mockResolvedValue({ results: ['naver', 'shorts'].map((source) => ({
      source, state, ok: state === 'COMPLETE', collected: 0, attemptId: source,
    })) });
    await act(async () => { await result.current.start('collectTrend'); });
    expect(apiClient.post).toHaveBeenCalledWith('/api/sourcing/trend/collect', { sources: ['naver', 'shorts'] }, expect.any(Object));
    if (state === 'RUNNING') {
      expect(toast.info).toHaveBeenCalledWith('트렌드 수집이 진행 중입니다.');
      expect(toast.success).not.toHaveBeenCalled();
    } else {
      expect(toast.success).toHaveBeenCalledWith('트렌드 수집이 완료됐습니다.');
      expect(toast.info).not.toHaveBeenCalled();
    }
    expect(toast.error).not.toHaveBeenCalled();
    client.clear();
  });

  it('does not collect on mount and does not announce success for an HTTP-200 failed source', async () => {
    const { result, client } = renderActions();
    expect(apiClient.post).not.toHaveBeenCalled();
    vi.mocked(apiClient.post).mockResolvedValue({ results: [
      { source: 'naver', state: 'COMPLETE', ok: true, collected: 2 },
      { source: 'shorts', state: 'FAILED', ok: false, collected: 0, error: 'provider failure' },
    ] });
    await act(async () => { await result.current.start('collectTrend'); });
    expect(apiClient.post).toHaveBeenCalledWith('/api/sourcing/trend/collect', { sources: ['naver', 'shorts'] }, expect.any(Object));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('일부 트렌드 수집에 실패했습니다. 다시 시도해주세요.');
    client.clear();
  });
});
