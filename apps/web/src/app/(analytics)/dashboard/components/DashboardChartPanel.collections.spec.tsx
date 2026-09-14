import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import {
  useCollectionSourceControl,
  type CollectionSourceAdapter,
} from '@/hooks/use-collection-source-control';
import { DashboardChartPanel } from './DashboardChartPanel';

type SellpiaStatus = { running: boolean };

const harness = vi.hoisted(() => {
  const state = { running: false, refusal: null as string | null };
  const sellpia: CollectionSourceAdapter<SellpiaStatus> = {
    sourceKey: 'inventory.sellpia',
    label: '셀피아 재고 수집',
    statusQuery: {
      queryKey: ['dashboard-panel-spec', 'sellpia-status'],
      queryFn: async () => ({ running: state.running }),
    },
    readRunning: (status) => (status.running ? { attemptId: 'attempt-1', scopeLabel: null } : null),
    start: vi.fn(async () => {
      if (state.refusal) return { outcome: 'refused' as const, message: state.refusal };
      state.running = true;
      return { outcome: 'started' as const, attemptId: 'attempt-1' };
    }),
    cancelOnServer: vi.fn(async () => {
      state.running = false;
    }),
  };
  return { state, sellpia, start: vi.fn() };
});

vi.mock('next/dynamic', () => ({ default: () => function DashboardChartsStub() { return null; } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('./DashboardDataBasis', () => ({ DashboardBasisDisclosure: () => null }));
vi.mock('../hooks/use-collection-freshness', () => ({
  useCollectionFreshness: () => (action: string) =>
    action === 'collectTrend' || action === 'refreshInventory' ? null : { label: '미수집' },
}));
vi.mock('@/lib/browser-collection-session', () => ({
  // No extension session holds the attempt, so a stop reaches the owner route.
  sendBrowserCollectionControl: vi.fn(async () => {
    throw new Error('no extension session');
  }),
}));
vi.mock('../hooks/use-department-quick-actions', async () => {
  const control = await import('@/hooks/use-collection-source-control');
  return {
    useDepartmentQuickActions: () => {
      const syncSellpia = control.useCollectionSourceControl(harness.sellpia);
      return {
        start: async (action: string) => {
          if (action === 'syncSellpia') {
            syncSellpia.start();
            return;
          }
          return harness.start(action);
        },
        controls: { syncSellpia },
      };
    },
  };
});

function InventoryScreenControl() {
  const control = useCollectionSourceControl(harness.sellpia);
  return (
    <section aria-label="재고 화면">
      <CollectionStartControl
        control={control}
        startLabel="셀피아 재고 수집"
        onStart={() => control.start()}
        onStop={control.stop}
      />
    </section>
  );
}

function renderPanel(extra?: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <section aria-label="대시보드 수집">
        <DashboardChartPanel dailyTrend={[]} rangeLabel="최근 30일" />
      </section>
      {extra}
    </QueryClientProvider>,
  );
  return within(screen.getByRole('region', { name: '대시보드 수집' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.state.running = false;
  harness.state.refusal = null;
  harness.start.mockResolvedValue(undefined);
});

describe('DashboardChartPanel collection cells', () => {
  it('runs the order and shipment collections side by side without a one-at-a-time lock', async () => {
    harness.start.mockImplementation((action: string) =>
      action === 'collectAllOrders' ? new Promise(() => undefined) : Promise.resolve());
    const dashboard = renderPanel();

    fireEvent.click(dashboard.getByRole('button', { name: /몰 주문수집/ }));

    expect(await dashboard.findByText('수집 중…')).toBeInTheDocument();
    const shipment = dashboard.getByRole('button', { name: /쿠팡 쉽먼트/ });
    expect(shipment).toBeEnabled();
    fireEvent.click(shipment);
    fireEvent.click(dashboard.getByRole('button', { name: /몰 주문수집/ }));

    await waitFor(() => expect(harness.start.mock.calls).toEqual([
      ['collectAllOrders'],
      ['collectCoupangShipmentSummary'],
    ]));
  });

  it('shows the Sellpia collection another screen started and stops it from its cell', async () => {
    const dashboard = renderPanel(<InventoryScreenControl />);
    const inventory = within(screen.getByRole('region', { name: '재고 화면' }));

    fireEvent.click(await inventory.findByRole('button', { name: '셀피아 재고 수집' }));

    await waitFor(() => expect(dashboard.getByRole('button', { name: /셀피아 동기화/ })).toBeDisabled());
    expect(dashboard.getByText('수집 중')).toBeInTheDocument();
    expect(inventory.getByText('수집 중')).toBeInTheDocument();
    expect(harness.sellpia.start).toHaveBeenCalledTimes(1);

    fireEvent.click(dashboard.getByRole('button', { name: '수집 중단' }));

    await waitFor(() => expect(harness.sellpia.cancelOnServer).toHaveBeenCalledWith('attempt-1', {
      status: { running: true },
    }));
    expect(await inventory.findByRole('button', { name: '셀피아 재고 수집' })).toBeEnabled();
    await waitFor(() => expect(dashboard.getByRole('button', { name: /셀피아 동기화/ })).toBeEnabled());
  });

  it("names the shared control's refusal in its cell and lets the operator ask again", async () => {
    harness.state.refusal = '다른 브라우저에서 셀피아 재고 수집이 진행 중입니다.';
    const dashboard = renderPanel();
    const cell = dashboard.getByRole('button', { name: /셀피아 동기화/ });
    await waitFor(() => expect(cell).toBeEnabled());

    fireEvent.click(cell);

    expect(await dashboard.findByText('다른 브라우저에서 셀피아 재고 수집이 진행 중입니다.')).toBeInTheDocument();
    expect(dashboard.getByRole('button', { name: /셀피아 동기화/ })).toBeEnabled();
  });

  it('keeps 재고 분석 a re-read of collected data rather than a collection', async () => {
    harness.start.mockImplementation(() => new Promise(() => undefined));
    const dashboard = renderPanel();
    expect(dashboard.getByRole('button', { name: /재고 분석/ })).toHaveTextContent('수집이 아닌 재계산');

    fireEvent.click(dashboard.getByRole('button', { name: /재고 분석/ }));

    await waitFor(() => expect(harness.start).toHaveBeenCalledWith('refreshInventory'));
    expect(dashboard.getByRole('button', { name: /재고 분석/ })).toHaveTextContent('다시 불러오는 중…');
    expect(dashboard.queryByText('수집 중…')).not.toBeInTheDocument();
    expect(harness.sellpia.start).not.toHaveBeenCalled();
  });

  it('reports a start that failed in Korean and frees only that cell', async () => {
    harness.start.mockRejectedValueOnce(new Error('쿠팡 로켓 계정을 먼저 연결해주세요.'));
    const dashboard = renderPanel();

    fireEvent.click(dashboard.getByRole('button', { name: /쿠팡 로켓 PO/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('쿠팡 로켓 계정을 먼저 연결해주세요.'));
    expect(dashboard.getByRole('button', { name: /쿠팡 로켓 PO/ })).toBeEnabled();
  });
});
