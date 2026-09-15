import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { useDepartmentQuickActions } from './use-department-quick-actions';

const controls = vi.hoisted(() => {
  const view = () => ({
    state: 'idle' as const,
    statusRead: 'current' as const,
    running: null,
    canStop: false,
    notice: null,
    start: vi.fn(),
    stop: vi.fn(),
  });
  return { sellpia: view(), trend: view(), rocket: view() };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useAllMarketplaceOrderCollection', () => ({
  usePersistedAllMarketplaceOrderCollection: () => ({ collectAllOrders: vi.fn() }),
}));
vi.mock('@/hooks/useRocketChannelAccounts', () => ({
  useRocketChannelAccounts: () => ({ rocketAccounts: [], isBootstrapping: false }),
}));
vi.mock('@/lib/coupang-shipment-summary-action', () => ({ collectAndPersistCoupangShipmentSummary: vi.fn() }));
vi.mock('@/hooks/use-trend-source-collection', () => ({
  useTrendSourceCollection: () => ({ control: controls.trend, start: controls.trend.start }),
}));
vi.mock('@/hooks/use-rocket-po-source', () => ({ useRocketPoCollection: () => controls.rocket }));
vi.mock('@/app/(inventory)/_shared/sellpia-inventory-source-owner', () => ({
  useSellpiaInventoryCollection: () => ({
    control: controls.sellpia,
    state: null,
    isConfirming: false,
    confirmSourceBinding: vi.fn(),
  }),
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

describe('Dashboard inventory actions', () => {
  it('starts Sellpia inventory through its shared control and hands the cells the shared controls', async () => {
    const { result } = renderActions();

    await act(async () => {
      await result.current.start('syncSellpia');
    });

    expect(controls.sellpia.start).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(result.current.controls.syncSellpia).toBe(controls.sellpia);
    expect(result.current.controls.collectTrend).toBe(controls.trend);
    expect(result.current.controls.collectCoupangRocketPurchaseOrders).toBe(controls.rocket);
    expect(result.current.controls.refreshInventory).toBeUndefined();
  });

  it('re-reads the stock analysis for 재고 분석 and starts no collection', async () => {
    const { result, client } = renderActions();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.start('refreshInventory');
    });

    expect(controls.sellpia.start).not.toHaveBeenCalled();
    expect(controls.trend.start).not.toHaveBeenCalled();
    expect(controls.rocket.start).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.inventory.productSalesAll() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.channelSkuAvailability.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.inventory() });
    expect(toast.success).toHaveBeenCalledWith('재고 분석을 최신 수집 데이터로 다시 불러왔습니다.');
  });
});
