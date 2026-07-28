import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
vi.mock('./icecream-tracking-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./icecream-tracking-api')>();
  return {
    ...actual,
    collectSellpiaDeliTrackingFromExtension: mocks.collectTracking,
    uploadOnchTrackingViaExtension: mocks.uploadOnch,
  };
});

import { runSellpiaPostProcess, uploadTrackingForMall } from './order-tracking-actions';
import type { OrderCollectionMallAccount } from './order-mall-account-api';

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

  it('emits a mall-specific CSV artifact but does not upload it irreversibly', async () => {
    mocks.collectTracking.mockResolvedValue([trackingRow]);
    const onGeneratedFile = vi.fn();

    await uploadTrackingForMall({
      account: art09Account,
      logError: vi.fn(),
      onGeneratedFile,
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
});
