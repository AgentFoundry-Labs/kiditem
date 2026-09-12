import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detectExtension: vi.fn(),
  ensureLogin: vi.fn(),
  collectKidsnote: vi.fn(),
  collectArt09: vi.fn(),
  convertArt09: vi.fn(),
  collectCoupang: vi.fn(),
  convertCoupang: vi.fn(),
  sendToExtension: vi.fn(),
  regenerateSource: vi.fn(),
  readContinuation: vi.fn(),
  saveIcecreamIndex: vi.fn(),
  addSeenOrderKeys: vi.fn(),
  password: vi.fn(),
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/extension-bridge', () => ({
  sendToExtension: mocks.sendToExtension,
}));
vi.mock('./order-collection-extension', () => ({
  collectIcecreamMallRowsFromExtension: vi.fn(),
  createOrderCollectionExtensionError: (
    response: { error?: string; errorCode?: string; pendingLogin?: boolean; failure?: unknown },
    fallback: string,
  ) => Object.assign(new Error(response.error ?? fallback), response),
  detectOrderCollectionSessionExtension: mocks.detectExtension,
  ensureMallLoggedInViaExtension: mocks.ensureLogin,
  orderCollectionExtensionRunFields: (run: Record<string, unknown> | undefined) => ({
    attemptId: run?.attemptId,
    deferTerminal: true,
    ...(run?.serverOwned ? { serverOwned: true } : {}),
    ...(run?.selectionMode ? { selectionMode: run.selectionMode } : {}),
    ...(run?.seenRowKeys ? { seenRowKeys: [...run.seenRowKeys] } : {}),
  }),
}));
vi.mock('./order-collection-api', () => ({
  regenerateOrderCollectionSource: mocks.regenerateSource,
  readOrderCollectionContinuation: mocks.readContinuation,
}));
vi.mock('./icecream-delivery-index', () => ({
  saveIcecreamDeliveryIndex: mocks.saveIcecreamIndex,
}));
vi.mock('./order-detect', () => ({
  addSeenOrderKeys: mocks.addSeenOrderKeys,
  distinctOrderNumbers: vi.fn(() => []),
  rowKeysOf: vi.fn((rows: string[][]) => rows.map((row) => row.join('\u001f'))),
}));
vi.mock('./kidsnote-orders-api', () => ({
  collectKidsnoteOrdersFromExtension: mocks.collectKidsnote,
  convertKidsnoteToSellpiaFile: vi.fn(),
}));
vi.mock('./art09-orders-api', () => ({
  collectArt09OrdersFromExtension: mocks.collectArt09,
  convertArt09ToSellpiaFile: mocks.convertArt09,
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
import type { CoupangDirectData } from './coupang-directship-api';

const RUN = {
  attemptId: '11111111-1111-4111-8111-111111111111',
  attemptToken: '22222222-2222-4222-8222-222222222222',
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
    mocks.collectArt09.mockResolvedValue([]);
    mocks.convertArt09.mockResolvedValue({ outputRows: 0, sourceRows: 0 });
    mocks.sendToExtension.mockReset();
    mocks.regenerateSource.mockReset();
    mocks.readContinuation.mockReset();
    mocks.saveIcecreamIndex.mockReset();
    mocks.addSeenOrderKeys.mockReset();
  });

  it('stops collection when login preflight needs attention', async () => {
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

    await expect(collector(ACCOUNT, RUN)).rejects.toThrow('로그인 확인이 필요합니다.');

    expect(mocks.ensureLogin).toHaveBeenCalledWith(
      'kidsnote',
      { loginId: 'operator', password: 'secret' },
      expect.objectContaining(RUN),
    );
    expect(mocks.collectKidsnote).not.toHaveBeenCalled();
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

  it('uses the refreshed account credentials supplied at execution time', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    const collector = createBrowserMallCollector({
      mallAccounts: [{ ...ACCOUNT, loginId: 'stale-operator' }],
      rocketChannelAccountId: null,
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    });

    await collector({ ...ACCOUNT, loginId: 'fresh-operator' }, RUN);

    expect(mocks.ensureLogin).toHaveBeenCalledWith(
      'kidsnote',
      { loginId: 'fresh-operator', password: 'secret' },
      expect.objectContaining(RUN),
    );
  });

  it('keeps server-owned capture and conversion inside the extension and regenerates after a delayed ACK', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      terminalState: 'COMPLETE',
      // The converter response may be lost after the source owner commits.
    });
    mocks.regenerateSource.mockResolvedValue({
      fileName: 'kidsnote.xls',
      blob: new Blob(['converted']),
      previewRows: [['converted']],
      sourceRows: 2,
      productRows: 2,
      outputRows: 2,
      skippedRows: 0,
    });
    const addGeneratedFile = vi.fn();
    const setPreviewId = vi.fn();
    const collector = createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      rocketChannelAccountId: null,
      addGeneratedFile,
      setPreviewId,
    });

    const result = await collector(ACCOUNT, {
      ...RUN,
      date: '2026-09-10',
      serverOwned: true,
      selectionMode: 'manual',
    });

    expect(mocks.sendToExtension).toHaveBeenCalledWith(
      RUN.extensionId,
      expect.objectContaining({
        action: 'collectKidsnoteOrders',
        attemptId: RUN.attemptId,
        serverOwned: true,
        deferTerminal: true,
        date: '2026-09-10',
      }),
      200000,
    );
    expect(mocks.regenerateSource).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: RUN.attemptId }),
      { download: false },
    );
    expect(addGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({
      mallKey: 'kidsnote',
      collectedRows: 2,
      fileName: 'kidsnote.xls',
    }));
    expect(setPreviewId).toHaveBeenCalled();
    expect(result).toEqual({
      rowCount: 2,
      masked: false,
      date: '2026-09-10',
    });
  });

  it('reconciles a lost extension response from the retained source without recollecting', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    mocks.sendToExtension.mockRejectedValue(new Error('extension response lost'));
    mocks.regenerateSource.mockResolvedValue({
      fileName: 'kidsnote.xls',
      blob: new Blob(['converted']),
      previewRows: [['converted']],
      sourceRows: 3,
      productRows: 3,
      outputRows: 3,
      skippedRows: 0,
    });
    const collector = createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      rocketChannelAccountId: null,
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    });

    await expect(collector(ACCOUNT, {
      ...RUN,
      date: '2026-09-10',
      serverOwned: true,
    })).resolves.toMatchObject({ rowCount: 3 });

    expect(mocks.sendToExtension).toHaveBeenCalledTimes(1);
    expect(mocks.regenerateSource).toHaveBeenCalledTimes(1);
  });

  it('replays Icecream consumers from owner-retained rows after server-owned conversion', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      terminalState: 'COMPLETE',
      conversion: { sourceRows: 1, outputRows: 1 },
    });
    mocks.regenerateSource.mockResolvedValue({
      fileName: 'icecream.xls',
      blob: new Blob(['converted']),
      previewRows: [['converted']],
      sourceRows: 1,
      productRows: 1,
      outputRows: 1,
      skippedRows: 0,
    });
    mocks.readContinuation.mockResolvedValue({
      mallKey: 'icecream-mall',
      headers: ['주문번호', '배송번호', '배송순번'],
      originalRows: [['order-1', 'delivery-1', '1'], ['order-2', 'delivery-2', '1']],
      selectedRows: [['order-2', 'delivery-2', '1']],
      selectedRowKeys: ['order-2\u001fdelivery-2\u001f1'],
      selectionMode: 'automatic',
      sourceRows: 2,
    });
    const icecream = {
      ...ACCOUNT,
      key: 'icecream-mall' as const,
      name: '아이스크림몰',
      configured: true,
      enabled: true,
    };
    const addGeneratedFile = vi.fn();
    const collector = createBrowserMallCollector({
      mallAccounts: [icecream],
      rocketChannelAccountId: null,
      addGeneratedFile,
      setPreviewId: vi.fn(),
    });

    await expect(collector(icecream, {
      ...RUN,
      date: '2026-09-10',
      serverOwned: true,
      selectionMode: 'automatic',
      seenRowKeys: ['order-1\u001fdelivery-1\u001f1'],
    })).resolves.toEqual({
      rowCount: 1,
      masked: false,
      date: '2026-09-10',
    });

    expect(mocks.saveIcecreamIndex).toHaveBeenCalledWith(
      ['주문번호', '배송번호', '배송순번'],
      [['order-1', 'delivery-1', '1'], ['order-2', 'delivery-2', '1']],
    );
    expect(mocks.addSeenOrderKeys).toHaveBeenCalledWith(
      'icecream-mall',
      ['order-2\u001fdelivery-2\u001f1'],
    );
    expect(addGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({
      mallKey: 'icecream-mall',
      collectedRows: 1,
    }));
  });

  it('passes both IDs from the single art09 account to the login preflight', async () => {
    mocks.ensureLogin.mockResolvedValue({ success: true });
    const art09Account: OrderCollectionMallAccount = {
      ...ACCOUNT,
      key: 'art09',
      name: '아트공구',
      supplierLoginId: 'supplier-operator',
    };
    const collector = createBrowserMallCollector({
      mallAccounts: [art09Account],
      rocketChannelAccountId: null,
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    });

    await collector(art09Account, RUN);

    expect(mocks.ensureLogin).toHaveBeenCalledWith(
      'art09',
      {
        loginId: 'operator',
        supplierLoginId: 'supplier-operator',
        password: 'secret',
      },
      expect.objectContaining(RUN),
    );
  });

  it('announces "no new orders" the same way for every mall', () => {
    // 몰마다 문구도 심각도도 달랐다(키즈노트만 빨간 error, 어떤 몰은 날짜를, 어떤 몰은
    // 상태명을 문장에 섞었다). 주문이 없는 건 실패가 아니므로 한 헬퍼만 쓰게 고정한다.
    const source = readFileSync(
      path.resolve(import.meta.dirname, 'browser-mall-collection.ts'),
      'utf8',
    );

    expect(source).toContain('function toastNoNewOrders(');
    // 헬퍼 안의 한 곳에서만 문구를 만든다.
    expect(source.match(/신규 주문이 없습니다/g)).toHaveLength(1);
    // 주문 없음을 오류로 알리지 않는다.
    expect(source).not.toMatch(/toast\.(error|warning)\([^)]*주문[^)]*없/);
    // 모든 몰 분기가 헬퍼를 거친다.
    expect((source.match(/toastNoNewOrders\(/g) ?? []).length).toBeGreaterThanOrEqual(13);
    expect(source).not.toContain('/주문이 없|없습니다/');
    expect(source).toContain('isNoNewOrdersMessage(msg)');
  });

  it('derives every generated-file collection date from the resolved run', () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, 'browser-mall-collection.ts'),
      'utf8',
    );

    expect(source.match(/todayYmd\(\)/g)).toHaveLength(2);
    expect(source).toContain('function collectionDateOf(');
  });

  it('defers every managed mall session until web conversion finishes', () => {
    const apiFiles = [
      'order-collection-extension.ts',
      'kidsnote-orders-api.ts',
      'kkomangse-orders-api.ts',
      'onchannel-orders-api.ts',
      'domeggook-orders-api.ts',
      'kidkids-orders-api.ts',
      'lotteon-orders-api.ts',
      'gsshop-orders-api.ts',
      'alwayz-orders-api.ts',
      'kakao-orders-api.ts',
      'boribori-orders-api.ts',
      'teacherville-orders-api.ts',
      'haebeop-orders-api.ts',
      'art09-orders-api.ts',
      'coupang-directship-api.ts',
    ];

    for (const apiFile of apiFiles) {
      const source = readFileSync(path.resolve(import.meta.dirname, apiFile), 'utf8');
      expect(source, apiFile).not.toContain('runId');
      expect(source, apiFile).toContain('attemptId');
      if (apiFile === 'coupang-directship-api.ts') {
        expect(source, apiFile).not.toContain('deferTerminal: true');
      } else {
        expect(source, apiFile).toContain('deferTerminal: true');
      }
    }
  });

  it('still collects MILKRUN when SHIPMENT has no confirmed orders', async () => {
    // 서버는 해당 유형에 발주확정 건이 없으면 예외를 던진다. 쉽먼트가 먼저 돌기 때문에
    // 그 예외를 잡지 않으면 밀크런은 시도조차 못 하고 수집이 끝난다.
    const intentKey = 'rocket-final-order:66666666-6666-4666-8666-666666666666:milkrun';
    mocks.collectCoupang.mockResolvedValue({
      pos: [{ seq: 'PO-9', transport: 'MILKRUN' }],
      centers: {},
    });
    mocks.convertCoupang
      .mockRejectedValueOnce(new Error('쉽먼트 발주확정 신규 주문이 없습니다.'))
      .mockResolvedValueOnce({
        file: {
          fileName: 'milkrun.xls',
          blob: new Blob(['milkrun']),
          previewRows: [],
          sourceRows: 1,
          productRows: 1,
          outputRows: 1,
          skippedRows: 0,
        },
        outputRows: 1,
        workbookMatchedRows: 1,
        workbookUnmatchedRows: 0,
        importRunId: '66666666-6666-4666-8666-666666666666',
        rocketWorkbookExportId: null,
        transmissionIntentKey: intentKey,
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
    expect(addGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({
      id: intentKey,
      mallName: '쿠팡직배송 밀크런',
    }));
    // 비어 있던 유형은 조용히 넘어가지 않고 이름을 밝혀 알린다.
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.stringContaining('쉽먼트'),
      expect.anything(),
    );
  });

  it('probes both Rocket transports and stores the server transmission key as the file ID', async () => {
    const intentKey = 'rocket-final-order:66666666-6666-4666-8666-666666666666:shipment';
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
        outputRows: 1,
        workbookMatchedRows: 0,
        workbookUnmatchedRows: 1,
        importRunId: '66666666-6666-4666-8666-666666666666',
        rocketWorkbookExportId: null,
        transmissionIntentKey: intentKey,
      })
      .mockResolvedValueOnce({
        file: null,
        outputRows: 0,
        workbookMatchedRows: 0,
        workbookUnmatchedRows: 0,
        importRunId: '77777777-7777-4777-8777-777777777777',
        rocketWorkbookExportId: null,
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
      sourceName: expect.stringContaining('워크북 미매칭 1품목 포함'),
      rocketWorkbookExportId: null,
      transmissionIntentKey: intentKey,
    }));
  });

  it('keeps a directship date selection isolated while another mall collects concurrently', async () => {
    let releaseCoupang!: () => void;
    const coupangStarted = new Promise<void>((resolve) => {
      mocks.collectCoupang.mockImplementation(async () => {
        resolve();
        await new Promise<void>((release) => {
          releaseCoupang = release;
        });
        return {
          pos: [
            { seq: 'PO-SELECTED', transport: 'SHIPMENT', edd: '2026-07-30' },
            { seq: 'PO-OTHER', transport: 'SHIPMENT', edd: '2026-07-31' },
          ],
          centers: {},
        };
      });
    });
    mocks.convertCoupang.mockImplementation(async (
      _data: { pos: Array<{ seq: string }> },
      transport: string,
    ) => {
      if (transport === 'MILKRUN') {
        return {
          file: null,
          outputRows: 0,
          workbookMatchedRows: 0,
          workbookUnmatchedRows: 0,
          importRunId: null,
          rocketWorkbookExportId: null,
          transmissionIntentKey: null,
        };
      }
      return {
        file: {
          fileName: 'shipment.xls',
          blob: new Blob(['shipment']),
          previewRows: [],
          sourceRows: 1,
          productRows: 1,
          outputRows: 1,
          skippedRows: 0,
        },
        outputRows: 1,
        workbookMatchedRows: 1,
        workbookUnmatchedRows: 0,
        importRunId: '66666666-6666-4666-8666-666666666666',
        rocketWorkbookExportId: null,
        transmissionIntentKey: 'rocket-final-order:66666666-6666-4666-8666-666666666666:shipment',
      };
    });
    mocks.ensureLogin.mockResolvedValue({ success: true });
    const collector = createBrowserMallCollector({
      mallAccounts: [ACCOUNT],
      rocketChannelAccountId: '44444444-4444-4444-8444-444444444444',
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    });

    const directship = collector({
      ...ACCOUNT,
      key: 'coupang-direct',
      name: '쿠팡직배송',
    }, { ...RUN, date: '2026-07-23' }, { directship: { eddDates: ['2026-07-30'] } });
    await coupangStarted;
    const kidsnote = collector(ACCOUNT, {
      ...RUN,
      attemptId: '22222222-2222-4222-8222-222222222222',
    });
    releaseCoupang();

    await Promise.all([directship, kidsnote]);

    expect(mocks.convertCoupang).toHaveBeenCalled();
    for (const [data] of mocks.convertCoupang.mock.calls) {
      expect(data.pos.map((po: { seq: string }) => po.seq)).toEqual(['PO-SELECTED']);
    }
  });

  it('reuses the calendar capture instead of collecting Directship a second time', async () => {
    const captured: CoupangDirectData = {
      pos: [
        {
          seq: 'PO-SELECTED',
          status: 'PA',
          center: 'C',
          transport: 'SHIPMENT',
          edd: '2026-07-30',
          reg: '2026-07-01',
          items: [],
        },
        {
          seq: 'PO-OTHER',
          status: 'PA',
          center: 'C',
          transport: 'MILKRUN',
          edd: '2026-07-31',
          reg: '2026-07-01',
          items: [],
        },
      ],
      centers: {},
    };
    mocks.convertCoupang.mockResolvedValue({
      file: null,
      outputRows: 0,
      workbookMatchedRows: 0,
      workbookUnmatchedRows: 0,
      importRunId: '66666666-6666-4666-8666-666666666666',
      rocketWorkbookExportId: null,
      transmissionIntentKey: null,
    });
    const collector = createBrowserMallCollector({
      mallAccounts: [],
      rocketChannelAccountId: '44444444-4444-4444-8444-444444444444',
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    });

    await collector({ ...ACCOUNT, key: 'coupang-direct', name: '쿠팡직배송' }, RUN, {
      directship: { eddDates: ['2026-07-30'], data: captured },
    });

    expect(mocks.collectCoupang).not.toHaveBeenCalled();
    expect(mocks.convertCoupang.mock.calls.map(([data]) => data.pos.map((po: { seq: string }) => po.seq))).toEqual([
      ['PO-SELECTED'],
      ['PO-SELECTED'],
    ]);
  });
});
