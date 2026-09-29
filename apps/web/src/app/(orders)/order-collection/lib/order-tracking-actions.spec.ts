import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import {
  SELLPIA_AUTO_INVOICE_KIND,
  SELLPIA_POST_TRANSFER_KIND,
} from '@kiditem/shared/orders-action-operations';

const mocks = vi.hoisted(() => ({
  buildIcecreamFile: vi.fn(),
  buildIcecreamRows: vi.fn(),
  collectTracking: vi.fn(),
  downloadBlob: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  requestOperationStart: vi.fn(),
  uploadOnch: vi.fn(),
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/browser-download', () => ({ downloadBlob: mocks.downloadBlob }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.apiGet, post: mocks.apiPost } }));
vi.mock('@/lib/operation-start', () => ({ requestOperationStart: mocks.requestOperationStart }));
vi.mock('./icecream-delivery-index', () => ({
  buildIcecreamDeliveryRows: mocks.buildIcecreamRows,
}));
vi.mock('./icecream-tracking-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./icecream-tracking-api')>();
  return {
    ...actual,
    buildIcecreamSendFinishFile: mocks.buildIcecreamFile,
    uploadOnchTrackingViaExtension: mocks.uploadOnch,
  };
});

import { runSellpiaPostProcess, uploadTrackingForMall } from './order-tracking-actions';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';

const trackingRow = {
  ordNo: 'ORDER-1',
  itemNo: 'ITEM-1',
  invNo: 'TRACKING-1',
  courier: '1136',
  provider: '아트공구',
  receiver: '수취인',
  post: '12345',
  addr: '주소',
};

const art09Account: OrderCollectionMallAccount = {
  key: 'art09',
  name: '아트공구',
  configured: true,
  enabled: true,
  loginId: 'configured',
  hasPassword: true,
  passwordUpdatedAt: null,
  siteUrl: 'https://example.test',
  memo: null,
};

const icecreamAccount: OrderCollectionMallAccount = {
  ...art09Account,
  key: 'icecream-mall',
  name: '아이스크림몰',
};

const POST_TRANSFER_ID = '11111111-1111-4111-8111-111111111111';
const INVOICE_ID = '22222222-2222-4222-8222-222222222222';

function finished(id: string, kind: OperationView['kind'], status: OperationView['status'], result: unknown): { operation: OperationView } {
  return {
    operation: {
      id,
      kind,
      status,
      lockKeys: [],
      plan: null,
      progress: null,
      result: result as OperationView['result'],
      window: null,
      errorCode: null,
      errorMessage: null,
      startedAt: '2026-09-29T00:00:00.000Z',
      finishedAt: '2026-09-29T00:00:05.000Z',
      expiresAt: '2026-09-29T00:30:00.000Z',
      attempts: 1,
      maxAttempts: 1,
      scheduledFor: null,
    },
  };
}

/** 확장이 kind마다 실행 id를 돌려주고, 서버는 그 실행의 끝난 모습을 답한다. */
function operations(byId: Record<string, { operation: OperationView }>) {
  mocks.requestOperationStart.mockImplementation(async (kind: string) => ({
    outcome: 'started',
    operationId: kind === SELLPIA_POST_TRANSFER_KIND ? POST_TRANSFER_ID : INVOICE_ID,
  }));
  mocks.apiGet.mockImplementation(async (path: string) => {
    const id = path.split('/').pop()!;
    return byId[id];
  });
}

const postTransferDone = (invoiceTargetCount: number, unmatchedOrderNumbers: string[] = []) =>
  finished(POST_TRANSFER_ID, SELLPIA_POST_TRANSFER_KIND, 'succeeded', {
    registered: true,
    stockMatched: true,
    unmatchedOrderNumbers,
    invoiceTargetCount,
  });

describe('order tracking actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('후처리 실행 결과의 자동송장 대상 수로 확인을 받고, 자동송장 실행이 발급한 송장을 CSV로 내려준다', async () => {
    operations({
      [POST_TRANSFER_ID]: postTransferDone(1),
      [INVOICE_ID]: finished(INVOICE_ID, SELLPIA_AUTO_INVOICE_KIND, 'succeeded', {
        issued: [{ orderNo: 'ORDER-1', trackingNumber: 'TRACKING-1', courier: '1136' }],
        selectedOrderNumbers: ['ORDER-1'],
        notFoundOrderNumbers: [],
      }),
    });
    const onGeneratedFile = vi.fn();
    const logInfo = vi.fn();

    await runSellpiaPostProcess({ logError: vi.fn(), logInfo, onGeneratedFile });

    expect(mocks.requestOperationStart.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      [SELLPIA_POST_TRANSFER_KIND, {}],
      [SELLPIA_AUTO_INVOICE_KIND, {}],
    ]);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('이번 전송 주문 1건만'));
    expect(onGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({
      fileName: expect.stringMatching(/^셀피아_채번송장_\d{8}\.csv$/),
      mallKey: 'sellpia',
      mallName: '셀피아',
      orderNumbers: ['ORDER-1'],
      rowCount: 1,
      previewRows: [
        ['주문번호', '수취인', '우편번호', '주소', '택배사', '택배사코드', '송장번호'],
        ['ORDER-1', '', '', '', 'CJ대한통운', '10', 'TRACKING-1'],
      ],
    }));
    expect(mocks.downloadBlob).toHaveBeenCalledOnce();
    expect(logInfo).toHaveBeenCalledWith('셀피아 송장채번', '채번 1건');
  });

  it('자동송장 대상이 없으면 확인을 묻지도 자동송장을 시작하지도 않는다', async () => {
    operations({ [POST_TRANSFER_ID]: postTransferDone(0) });

    await runSellpiaPostProcess({ logError: vi.fn() });

    expect(mocks.requestOperationStart).toHaveBeenCalledOnce();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mocks.toast.warning).toHaveBeenCalledWith(
      expect.stringContaining('다른 대기 주문은 선택하지 않았습니다'),
      expect.any(Object),
    );
  });

  it('운영자가 확인을 거절하면 자동송장을 시작하지 않는다', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    operations({ [POST_TRANSFER_ID]: postTransferDone(2) });

    await runSellpiaPostProcess({ logError: vi.fn() });

    expect(mocks.requestOperationStart).toHaveBeenCalledOnce();
  });

  it('재고매칭이 안 된 주문번호를 알리고 활동 기록에 남긴다', async () => {
    operations({ [POST_TRANSFER_ID]: postTransferDone(0, ['A-1', 'A-2']) });
    const logError = vi.fn();

    await runSellpiaPostProcess({ logError });

    expect(logError).toHaveBeenCalledWith('셀피아 미매칭 2건', 'A-1, A-2');
  });

  it('채번을 눌렀지만 발급 행을 읽지 못한 자동송장(reconciling)은 셀피아 확인 토스트에 확인·닫기를 단다', async () => {
    operations({
      [POST_TRANSFER_ID]: postTransferDone(1),
      [INVOICE_ID]: finished(INVOICE_ID, SELLPIA_AUTO_INVOICE_KIND, 'reconciling', null),
    });
    mocks.apiPost.mockResolvedValue(finished(INVOICE_ID, SELLPIA_AUTO_INVOICE_KIND, 'succeeded', null));
    const logError = vi.fn();

    await runSellpiaPostProcess({ logError });

    expect(mocks.downloadBlob).not.toHaveBeenCalled();
    const warning = mocks.toast.warning.mock.calls.find(([message]) => String(message).includes('셀피아 확인 필요'));
    expect(warning).toBeDefined();
    const options = warning![1] as { action: { label: string; onClick: () => void }; cancel: { label: string; onClick: () => void } };
    expect(logError).toHaveBeenCalledWith('셀피아 송장채번', expect.stringContaining('셀피아 확인 필요'));
    options.action.onClick();
    options.cancel.onClick();
    await vi.waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(2));
    expect(mocks.apiPost).toHaveBeenCalledWith(`/api/orders/action-operations/${INVOICE_ID}/confirm`, {});
    expect(mocks.apiPost).toHaveBeenCalledWith(`/api/orders/action-operations/${INVOICE_ID}/close`, { reason: expect.any(String) });
  });

  it('후처리 실행이 실패하면 서버 문장으로 알리고 활동 기록에 남긴다', async () => {
    const failed = finished(POST_TRANSFER_ID, SELLPIA_POST_TRANSFER_KIND, 'failed', null);
    failed.operation.errorCode = 'SITE_LOGIN_REQUIRED';
    failed.operation.errorMessage = '셀피아 로그인이 필요합니다.';
    operations({ [POST_TRANSFER_ID]: failed });
    const logError = vi.fn();

    await runSellpiaPostProcess({ logError });

    expect(logError).toHaveBeenCalledWith('셀피아 후처리', '셀피아 로그인이 필요합니다.');
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('emits a mall-specific CSV artifact but does not upload it irreversibly', async () => {
    mocks.collectTracking.mockResolvedValue([trackingRow]);
    const onGeneratedFile = vi.fn();

    await uploadTrackingForMall({
      account: art09Account,
      history: [],
      logError: vi.fn(),
      onGeneratedFile,
      collectTracking: mocks.collectTracking,
    });

    expect(onGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({
      fileName: expect.stringMatching(/^아트공구_송장_\d{8}\.csv$/),
      mallKey: 'art09',
      mallName: '아트공구',
      orderNumbers: ['ORDER-1'],
      rowCount: 1,
    }));
    expect(mocks.downloadBlob).toHaveBeenCalledOnce();
    expect(mocks.uploadOnch).not.toHaveBeenCalled();
  });

  it('emits the exact Icecream delivery-number xlsx instead of a generic tracking CSV', async () => {
    const icecreamTracking = {
      ...trackingRow,
      ordNo: '20260729M037101',
      invNo: '576997610340',
      provider: '아이스크림몰',
    };
    mocks.collectTracking.mockResolvedValue([icecreamTracking]);
    mocks.buildIcecreamRows.mockResolvedValue({
      headers: ['주문번호', '배송번호', '배송순번'],
      rows: [['20260729M037101', '116569790', '1']],
      matchedOrders: 1,
      missingOrderNumbers: [],
      indexSize: 1,
    });
    const blob = new Blob(['xlsx']);
    mocks.buildIcecreamFile.mockResolvedValue({
      fileName: '아이스크림몰_출고완료_20260729.xlsx',
      blob,
      previewRows: [
        ['배송번호', '배송순번', '택배사', '송장번호'],
        ['116569790', '1', '10', '576997610340'],
      ],
      sourceRows: 1,
      trackingRows: 1,
      matchedRows: 1,
      unmappedCouriers: [],
    });
    const onGeneratedFile = vi.fn();

    await uploadTrackingForMall({
      account: icecreamAccount,
      history: [],
      logError: vi.fn(),
      onGeneratedFile,
      collectTracking: mocks.collectTracking,
    });

    expect(mocks.buildIcecreamFile).toHaveBeenCalledWith(
      ['주문번호', '배송번호', '배송순번'],
      [['20260729M037101', '116569790', '1']],
      [icecreamTracking],
      expect.objectContaining({ download: false }),
    );
    expect(onGeneratedFile).toHaveBeenCalledWith({
      blob,
      fileName: '아이스크림몰_출고완료_20260729.xlsx',
      mallKey: 'icecream-mall',
      mallName: '아이스크림몰',
      orderNumbers: ['20260729M037101'],
      previewRows: [
        ['배송번호', '배송순번', '택배사', '송장번호'],
        ['116569790', '1', '10', '576997610340'],
      ],
      rowCount: 1,
    });
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      blob,
      '아이스크림몰_출고완료_20260729.xlsx',
    );
  });


});
