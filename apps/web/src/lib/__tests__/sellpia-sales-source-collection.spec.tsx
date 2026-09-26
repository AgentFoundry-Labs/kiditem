import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { detectBrowserCollectionExtensionIds, detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaOperationsQueryKey } from '@/lib/sellpia-operations';
import {
  sellpiaSalesCollection,
  sellpiaSalesReadinessRange,
} from '@/lib/sellpia-sales-source-collection';
import { SELLPIA_OPERATION_PING, sellpiaOperation } from '@/test/fixtures/sellpia-operations';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));

// 셀피아 판매현황 = 실행 kind analytics.sellpia_sales(KID-361 J2). 시작은 확장 operation.start, 상태는 실행 reader.
const OPERATIONS_PATH = '/api/operations?kinds=analytics.sellpia_sales&limit=20';
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const RANGE = { from: '2026-07-12', to: '2026-07-15' };

const salesOperation = (overrides: Partial<OperationView> = {}) => sellpiaOperation({
  id: OPERATION_ID,
  kind: 'analytics.sellpia_sales',
  plan: { sourceOrigin: 'https://kiditem.sellpia.com', sourcePath: '/sale_summary.html?mode=main_link', range: RANGE },
  window: { start: RANGE.from, end: RANGE.to },
  ...overrides,
});

let operations: OperationView[];
let startReply: Record<string, unknown>;

function SalesControl({ label, range }: { label: string; range?: { from: string; to: string } }) {
  const control = useCollectionSourceControl(sellpiaSalesCollection);
  return (
    <section aria-label={label}>
      <CollectionStartControl
        control={control}
        startLabel="매출 받기"
        onStart={() => control.start(range)}
        onStop={control.stop}
      />
    </section>
  );
}

function renderControls(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

function extensionMessages(action: string) {
  return vi.mocked(sendToExtension).mock.calls.filter(([, message]) => (message as { action: string }).action === action);
}

beforeEach(() => {
  vi.clearAllMocks();
  operations = [];
  startReply = { success: true, operationId: OPERATION_ID, reused: false };
  vi.mocked(detectExtensionId).mockResolvedValue('ext');
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue(['ext']);
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
    const action = (message as { action: string }).action;
    if (action === 'ping') return SELLPIA_OPERATION_PING;
    if (action === 'operation.start') {
      if (startReply.success) operations = [salesOperation()];
      return startReply;
    }
    if (action === 'operation.cancel') return { success: true };
    throw new Error(`unexpected ${action}`);
  });
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === OPERATIONS_PATH) return { operations };
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === `/api/operations/${OPERATION_ID}/cancel`) {
      operations = [salesOperation({ status: 'cancelled', errorCode: 'USER_CANCELLED' })];
      return { operation: operations[0] };
    }
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('Sellpia sales collection control', () => {
  it('화면이 준 범위로 실행 하나를 시작시키고 모든 사본이 그 창을 도는 실행으로 보인다', async () => {
    renderControls(
      <>
        <SalesControl label="first" range={RANGE} />
        <SalesControl label="second" range={RANGE} />
      </>,
    );
    fireEvent.click(await within(screen.getByRole('region', { name: 'first' })).findByRole('button', { name: '매출 받기' }));

    await waitFor(() => expect(screen.getAllByRole('button', { name: '수집 중단' })).toHaveLength(2));
    expect(extensionMessages('operation.start')).toEqual([
      ['ext', { action: 'operation.start', kind: 'analytics.sellpia_sales', scope: { startDate: RANGE.from, endDate: RANGE.to } }, 60_000],
    ]);
    expect(screen.getAllByText(/2026-07-12 ~ 2026-07-15/).length).toBeGreaterThan(0);
  });

  it('범위를 주지 않으면 빈 scope로 owner 기본 창을 쓴다', async () => {
    renderControls(<SalesControl label="only" />);
    fireEvent.click(await screen.findByRole('button', { name: '매출 받기' }));
    await waitFor(() => expect(extensionMessages('operation.start')).toHaveLength(1));
    expect(extensionMessages('operation.start')[0]?.[1]).toMatchObject({ scope: {} });
  });

  it('다른 셀피아 실행이 로그인을 쥐고 있으면 서버 문장으로 거절을 보인다', async () => {
    startReply = { success: false, errorCode: 'OPERATION_IN_PROGRESS', error: '같은 셀피아 로그인을 쓰는 다른 실행이 진행 중입니다.' };
    renderControls(<SalesControl label="only" range={RANGE} />);
    fireEvent.click(await screen.findByRole('button', { name: '매출 받기' }));
    expect(await screen.findByText('같은 셀피아 로그인을 쓰는 다른 실행이 진행 중입니다.')).toBeInTheDocument();
  });

  it('도는 실행을 실행 id로 멈춘다(확장 cancel 뒤 서버 cancel)', async () => {
    operations = [salesOperation()];
    renderControls(<SalesControl label="only" range={RANGE} />);
    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));
    expect(await screen.findByRole('button', { name: '매출 받기' })).toBeEnabled();
    expect(extensionMessages('operation.cancel')).toEqual([['ext', { action: 'operation.cancel', operationId: OPERATION_ID }]]);
  });

  it('새 성공 실행이 보일 때만 매출·readiness·Wing 일매출 읽기를 새로 한다', async () => {
    operations = [salesOperation({ id: '22222222-2222-4222-8222-222222222222', status: 'succeeded' })];
    const { client } = renderControls(<SalesControl label="only" />);
    const salesKey = queryKeys.dashboard.sellpiaSalesAll();
    const readinessKey = ['readiness', 'status'];
    const trafficKey = ['traffic', 'daily'];
    for (const key of [salesKey, readinessKey, trafficKey]) client.setQueryData(key, { ready: true });
    expect(await screen.findByRole('button', { name: '매출 받기' })).toBeEnabled();

    await act(() => client.refetchQueries({ queryKey: sellpiaOperationsQueryKey('analytics.sellpia_sales') }));
    expect(client.getQueryState(salesKey)?.isInvalidated).toBe(false);

    operations = [salesOperation({ status: 'succeeded' }), ...operations];
    await act(() => client.refetchQueries({ queryKey: sellpiaOperationsQueryKey('analytics.sellpia_sales') }));
    await waitFor(() => expect(client.getQueryState(salesKey)?.isInvalidated).toBe(true));
    expect(client.getQueryState(readinessKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(trafficKey)?.isInvalidated).toBe(true);
  });
});

describe('sellpiaSalesReadinessRange', () => {
  it('collects only the missing span through the day after the readiness reference', () => {
    expect(sellpiaSalesReadinessRange({
      referenceDate: '2026-07-14',
      expectedDates: ['2026-07-12', '2026-07-13', '2026-07-14'],
      missingDates: ['2026-07-14', '2026-07-12'],
    })).toEqual({ from: '2026-07-12', to: '2026-07-15' });
  });

  it('does not expand a first-of-month repair into the entire prior month', () => {
    expect(sellpiaSalesReadinessRange({
      referenceDate: '2026-06-30',
      expectedDates: ['2026-06-17', '2026-06-30', '2026-07-01'],
      missingDates: ['2026-07-01'],
    })).toEqual({ from: '2026-07-01', to: '2026-07-01' });
  });

  it("leaves the range to the owner when readiness names no date", () => {
    expect(sellpiaSalesReadinessRange({ referenceDate: null, expectedDates: [], missingDates: [] }))
      .toBeUndefined();
  });
});
