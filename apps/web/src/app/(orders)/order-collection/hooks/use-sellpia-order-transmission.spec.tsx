import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { SELLPIA_ORDER_TRANSFER_KIND } from '@kiditem/shared/orders-action-operations';
import { useSellpiaOrderTransmission } from './use-sellpia-order-transmission';
import type { StoredOrderCollectionFile } from '../lib/order-generated-file-store';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const start = vi.hoisted(() => ({ requestOperationStart: vi.fn() }));
const store = vi.hoisted(() => ({ saveGeneratedOrderFile: vi.fn(async () => undefined) }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/operation-start', () => start);
vi.mock('../lib/order-generated-file-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/order-generated-file-store')>()),
  saveGeneratedOrderFile: store.saveGeneratedOrderFile,
}));
vi.mock('sonner', () => ({ toast }));

const OPERATION = '11111111-1111-4111-8111-111111111111';
const SOURCE = '22222222-2222-4222-8222-222222222222';

function generatedFile(patch: Partial<StoredOrderCollectionFile> = {}): StoredOrderCollectionFile {
  return {
    id: 'orders-1',
    fileName: 'orders.xlsx',
    sourceName: 'orders.csv',
    blob: new Blob(['orders']),
    previewRows: [],
    sourceRows: 2,
    productRows: 1,
    outputRows: 2,
    skippedRows: 0,
    convertedAt: 100,
    mallName: '키드키즈',
    sourceOperationId: SOURCE,
    ...patch,
  };
}

function transfer(status: OperationView['status'], patch: Partial<OperationView> = {}): { operation: OperationView } {
  return {
    operation: {
      id: OPERATION,
      kind: SELLPIA_ORDER_TRANSFER_KIND,
      status,
      lockKeys: [],
      plan: null,
      progress: null,
      result: status === 'succeeded' ? { outcome: 'submitted', acceptedOrderNumbers: ['A1', 'A2'], targetOrderCount: 2 } : null,
      window: null,
      errorCode: null,
      errorMessage: null,
      startedAt: '2026-09-29T00:00:00.000Z',
      finishedAt: '2026-09-29T00:00:05.000Z',
      expiresAt: '2026-09-29T00:30:00.000Z',
      attempts: 1,
      maxAttempts: 1,
      scheduledFor: null,
      ...patch,
    },
  };
}

function render() {
  const onTransmissionRequested = vi.fn();
  const hook = renderHook(() => useSellpiaOrderTransmission({ onTransmissionRequested }));
  return { hook, onTransmissionRequested };
}

beforeEach(() => {
  vi.clearAllMocks();
  start.requestOperationStart.mockResolvedValue({ outcome: 'started', operationId: OPERATION });
});

describe('useSellpiaOrderTransmission (셀피아 전송 = 실행 orders.sellpia_order_transfer)', () => {
  it('원천 실행 id와 판매처로 전송 실행을 시작하고, 성공하면 전송 요청 시각을 기록한다', async () => {
    api.get.mockResolvedValueOnce(transfer('succeeded'));
    const { hook, onTransmissionRequested } = render();

    let transmitted = false;
    await act(async () => { transmitted = await hook.result.current.transmit(generatedFile()); });

    expect(transmitted).toBe(true);
    expect(start.requestOperationStart).toHaveBeenCalledWith(
      SELLPIA_ORDER_TRANSFER_KIND,
      { sourceOperationId: SOURCE, shopName: '키드키즈' },
      { capability: 'orderActionOperationKindsV1' },
    );
    expect(onTransmissionRequested).toHaveBeenCalledWith(expect.objectContaining({ transmissionRequestedAt: expect.any(Number) }));
    expect(store.saveGeneratedOrderFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'orders-1', transmissionRequestedAt: expect.any(Number) }));
    expect(toast.success).toHaveBeenCalledWith('셀피아 전송 요청됨 — 키드키즈 (접수 확인 2건)');
  });

  it('직배송 파일은 운송유형을 함께 싣는다', async () => {
    api.get.mockResolvedValueOnce(transfer('succeeded'));
    const { hook } = render();
    await act(async () => { await hook.result.current.transmit(generatedFile({ mallName: '쿠팡직배송 밀크런', transport: 'MILKRUN' })); });
    expect(start.requestOperationStart).toHaveBeenCalledWith(
      SELLPIA_ORDER_TRANSFER_KIND,
      { sourceOperationId: SOURCE, shopName: '쿠팡직배송 밀크런', transport: 'MILKRUN' },
      expect.anything(),
    );
  });

  it('원천 실행 id가 없는 옛 기록은 시작하지 않고 다시 수집하라고 말한다', async () => {
    const { hook } = render();
    let transmitted = true;
    await act(async () => { transmitted = await hook.result.current.transmit(generatedFile({ sourceOperationId: undefined })); });
    expect(transmitted).toBe(false);
    expect(start.requestOperationStart).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('다시 수집'));
  });

  it('제출했지만 확인하지 못한 전송(reconciling)은 확인 필요로 기록하고 전송 요청으로 적지 않는다', async () => {
    api.get.mockResolvedValueOnce(transfer('reconciling', { result: { outcome: 'submitted', acceptedOrderNumbers: [], targetOrderCount: 2 } }));
    const { hook, onTransmissionRequested } = render();

    let transmitted = true;
    await act(async () => { transmitted = await hook.result.current.transmit(generatedFile()); });

    expect(transmitted).toBe(false);
    expect(onTransmissionRequested).toHaveBeenCalledWith(expect.objectContaining({ sellpiaTransferConfirmationId: OPERATION }));
    expect(onTransmissionRequested.mock.calls[0]![0]).not.toHaveProperty('transmissionRequestedAt');
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('셀피아 확인 필요'), expect.anything());
  });

  it('셀피아가 접수하지 않은 전송(실패 finish)은 서버 문장을 보여 주고 기록을 바꾸지 않는다', async () => {
    api.get.mockResolvedValueOnce(transfer('failed', { errorCode: 'SELLPIA_TRANSFER_NOT_SUBMITTED', errorMessage: '셀피아가 주문을 접수하지 않았습니다.' }));
    const { hook, onTransmissionRequested } = render();
    await act(async () => { await hook.result.current.transmit(generatedFile()); });
    expect(toast.error).toHaveBeenCalledWith('셀피아가 주문을 접수하지 않았습니다.');
    expect(onTransmissionRequested).not.toHaveBeenCalled();
    expect(store.saveGeneratedOrderFile).not.toHaveBeenCalled();
  });

  it('확인 필요 행을 운영자가 접수됨으로 확인하면 전송 요청으로 적고 확인 표시를 지운다', async () => {
    api.post.mockResolvedValueOnce(transfer('succeeded'));
    const { hook, onTransmissionRequested } = render();
    await act(async () => { await hook.result.current.confirmTransfer(generatedFile({ sellpiaTransferConfirmationId: OPERATION })); });
    expect(api.post).toHaveBeenCalledWith(`/api/orders/action-operations/${OPERATION}/confirm`, {});
    const updated = onTransmissionRequested.mock.calls[0]![0] as StoredOrderCollectionFile;
    expect(updated.transmissionRequestedAt).toEqual(expect.any(Number));
    expect(updated).not.toHaveProperty('sellpiaTransferConfirmationId');
  });

  it('확인 필요 행을 미접수로 닫으면 확인 표시만 지워 다시 보낼 수 있게 한다', async () => {
    api.post.mockResolvedValueOnce(transfer('failed'));
    const { hook, onTransmissionRequested } = render();
    await act(async () => { await hook.result.current.closeTransfer(generatedFile({ sellpiaTransferConfirmationId: OPERATION })); });
    expect(api.post).toHaveBeenCalledWith(`/api/orders/action-operations/${OPERATION}/close`, { reason: '운영자가 셀피아에서 확인: 접수되지 않음' });
    const updated = onTransmissionRequested.mock.calls[0]![0] as StoredOrderCollectionFile;
    expect(updated).not.toHaveProperty('sellpiaTransferConfirmationId');
    expect(updated).not.toHaveProperty('transmissionRequestedAt');
  });
});
