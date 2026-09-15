import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { useDepartmentQuickActions } from './use-department-quick-actions';

const mocks = vi.hoisted(() => ({ collectAllOrders: vi.fn(), collectShipments: vi.fn() }));

const control = () => ({
  state: 'idle' as const,
  statusRead: 'current' as const,
  running: null,
  canStop: false,
  notice: null,
  start: vi.fn(),
  stop: vi.fn(),
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useAllMarketplaceOrderCollection', () => ({
  usePersistedAllMarketplaceOrderCollection: () => ({ collectAllOrders: mocks.collectAllOrders }),
}));
vi.mock('@/hooks/useRocketChannelAccounts', () => ({
  useRocketChannelAccounts: () => ({ rocketAccounts: [], isBootstrapping: false }),
}));
vi.mock('@/lib/coupang-shipment-summary-action', () => ({
  collectAndPersistCoupangShipmentSummary: mocks.collectShipments,
}));
vi.mock('@/hooks/use-trend-source-collection', () => ({
  useTrendSourceCollection: () => ({ control: control(), start: vi.fn() }),
}));
vi.mock('@/hooks/use-rocket-po-source', () => ({ useRocketPoCollection: () => control() }));
vi.mock('@/app/(inventory)/_shared/sellpia-inventory-source-owner', () => ({
  useSellpiaInventoryCollection: () => ({ control: control(), state: null }),
}));

function renderActions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useDepartmentQuickActions(), { wrapper }), client };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * KID-185. 두 칸은 대시보드의 "마지막 수집 시각"을 `dashboard.collections()` 로 읽는다.
 * 수집이 끝나도 그 조회를 다시 읽지 않으면, 새로고침 전까지 이전 시각이 그대로 보인다.
 * 로켓 발주·셀피아 재고 칸은 같은 방식으로 이미 고쳐져 있다.
 */
describe('Dashboard collection cells refresh the last-collected time', () => {
  it('⭐ re-reads the dashboard collection times after 몰 주문수집 finishes', async () => {
    mocks.collectAllOrders.mockResolvedValue(undefined);
    const { result, client } = renderActions();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.start('collectAllOrders');
    });

    expect(mocks.collectAllOrders).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.collections() });
  });

  it('⭐ re-reads the dashboard collection times after 쿠팡 쉽먼트 finishes', async () => {
    mocks.collectShipments.mockResolvedValue({
      status: 'collected',
      items: [{ date: '2026-09-15', count: 3, boxes: 3 }],
      latest: { date: '2026-09-15', count: 3 },
    });
    const { result, client } = renderActions();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.start('collectCoupangShipmentSummary');
    });

    expect(mocks.collectShipments).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.collections() });
  });

  it('re-reads them for an empty 쿠팡 쉽먼트 sweep too — the attempt still finished', async () => {
    mocks.collectShipments.mockResolvedValue({ status: 'empty' });
    const { result, client } = renderActions();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.start('collectCoupangShipmentSummary');
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.collections() });
  });

  it('does not re-read them when the collection never ran', async () => {
    mocks.collectAllOrders.mockRejectedValue(new Error('현재 자동 수집 가능한 몰 계정이 없습니다.'));
    const { result, client } = renderActions();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await expect(result.current.start('collectAllOrders')).rejects.toThrow();
    });

    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.collections() });
  });
});
