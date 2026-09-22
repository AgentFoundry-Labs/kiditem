import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildIcecreamFile: vi.fn(),
  buildIcecreamRows: vi.fn(),
  collectTracking: vi.fn(),
  downloadBlob: vi.fn(),
  runAutoInvoice: vi.fn(),
  runPostTransfer: vi.fn(),
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
vi.mock('./order-collection-extension', () => ({
  runSellpiaAutoInvoiceViaExtension: mocks.runAutoInvoice,
  runSellpiaPostTransferViaExtension: mocks.runPostTransfer,
}));
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

describe('order tracking actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('emits the automatically issued Sellpia tracking CSV as a generated artifact', async () => {
    mocks.runPostTransfer.mockResolvedValue({
      success: true,
      listCount: 1,
      matched: 1,
      unmatched: [],
      invoiceTargetCount: 1,
    });
    mocks.runAutoInvoice.mockResolvedValue({
      success: true,
      invoiced: 1,
      rows: [trackingRow],
    });
    const onGeneratedFile = vi.fn();

    await runSellpiaPostProcess({
      logError: vi.fn(),
      onGeneratedFile,
    });

    expect(onGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({
      fileName: expect.stringMatching(/^셀피아_채번송장_\d{8}\.csv$/),
      mallKey: 'sellpia',
      mallName: '셀피아',
      orderNumbers: ['ORDER-1'],
      rowCount: 1,
      previewRows: expect.arrayContaining([
        ['주문번호', '수취인', '우편번호', '주소', '택배사', '택배사코드', '송장번호'],
      ]),
    }));
    expect(mocks.downloadBlob).toHaveBeenCalledOnce();
  });

  it('does not request invoice issuance without current transmission targets', async () => {
    mocks.runPostTransfer.mockResolvedValue({
      success: true,
      listCount: 3,
      matched: 3,
      unmatched: [],
      invoiceTargetCount: 0,
    });

    await runSellpiaPostProcess({
      logError: vi.fn(),
    });

    expect(mocks.runAutoInvoice).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mocks.toast.warning).toHaveBeenCalledWith(
      expect.stringContaining('다른 대기 주문은 선택하지 않았습니다'),
      expect.any(Object),
    );
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
