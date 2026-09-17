import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detectExtension: vi.fn(),
  ensureLogin: vi.fn(),
  collectCoupang: vi.fn(),
  convertCoupang: vi.fn(),
  password: vi.fn(),
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('./order-collection-extension', () => ({
  createOrderCollectionExtensionError: (
    response: { error?: string },
    fallback: string,
  ) => Object.assign(new Error(response.error ?? fallback), response),
  detectOrderCollectionSessionExtension: mocks.detectExtension,
  ensureMallLoggedInViaExtension: mocks.ensureLogin,
}));
vi.mock('./order-mall-account-api', () => ({
  orderMallAccountApi: { password: mocks.password },
}));
vi.mock('./coupang-directship-api', () => ({
  COUPANG_TRANSPORT_LABEL: { SHIPMENT: '쉽먼트', MILKRUN: '밀크런' },
  collectCoupangDirectFromExtension: mocks.collectCoupang,
  convertCoupangDirectToSellpiaFile: mocks.convertCoupang,
}));

import { resetMallLoginBlocksForTest } from '@/lib/mall-login-block';
import { createCoupangDirectshipCollector } from './coupang-directship-collection';
import type { CoupangDirectData } from './coupang-directship-api';
import type { OrderCollectionMallAccount } from './order-mall-account-api';

const ROCKET_CHANNEL_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';

const RUN = {
  attemptId: '11111111-1111-4111-8111-111111111111',
  attemptToken: '22222222-2222-4222-8222-222222222222',
  extensionId: 'order-extension',
  date: '2026-07-23',
  sourceOwner: 'coupang_directship' as const,
};

const ACCOUNT: OrderCollectionMallAccount = {
  key: 'coupang-direct',
  name: '쿠팡직배송',
  configured: true,
  enabled: true,
  loginId: 'operator',
  hasPassword: true,
  siteUrl: null,
  memo: null,
  passwordUpdatedAt: null,
  updatedAt: null,
};

function collector(addGeneratedFile = vi.fn(), setPreviewId = vi.fn()) {
  return createCoupangDirectshipCollector({
    rocketChannelAccountId: ROCKET_CHANNEL_ACCOUNT_ID,
    addGeneratedFile,
    setPreviewId,
  });
}

function conversion(patch: Record<string, unknown> = {}) {
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
    ...patch,
  };
}

const EMPTY_CONVERSION = {
  file: null,
  outputRows: 0,
  workbookMatchedRows: 0,
  workbookUnmatchedRows: 0,
  importRunId: null,
  rocketWorkbookExportId: null,
  transmissionIntentKey: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetMallLoginBlocksForTest();
  window.localStorage.clear();
  mocks.detectExtension.mockResolvedValue(RUN.extensionId);
  mocks.password.mockResolvedValue({ password: 'secret' });
  mocks.ensureLogin.mockResolvedValue({ success: true });
});

describe('createCoupangDirectshipCollector', () => {
  /**
   * 발주 화면도 로그인해야 열린다. 직배송이 제 로그인을 제 절차 안에서 넣는다는 것을
   * 여기서 잠근다 — 몰 수집 루프는 이 원천의 로그인을 대신 넣지 않는다(KID-255).
   */
  it('⭐ 발주를 받으러 들어가기 전에 저장된 로켓 계정으로 로그인한다', async () => {
    mocks.collectCoupang.mockResolvedValue({ pos: [], centers: {} });
    mocks.convertCoupang.mockResolvedValue(EMPTY_CONVERSION);

    await collector()(ACCOUNT, RUN);

    expect(mocks.ensureLogin).toHaveBeenCalledWith(
      'coupang-direct',
      expect.objectContaining({ loginId: 'operator', password: 'secret' }),
      expect.objectContaining({ attemptId: RUN.attemptId }),
    );
    expect(mocks.collectCoupang).toHaveBeenCalled();
  });

  /**
   * 달력이 이미 받아 둔 발주로 만드는 수집은 몰 화면에 들어갈 일이 없다. 그때 로그인을
   * 한 번 더 넣으면 계정을 괜히 두드린다(KID-255: 직배송은 루프의 로그인 확인 밖이다).
   */
  it('⭐ 달력이 받아 둔 발주를 다시 수집하지 않고, 로그인도 넣지 않는다', async () => {
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
    mocks.convertCoupang.mockResolvedValue(EMPTY_CONVERSION);

    await collector()(ACCOUNT, RUN, { eddDates: ['2026-07-30'], data: captured });

    expect(mocks.collectCoupang).not.toHaveBeenCalled();
    expect(mocks.ensureLogin).not.toHaveBeenCalled();
    expect(mocks.convertCoupang.mock.calls.map(
      ([data]) => data.pos.map((po: { seq: string }) => po.seq),
    )).toEqual([['PO-SELECTED'], ['PO-SELECTED']]);
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
      .mockResolvedValueOnce(conversion({
        file: {
          fileName: 'milkrun.xls',
          blob: new Blob(['milkrun']),
          previewRows: [],
          sourceRows: 1,
          productRows: 1,
          outputRows: 1,
          skippedRows: 0,
        },
        transmissionIntentKey: intentKey,
      }));
    const addGeneratedFile = vi.fn();

    await collector(addGeneratedFile)(ACCOUNT, RUN);

    expect(mocks.convertCoupang).toHaveBeenCalledTimes(2);
    expect(addGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({
      id: intentKey,
      mallKey: ACCOUNT.key,
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
      .mockResolvedValueOnce(conversion({
        workbookMatchedRows: 0,
        workbookUnmatchedRows: 1,
        transmissionIntentKey: intentKey,
      }))
      .mockResolvedValueOnce(EMPTY_CONVERSION);
    const addGeneratedFile = vi.fn();
    const setPreviewId = vi.fn();

    await collector(addGeneratedFile, setPreviewId)(ACCOUNT, RUN);

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
    expect(setPreviewId).toHaveBeenCalledWith(intentKey);
  });

  /**
   * 달력에서 고른 입고예정일은 그 수집 하나의 것이다. 같은 계정으로 두 수집이 겹쳐 돌아도
   * 한쪽이 고른 날짜가 다른 쪽 변환에 섞이면 안 된다.
   */
  it('keeps each date selection isolated while two directship collections overlap', async () => {
    let releaseFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      mocks.collectCoupang.mockImplementationOnce(async () => {
        resolve();
        await new Promise<void>((release) => {
          releaseFirst = release;
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
    mocks.collectCoupang.mockResolvedValue({
      pos: [
        { seq: 'PO-SELECTED', transport: 'SHIPMENT', edd: '2026-07-30' },
        { seq: 'PO-OTHER', transport: 'SHIPMENT', edd: '2026-07-31' },
      ],
      centers: {},
    });
    mocks.convertCoupang.mockImplementation(async (
      _data: { pos: Array<{ seq: string }> },
      transport: string,
    ) => (transport === 'MILKRUN' ? EMPTY_CONVERSION : conversion()));
    const collect = collector();

    const selected = collect(ACCOUNT, RUN, { eddDates: ['2026-07-30'] });
    await firstStarted;
    const other = collect(ACCOUNT, { ...RUN, attemptId: '33333333-3333-4333-8333-333333333333' }, {
      eddDates: ['2026-07-31'],
    });
    releaseFirst();

    await Promise.all([selected, other]);

    const converted = mocks.convertCoupang.mock.calls.map(
      ([data]) => data.pos.map((po: { seq: string }) => po.seq),
    );
    expect(converted).toContainEqual(['PO-SELECTED']);
    expect(converted).toContainEqual(['PO-OTHER']);
    // 어느 변환도 두 선택을 섞어 받지 않았다.
    expect(converted.every((seqs) => seqs.length === 1)).toBe(true);
  });

  it('refuses to collect without a chosen Rocket account', async () => {
    const collect = createCoupangDirectshipCollector({
      rocketChannelAccountId: null,
      addGeneratedFile: vi.fn(),
      setPreviewId: vi.fn(),
    });

    await expect(collect(ACCOUNT, RUN)).rejects.toThrow('활성 쿠팡 로켓 채널 계정을 먼저 선택해 주세요.');
  });
});
