import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 서버 경계(apiClient)만 가짜로 둔다. 수집 시작·중단(세션 컨트롤)과 변환 절차는 이 훅이 부르는 바깥 문이라 기록만 한다.
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';
import type { OrderCollectionExtensionRun } from '../lib/order-collection-extension';
import { useCoupangDirectshipCalendar } from './use-coupang-directship-calendar';

const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const SNAPSHOT_OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const FRESH_OPERATION_ID = '22222222-2222-4222-8222-222222222222';
const account = { key: 'coupang-direct', name: '쿠팡직배송' } as OrderCollectionMallAccount;

const capturedPo = {
  seq: 'PO-1', status: 'PA', center: 'Seoul FC', transport: 'SHIPMENT', edd: '2026-07-31', reg: '2026-07-30 09:00:00',
  items: [{ skuId: 'P-1', barcode: '8801234567890', name: '상품', qty: 2, amount: 2000 }],
};
const capture = { channelAccountId: ACCOUNT_ID, pos: [capturedPo], centers: { 'Seoul FC': { addr: 'Seoul' } } };

function snapshot(operationId: string | null) {
  return {
    channelAccountId: ACCOUNT_ID,
    operationId,
    collectedAt: operationId ? '2026-07-30T01:05:00.000Z' : null,
    entries: operationId
      ? [{
        purchaseOrderSeq: 'PO-1', centerName: 'Seoul FC', transport: 'SHIPMENT', deliveryDate: '2026-07-31', orderedDate: '2026-07-30',
        isUrgent: false, skuCount: 1, orderQuantity: 2, orderAmount: 2000,
        items: [{ barcode: '8801234567890', name: '상품', qty: 2, amount: 2000 }],
      }]
      : [],
  };
}

function succeededOperation(id: string) {
  return {
    operation: {
      id, kind: 'orders.coupang_directship', status: 'succeeded', plan: { channelAccountId: ACCOUNT_ID },
      startedAt: '2026-07-30T01:00:00.000Z', expiresAt: null, finishedAt: '2026-07-30T01:05:00.000Z', errorCode: null, errorMessage: null,
    },
  };
}

function freshRun(): OrderCollectionExtensionRun {
  return { attemptId: FRESH_OPERATION_ID, attemptToken: FRESH_OPERATION_ID, extensionId: 'ext', date: null, signal: new AbortController().signal, sourceOwner: 'coupang_directship' };
}

function setup(stored: string | null) {
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/orders/collection/coupang-directship/snapshot?')) return snapshot(stored);
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
    const operation = /^\/api\/operations\/([0-9a-f-]+)$/.exec(path);
    if (operation) return succeededOperation(operation[1]!);
    if (/^\/api\/orders\/collection\/coupang-directship\/operations\/[0-9a-f-]+\/capture$/.test(path)) return capture;
    throw new Error(`unexpected GET ${path}`);
  });
  const sessionControls = {
    prepareDirectRun: vi.fn(async () => freshRun()),
    cancelRun: vi.fn(async () => true),
    releaseRun: vi.fn(),
    failRunUnlessStopped: vi.fn(async () => true),
    syncRun: vi.fn(async () => undefined),
  };
  const collect = vi.fn(async () => undefined);
  const hook = renderHook(() => useCoupangDirectshipCalendar({
    channelAccountId: ACCOUNT_ID,
    sessionControls,
    collect,
    alreadyRunning: () => false,
  }));
  return { hook, sessionControls, collect };
}

describe('useCoupangDirectshipCalendar (KID-198)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opening reads the latest capture and starts no operation', async () => {
    const { hook, sessionControls } = setup(SNAPSHOT_OPERATION_ID);
    await act(async () => { await hook.result.current.open(account); });
    expect(apiClient.get).toHaveBeenCalledWith(`/api/orders/collection/coupang-directship/snapshot?channelAccountId=${ACCOUNT_ID}`);
    expect(hook.result.current.calendar).toMatchObject({
      operationId: SNAPSHOT_OPERATION_ID,
      collectedAt: '2026-07-30T01:05:00.000Z',
      loading: false,
      refreshing: false,
      pos: [{ seq: 'PO-1', edd: '2026-07-31', transport: 'SHIPMENT' }],
    });
    expect(sessionControls.prepareDirectRun).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('an account with no capture opens empty; asking to collect starts one operation and shows its capture', async () => {
    const { hook, sessionControls } = setup(null);
    await act(async () => { await hook.result.current.open(account); });
    expect(hook.result.current.calendar).toMatchObject({ operationId: null, pos: [], loading: false });
    expect(sessionControls.prepareDirectRun).not.toHaveBeenCalled();

    await act(async () => { await hook.result.current.refresh(); });
    expect(sessionControls.prepareDirectRun).toHaveBeenCalledTimes(1);
    expect(sessionControls.prepareDirectRun).toHaveBeenCalledWith(account);
    await waitFor(() => expect(hook.result.current.calendar).toMatchObject({
      operationId: FRESH_OPERATION_ID,
      refreshing: false,
      pos: [{ seq: 'PO-1' }],
    }));
  });

  // 수집·변환은 늘 쿠팡에서 새로 받은 값으로 한다(옛 규칙 유지): 보이는 캡처가 아무리 최근이어도 새 실행을 먼저 연다.
  it('collecting picked dates first captures anew and converts against the new operation, never the displayed one', async () => {
    const { hook, sessionControls, collect } = setup(SNAPSHOT_OPERATION_ID);
    await act(async () => { await hook.result.current.open(account); });
    await act(async () => { await hook.result.current.collect(['2026-07-31']); });
    expect(sessionControls.prepareDirectRun).toHaveBeenCalledTimes(1);
    expect(sessionControls.prepareDirectRun).toHaveBeenCalledWith(account);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(collect).toHaveBeenCalledWith(account, FRESH_OPERATION_ID, {
      eddDates: ['2026-07-31'],
      data: { pos: capture.pos, centers: capture.centers },
    });
    expect(JSON.stringify(collect.mock.calls)).not.toContain(SNAPSHOT_OPERATION_ID);
    expect(vi.mocked(apiClient.getParsed).mock.calls.map(([path]) => path).join(' ')).not.toContain(SNAPSHOT_OPERATION_ID);
    expect(hook.result.current.calendar).toBeNull();
  });

  it('shows the capture in progress while collecting', async () => {
    const { hook, sessionControls } = setup(SNAPSHOT_OPERATION_ID);
    let finishPrepare: (run: OrderCollectionExtensionRun) => void = () => undefined;
    sessionControls.prepareDirectRun.mockImplementationOnce(() => new Promise((resolve) => { finishPrepare = resolve; }));
    await act(async () => { await hook.result.current.open(account); });
    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = hook.result.current.collect(['2026-07-31']); });
    expect(hook.result.current.calendar?.refreshing).toBe(true);
    await act(async () => { finishPrepare(freshRun()); await pending; });
    expect(hook.result.current.calendar).toBeNull();
  });

  it('converts only the picked dates the new capture still has, and names the ones that are gone', async () => {
    const { hook, collect } = setup(SNAPSHOT_OPERATION_ID);
    await act(async () => { await hook.result.current.open(account); });
    await act(async () => { await hook.result.current.collect(['2026-07-31', '2026-08-01']); });
    expect(collect).toHaveBeenCalledWith(account, FRESH_OPERATION_ID, expect.objectContaining({ eddDates: ['2026-07-31'] }));
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('2026-08-01'));
  });

  it('converts nothing when none of the picked dates is left in the new capture', async () => {
    const { hook, collect } = setup(SNAPSHOT_OPERATION_ID);
    await act(async () => { await hook.result.current.open(account); });
    await act(async () => { await hook.result.current.collect(['2026-08-01']); });
    expect(collect).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('2026-08-01'));
    expect(hook.result.current.calendar).toMatchObject({ operationId: FRESH_OPERATION_ID, refreshing: false });
  });

  it('a failed capture converts nothing and keeps the calendar open', async () => {
    const { hook, sessionControls, collect } = setup(SNAPSHOT_OPERATION_ID);
    sessionControls.prepareDirectRun.mockRejectedValueOnce(new Error('확장 없음'));
    await act(async () => { await hook.result.current.open(account); });
    await act(async () => { await hook.result.current.collect(['2026-07-31']); });
    expect(collect).not.toHaveBeenCalled();
    expect(hook.result.current.calendar).toMatchObject({ operationId: SNAPSHOT_OPERATION_ID, refreshing: false });
  });

  it('closing without a running read cancels nothing; closing during a read stops that operation', async () => {
    const { hook, sessionControls } = setup(SNAPSHOT_OPERATION_ID);
    await act(async () => { await hook.result.current.open(account); });
    act(() => { hook.result.current.close(); });
    expect(sessionControls.cancelRun).not.toHaveBeenCalled();

    // 확장이 아직 캡처 중인 실행: 닫으면 그 실행을 멈춘다(이 브라우저 절차도 끊는다).
    const controller = new AbortController();
    sessionControls.prepareDirectRun.mockResolvedValueOnce({ ...freshRun(), signal: controller.signal });
    sessionControls.cancelRun.mockImplementationOnce(async () => { controller.abort(); return true; });
    vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
      if (path.startsWith('/api/operations/')) return { operation: { ...succeededOperation(FRESH_OPERATION_ID).operation, status: 'executing', finishedAt: null } };
      throw new Error(`unexpected GET ${path}`);
    });
    await act(async () => { await hook.result.current.open(account); });
    act(() => { void hook.result.current.refresh(); });
    await waitFor(() => expect(hook.result.current.calendar?.refreshing).toBe(true));
    await waitFor(() => expect(apiClient.getParsed).toHaveBeenCalled());
    act(() => { hook.result.current.close(); });
    expect(sessionControls.cancelRun).toHaveBeenCalledWith(account);
    expect(hook.result.current.calendar).toBeNull();
  });

  it('a finished read releases its run so the next read starts a fresh operation', async () => {
    const { hook, sessionControls } = setup(null);
    await act(async () => { await hook.result.current.open(account); });
    await act(async () => { await hook.result.current.refresh(); });
    await waitFor(() => expect(sessionControls.syncRun).toHaveBeenCalledWith(FRESH_OPERATION_ID));
    act(() => { hook.result.current.close(); });
    expect(sessionControls.cancelRun).not.toHaveBeenCalled();
  });
});
