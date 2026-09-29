import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import {
  COUPANG_SHIPMENT_LIST_KIND,
  MALL_TRACKING_UPLOAD_KIND,
  ORDERS_ACTION_OPERATION_CAPABILITY,
  SELLPIA_AUTO_INVOICE_KIND,
  SELLPIA_ORDER_SNAPSHOT_KIND,
  SELLPIA_ORDER_TRANSFER_KIND,
  SELLPIA_POST_TRANSFER_KIND,
} from '@kiditem/shared/orders-action-operations';
import { apiClient } from './api-client';
import { requestOperationStart } from './operation-start';
import { operationLoginOptions } from './operation-login';
import {
  closeOrderActionOperation,
  readCoupangShipmentList,
  confirmOrderActionOperation,
  OrderActionFailure,
  OrderActionStillRunning,
  readSellpiaOrderSnapshot,
  runSellpiaAutoInvoice,
  runSellpiaPostTransfer,
  startSellpiaOrderTransfer,
  uploadMallTracking,
} from './order-action-operations';

vi.mock('./api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./operation-start', () => ({ requestOperationStart: vi.fn() }));
vi.mock('./operation-login', () => ({
  operationLoginOptions: vi.fn(async () => ({})),
  noteOperationLoginFailureForMall: vi.fn(),
  ROCKET_LOGIN_MALL_KEY: 'coupang-direct',
}));

const ID = '11111111-1111-4111-8111-111111111111';
const SOURCE = '22222222-2222-4222-8222-222222222222';
const ACCOUNT = '33333333-3333-4333-8333-333333333333';
const noSleep = { sleep: async () => undefined };

function operation(kind: OperationView['kind'], status: OperationView['status'], patch: Partial<OperationView> = {}): OperationView {
  return {
    id: ID,
    kind,
    status,
    lockKeys: [],
    plan: null,
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-29T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-29T00:00:05.000Z',
    expiresAt: '2026-09-29T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestOperationStart).mockResolvedValue({ outcome: 'started', operationId: ID });
});

describe('order action operations (KID-366 wave8b)', () => {
  it('셀피아 전송은 원천 실행 id와 판매처로 시작하고, 이 kind를 도는 빌드(orderActionOperationKindsV1)에만 보낸다', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ operation: operation(SELLPIA_ORDER_TRANSFER_KIND, 'executing') })
      .mockResolvedValueOnce({ operation: operation(SELLPIA_ORDER_TRANSFER_KIND, 'succeeded', {
        result: { outcome: 'submitted', acceptedOrderNumbers: ['A1', 'A2'], targetOrderCount: 2 },
      }) });

    const outcome = await startSellpiaOrderTransfer({ sourceOperationId: SOURCE, shopName: '아이스크림몰' }, noSleep);

    expect(requestOperationStart).toHaveBeenCalledWith(
      SELLPIA_ORDER_TRANSFER_KIND,
      { sourceOperationId: SOURCE, shopName: '아이스크림몰' },
      { capability: ORDERS_ACTION_OPERATION_CAPABILITY },
    );
    expect(outcome).toEqual({
      status: 'succeeded',
      operationId: ID,
      result: { outcome: 'submitted', acceptedOrderNumbers: ['A1', 'A2'], targetOrderCount: 2 },
    });
  });

  it('제출했지만 확인하지 못한 실행(reconciling)은 기다림을 멈추고 확인 필요로 돌려준다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(SELLPIA_AUTO_INVOICE_KIND, 'reconciling', {
      result: { issued: [], selectedOrderNumbers: ['A1'], notFoundOrderNumbers: [] },
    }) });
    await expect(runSellpiaAutoInvoice(noSleep)).resolves.toEqual({ status: 'needs_confirmation', operationId: ID });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('실패로 끝난 실행은 서버 등록 코드와 운영자 문장을 담아 던진다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(SELLPIA_ORDER_TRANSFER_KIND, 'failed', {
      errorCode: 'SELLPIA_TRANSFER_NOT_SUBMITTED',
      errorMessage: '셀피아가 주문을 접수하지 않았습니다.',
    }) });
    const error = await startSellpiaOrderTransfer({ sourceOperationId: SOURCE, shopName: '온채널' }, noSleep).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OrderActionFailure);
    expect(error).toMatchObject({ code: 'SELLPIA_TRANSFER_NOT_SUBMITTED', message: '셀피아가 주문을 접수하지 않았습니다.' });
  });

  it('성공했는데 result가 계약 모양이 아니면 성공으로 보지 않는다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(SELLPIA_ORDER_TRANSFER_KIND, 'succeeded', { result: { outcome: 'unknown' } }) });
    await expect(startSellpiaOrderTransfer({ sourceOperationId: SOURCE, shopName: '온채널' }, noSleep)).rejects.toThrow('결과를 읽지 못했습니다');
  });

  it('같은 잠금의 다른 실행이 돌면 서버 문장으로 거절한다', async () => {
    vi.mocked(requestOperationStart).mockResolvedValueOnce({ outcome: 'refused', message: '셀피아 작업이 이미 진행 중입니다.' });
    await expect(runSellpiaAutoInvoice(noSleep)).rejects.toThrow('셀피아 작업이 이미 진행 중입니다.');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('기다림 상한을 넘기면 실행 id를 담아 아직 도는 중이라고 알린다', async () => {
    let clock = 0;
    vi.mocked(apiClient.get).mockResolvedValue({ operation: operation(SELLPIA_AUTO_INVOICE_KIND, 'executing') });
    const error = await runSellpiaAutoInvoice({
      sleep: async () => { clock += 10_000; },
      now: () => clock,
      timeoutMs: 15_000,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OrderActionStillRunning);
    expect(error).toMatchObject({ operationId: ID });
  });

  it('쿠팡 배송 목록은 발송일로 시작하고 로켓 계정 저장 자격을 싣는다', async () => {
    vi.mocked(operationLoginOptions).mockResolvedValueOnce({ loginBlocked: true });
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(COUPANG_SHIPMENT_LIST_KIND, 'succeeded', {
      result: {
        date: '2026-09-29',
        shipments: [{ seq: '101', center: '평택1', outbound: '2026-09-29', boxes: 3, status: null }],
        scannedPages: 2,
        stopReason: 'past_date_block',
      },
    }) });

    const result = await readCoupangShipmentList('2026-09-29', noSleep);

    expect(operationLoginOptions).toHaveBeenCalledWith('coupang-direct');
    expect(requestOperationStart).toHaveBeenCalledWith(
      COUPANG_SHIPMENT_LIST_KIND,
      { date: '2026-09-29' },
      { capability: ORDERS_ACTION_OPERATION_CAPABILITY, loginBlocked: true },
    );
    expect(result.shipments.map((row) => row.center)).toEqual(['평택1']);
  });

  it('송장 업로드는 계정·몰·송장 조회 실행 id로 시작하고, 그 몰의 저장 자격을 시작 요청에만 싣는다', async () => {
    vi.mocked(operationLoginOptions).mockResolvedValueOnce({ credentials: { loginId: 'fixture-id', password: 'fixture-value' } });
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(MALL_TRACKING_UPLOAD_KIND, 'succeeded', {
      result: { uploaded: 1, alreadyUploaded: 0, notInList: 0, failed: 0, rows: [{ orderNo: 'A1', status: 'uploaded', mallMessage: null }] },
    }) });
    const scope = { channelAccountId: ACCOUNT, mallKey: 'onch' as const, trackingOperationId: SOURCE };
    await expect(uploadMallTracking(scope, noSleep)).resolves.toMatchObject({ status: 'succeeded', result: { uploaded: 1 } });
    expect(operationLoginOptions).toHaveBeenCalledWith('onch');
    expect(requestOperationStart).toHaveBeenCalledWith(MALL_TRACKING_UPLOAD_KIND, scope, {
      capability: ORDERS_ACTION_OPERATION_CAPABILITY,
      credentials: { loginId: 'fixture-id', password: 'fixture-value' },
    });
  });

  it('확인 필요 실행은 Orders 라우트로 확인하거나 닫는다', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ operation: operation(SELLPIA_AUTO_INVOICE_KIND, 'succeeded') });
    await confirmOrderActionOperation(ID);
    expect(apiClient.post).toHaveBeenCalledWith(`/api/orders/action-operations/${ID}/confirm`, {});
    await closeOrderActionOperation(ID, '운영자가 셀피아에서 확인: 발급되지 않음');
    expect(apiClient.post).toHaveBeenCalledWith(`/api/orders/action-operations/${ID}/close`, { reason: '운영자가 셀피아에서 확인: 발급되지 않음' });
  });

  describe('확인을 기다리는 실행이 잠금을 쥔 채 남은 경우 (reconciling은 만료되지 않는다)', () => {
    const EXISTING = '44444444-4444-4444-8444-444444444444';

    it('같은 작업이 확인을 기다리면 시작 거절의 그 실행을 읽어 확인 필요로 다시 돌려준다', async () => {
      vi.mocked(requestOperationStart).mockResolvedValueOnce({ outcome: 'refused', message: '진행 중입니다.', existingOperationId: EXISTING });
      vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: { ...operation(SELLPIA_AUTO_INVOICE_KIND, 'reconciling'), id: EXISTING } });

      await expect(runSellpiaAutoInvoice(noSleep)).resolves.toEqual({ status: 'needs_confirmation', operationId: EXISTING });
      expect(apiClient.get).toHaveBeenCalledWith(`/api/operations/${EXISTING}`);
    });

    it('다른 파일의 전송이 확인을 기다리면 이 파일의 확인으로 삼지 않고 그 작업을 먼저 확인하라고 말한다', async () => {
      vi.mocked(requestOperationStart).mockResolvedValueOnce({ outcome: 'refused', message: '진행 중입니다.', existingOperationId: EXISTING });
      vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: {
        ...operation(SELLPIA_ORDER_TRANSFER_KIND, 'reconciling'),
        id: EXISTING,
        plan: { sourceOperationId: ACCOUNT, shopName: '온채널', transport: null, fileName: 'a.xls', targetOrderNumbers: ['A1'] },
      } });

      await expect(startSellpiaOrderTransfer({ sourceOperationId: SOURCE, shopName: '온채널' }, noSleep))
        .rejects.toThrow('셀피아 주문 전송 작업이 확인을 기다리며');
    });

    it('시작하자마자 실행 id를 알려 기다림이 끊겨도 기록이 그 실행을 다시 읽을 수 있게 한다', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(SELLPIA_ORDER_TRANSFER_KIND, 'succeeded', {
        result: { outcome: 'submitted', acceptedOrderNumbers: [], targetOrderCount: 1 },
      }) });
      const onStarted = vi.fn();
      await startSellpiaOrderTransfer({ sourceOperationId: SOURCE, shopName: '온채널' }, { ...noSleep, onStarted });
      expect(onStarted).toHaveBeenCalledWith(ID);
    });
  });

  it('후처리는 확인 단계가 없는 작업이라 성공 result만 돌려준다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(SELLPIA_POST_TRANSFER_KIND, 'succeeded', {
      result: { registered: true, stockMatched: true, unmatchedOrderNumbers: [], invoiceTargetCount: 3 },
    }) });
    await expect(runSellpiaPostTransfer(noSleep)).resolves.toEqual({ registered: true, stockMatched: true, unmatchedOrderNumbers: [], invoiceTargetCount: 3 });
  });

  it('셀피아 주문 스냅샷은 result의 행과 일부만 읽었는지를 돌려준다', async () => {
    const result = { orderCount: 1, rows: [{ orderNo: '66_A-1', receiver: '홍길동', provider: '키드키즈', source: 'pending' }], partial: true };
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation(SELLPIA_ORDER_SNAPSHOT_KIND, 'succeeded', { result }) });
    await expect(readSellpiaOrderSnapshot(noSleep)).resolves.toEqual(result);
    expect(requestOperationStart).toHaveBeenCalledWith(SELLPIA_ORDER_SNAPSHOT_KIND, {}, { capability: ORDERS_ACTION_OPERATION_CAPABILITY });
  });
});
