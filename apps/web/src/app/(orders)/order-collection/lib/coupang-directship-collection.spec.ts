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
vi.mock('@/lib/order-mall-account-api', () => ({
  orderMallAccountApi: { password: mocks.password },
}));
vi.mock('./coupang-directship-api', () => ({
  COUPANG_TRANSPORT_LABEL: { SHIPMENT: '쉽먼트', MILKRUN: '밀크런' },
  collectCoupangDirectFromExtension: mocks.collectCoupang,
  convertCoupangDirectToSellpiaFile: mocks.convertCoupang,
}));

import { resetMallLoginBlocksForTest } from '@/lib/mall-login-block';
import {
  createCoupangDirectshipCollector,
  sentDirectshipOrderNumbers,
} from './coupang-directship-collection';
import type { ConversionHistoryItem } from './order-collection-page-model';
import type { CoupangDirectData } from './coupang-directship-api';
import { COUPANG_DIRECT_MALL_KEY } from './coupang-directship-collection-source';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';

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
      mallKey: COUPANG_DIRECT_MALL_KEY,
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

/**
 * 달력이 남은 일만 보여 주려면, 수집이 파일에 적은 몰 키와 달력이 그 파일을 찾을 때 쓰는
 * 몰 키가 같아야 한다. 둘이 어긋나면 이미 보낸 발주가 달력에 계속 남는다.
 */
describe('sentDirectshipOrderNumbers', () => {
  const historyItem = (patch: Partial<ConversionHistoryItem>): ConversionHistoryItem => ({
    id: 'file-1',
    fileName: 'shipment.xls',
    sourceName: '쿠팡직배송 쉽먼트',
    mimeType: 'application/vnd.ms-excel',
    blob: 'base64',
    previewRows: [],
    convertedAt: Date.UTC(2026, 6, 23, 1, 0),
    productRows: null,
    outputRows: null,
    skippedRows: null,
    ...patch,
  } as ConversionHistoryItem);

  /**
   * 기준은 "파일 생성"이 아니라 "셀피아 전송 요청"이다. 파일만 만들고 전송 대기 중인
   * 발주는 아직 처리해야 할 일이 남아 있는데, 파일 기준으로 빼면 달력에서 사라져
   * 38건 중 9건만 남는 것처럼 보인다.
   */
  it('⭐ 셀피아 전송을 요청한 파일의 발주만 뺀다 — 파일만 만든 발주는 아직 남은 일이다', () => {
    const sent = sentDirectshipOrderNumbers([
      historyItem({
        id: 'sent',
        mallKey: COUPANG_DIRECT_MALL_KEY,
        orderNumbers: ['PO-SENT'],
        transmissionRequestedAt: Date.UTC(2026, 6, 23, 2, 0),
      }),
      historyItem({
        id: 'waiting',
        mallKey: COUPANG_DIRECT_MALL_KEY,
        orderNumbers: ['PO-WAITING'],
      }),
    ]);

    expect([...sent]).toEqual(['PO-SENT']);
  });

  it('다른 몰의 파일은 직배송 발주로 세지 않는다', () => {
    const sent = sentDirectshipOrderNumbers([
      historyItem({
        id: 'other-mall',
        mallKey: 'kidsnote',
        orderNumbers: ['ORDER-1'],
        transmissionRequestedAt: Date.UTC(2026, 6, 23, 2, 0),
      }),
    ]);

    expect([...sent]).toEqual([]);
  });

  /**
   * 파일에 몰 키를 적는 쪽과 그 파일을 찾는 쪽이 같은 키를 봐야 한다. 적는 쪽이 계정 행의
   * 키를 따라가면, 그 행이 다른 키로 서는 날 이미 보낸 발주가 달력에 그대로 남는다.
   */
  it('⭐ 수집이 적은 몰 키를 달력의 소거 목록이 그대로 찾는다', async () => {
    mocks.collectCoupang.mockResolvedValue({
      pos: [{ seq: 'PO-1', transport: 'SHIPMENT' }],
      centers: {},
    });
    mocks.convertCoupang
      .mockResolvedValueOnce(conversion())
      .mockResolvedValueOnce(EMPTY_CONVERSION);
    const addGeneratedFile = vi.fn();

    await collector(addGeneratedFile)({ ...ACCOUNT, key: 'rocket-supplier-row' }, RUN);

    const written = addGeneratedFile.mock.calls[0]![0] as ConversionHistoryItem;
    const sent = sentDirectshipOrderNumbers([
      { ...written, transmissionRequestedAt: Date.UTC(2026, 6, 23, 2, 0) },
    ]);

    expect([...sent]).toEqual(['PO-1']);
  });
});
