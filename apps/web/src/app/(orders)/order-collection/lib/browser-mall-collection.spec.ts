import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detectExtension: vi.fn(),
  ensureLogin: vi.fn(),
  collectKidsnote: vi.fn(),
  collectCoupang: vi.fn(),
  convertCoupang: vi.fn(),
  password: vi.fn(),
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('./order-collection-extension', () => ({
  collectIcecreamMallRowsFromExtension: vi.fn(),
  detectOrderCollectionSessionExtension: mocks.detectExtension,
  ensureMallLoggedInViaExtension: mocks.ensureLogin,
}));
vi.mock('./kidsnote-orders-api', () => ({
  collectKidsnoteOrdersFromExtension: mocks.collectKidsnote,
  convertKidsnoteToSellpiaFile: vi.fn(),
}));
vi.mock('./order-mall-account-api', () => ({
  orderMallAccountApi: { password: mocks.password },
}));
vi.mock('./coupang-directship-api', () => ({
  COUPANG_TRANSPORT_LABEL: { SHIPMENT: '쉽먼트', MILKRUN: '밀크런' },
  collectCoupangDirectFromExtension: mocks.collectCoupang,
  convertCoupangDirectToSellpiaFile: mocks.convertCoupang,
}));

import { createBrowserMallCollector } from './browser-mall-collection';
import type { OrderCollectionMallAccount } from './order-mall-account-api';

const RUN = {
  runId: '11111111-1111-4111-8111-111111111111',
  extensionId: 'order-extension',
};

const ACCOUNT: OrderCollectionMallAccount = {
  key: 'kidsnote',
  name: '키즈노트',
  configured: true,
  enabled: true,
  loginId: 'operator',
  hasPassword: true,
  siteUrl: 'https://shop.kidsnote.com',
  memo: null,
  passwordUpdatedAt: null,
  updatedAt: null,
};

describe('createBrowserMallCollector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detectExtension.mockResolvedValue(RUN.extensionId);
    mocks.password.mockResolvedValue({ password: 'secret' });
    mocks.collectKidsnote.mockResolvedValue({ orders: [], count: 0 });
  });

  it('continues the managed collector with the same run after login preflight needs attention', async () => {
    mocks.ensureLogin.mockResolvedValue({
      success: false,
      pendingLogin: true,
      error: '로그인 확인이 필요합니다.',
    });
    const collector = createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      rocketChannelAccountId: null,
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    });

    await expect(collector(ACCOUNT, RUN)).resolves.toEqual({
      rowCount: 0,
      masked: false,
      date: expect.any(String),
    });

    expect(mocks.ensureLogin).toHaveBeenCalledWith(
      'kidsnote',
      { loginId: 'operator', password: 'secret' },
      expect.objectContaining(RUN),
    );
    expect(mocks.collectKidsnote).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      '',
      true,
      expect.objectContaining(RUN),
    );
  });

  it('reuses the original date when restarting a managed collection', async () => {
    const run = { ...RUN, date: '2026-07-14' };
    mocks.ensureLogin.mockResolvedValue({ success: true });
    const collector = createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      rocketChannelAccountId: null,
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    });

    await collector(ACCOUNT, run);

    expect(mocks.collectKidsnote).toHaveBeenCalledWith(
      '2026-07-14',
      '2026-07-14',
      '',
      true,
      run,
    );
  });

  it('derives every generated-file collection date from the resolved run', () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, 'browser-mall-collection.ts'),
      'utf8',
    );

    expect(source.match(/todayYmd\(\)/g)).toHaveLength(1);
    expect(source).toContain('function collectionDateOf(');
  });

  it('probes both Rocket transports and stores the server transmission key as the file ID', async () => {
    const exportId = '55555555-5555-4555-8555-555555555555';
    const intentKey = `rocket-workbook:${exportId}:shipment`;
    mocks.collectCoupang.mockResolvedValue({
      pos: [{ seq: 'PO-1', transport: 'SHIPMENT' }],
      centers: {},
    });
    mocks.convertCoupang
      .mockResolvedValueOnce({
        file: {
          fileName: 'shipment.xls',
          blob: new Blob(['shipment']),
          previewRows: [],
          sourceRows: 1,
          productRows: 1,
          outputRows: 1,
          skippedRows: 0,
        },
        matchedRows: 1,
        importRunId: '66666666-6666-4666-8666-666666666666',
        rocketWorkbookExportId: exportId,
        transmissionIntentKey: intentKey,
      })
      .mockResolvedValueOnce({
        file: null,
        matchedRows: 0,
        importRunId: '77777777-7777-4777-8777-777777777777',
        rocketWorkbookExportId: exportId,
        transmissionIntentKey: null,
      });
    const addGeneratedFile = vi.fn();
    const collector = createBrowserMallCollector({
      mallAccounts: [],
      rocketChannelAccountId: '44444444-4444-4444-8444-444444444444',
      addGeneratedFile,
      setPreviewId: vi.fn(),
    });

    await collector({
      ...ACCOUNT,
      key: 'coupang-direct',
      name: '쿠팡직배송',
    }, { ...RUN, date: '2026-07-23' });

    expect(mocks.convertCoupang).toHaveBeenCalledTimes(2);
    expect(mocks.convertCoupang.mock.calls.map((call) => call[1])).toEqual([
      'SHIPMENT',
      'MILKRUN',
    ]);
    expect(addGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({
      id: intentKey,
      rocketWorkbookExportId: exportId,
      transmissionIntentKey: intentKey,
    }));
  });
});
