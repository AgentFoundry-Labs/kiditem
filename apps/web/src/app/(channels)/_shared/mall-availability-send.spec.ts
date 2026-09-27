import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { isMallAutoLoginBlocked } from '@/lib/mall-login-block';

// 품절·재개 = 등록 실행(sold_out·resume), 지금 재고 = 판매 상태 읽기 실행(KID-364). 실행 시작은 진짜이고 가짜는
// 확장 메시지 경계·서버 HTTP·저장 자격 API뿐이다.
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/lib/order-mall-account-api', () => ({ orderMallAccountApi: { password: vi.fn().mockResolvedValue({ loginId: null, password: null }) } }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const {
  canReadMallAvailability,
  canSendMallAvailability,
  mallReadLagsAfterSend,
  mallSoldOutNote,
  mallSoldOutWord,
  readMallAvailability,
  readMallAvailabilityMany,
  sendMallAvailability,
  summarizeLiveAvailability,
  translateMallAvailabilityWarning,
  withObjectParticle,
} = await import('./mall-availability-send');

const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const LISTING = '11111111-1111-4111-8111-111111111111';
const OPTION = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = '55555555-5555-4555-8555-555555555555';

function extension(capabilities: Record<string, boolean> = {
  operationRuntime: true, channelsRegistrationOperationKindV1: true, 'mallWriteSite.coupang': true, 'mallWriteSite.kakao': true,
}) {
  const starts: Array<Record<string, unknown>> = [];
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
    const body = message as Record<string, unknown>;
    if (body.action === 'ping') return { success: true, capabilities } as never;
    starts.push(body);
    return { success: true, operationId: OPERATION_ID, reused: false } as never;
  });
  return starts;
}

function operation(patch: Partial<OperationView>): OperationView {
  return {
    id: OPERATION_ID, kind: 'channels.registration', status: 'succeeded', lockKeys: [], plan: null, progress: null,
    result: null, window: null, errorCode: null, errorMessage: null, startedAt: '2026-09-27T09:00:00.000Z',
    finishedAt: '2026-09-27T09:01:00.000Z', expiresAt: '2026-09-27T09:30:00.000Z', attempts: 1, maxAttempts: 1,
    scheduledFor: null, ...patch,
  };
}

const noSleep = { sleep: () => Promise.resolve() };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(detectExtensionId).mockResolvedValue('ext');
});

describe('품절 송신 문장', () => {
  it('몰 구성 확인 코드는 운영자에게 읽을 수 있는 경고로 바꾼다', () => {
    expect(translateMallAvailabilityWarning('composition_unconfirmed')).toBe(
      '상품 구성을 확인하지 못했습니다. 몰에서 옵션 구성을 확인한 뒤 다시 시도하세요.',
    );
    expect(translateMallAvailabilityWarning('composition_unconfirmed: option mapping missing')).toBe(
      '상품 구성을 확인하지 못했습니다. option mapping missing',
    );
    expect(translateMallAvailabilityWarning('다른 경고')).toBe('다른 경고');
  });

  it('도매꾹 · 쿠팡 윙 · 카카오 톡스토어 · 올웨이즈 · 아트공구 · 롯데ON 은 품절을 보낼 수 있는 몰이다', () => {
    expect(canSendMallAvailability('lotte-on')).toBe(true);
    expect(canSendMallAvailability('teacher-mall')).toBe(true);
    expect(canSendMallAvailability('domeggook')).toBe(true);
    expect(canSendMallAvailability('coupang')).toBe(true);
    expect(canSendMallAvailability('kakao')).toBe(true);
    expect(canSendMallAvailability('always')).toBe(true);
    expect(canSendMallAvailability('art09')).toBe(true);
    expect(canSendMallAvailability('icecream-mall')).toBe(true);
    expect(canSendMallAvailability('kidsnote')).toBe(true);
    for (const mall of ['gmarket', 'auction', '11st', 'smartstore', 'thirtymall']) expect(canSendMallAvailability(mall)).toBe(true);
    expect(canSendMallAvailability('gs-shop')).toBe(false);
  });
});

describe('품절 · 재개 = 몰 계정 묶음 등록 실행 하나(KID-364)', () => {
  it('⭐ 계정 하나의 리스팅·옵션 묶음으로 sold_out 실행 하나를 시작하고 결과를 기다린다', async () => {
    const starts = extension();
    vi.mocked(apiClient.get).mockResolvedValue({ operation: operation({ status: 'reconciling', finishedAt: null }) });

    const run = await sendMallAvailability({
      mallKey: 'coupang', channelAccountId: ACCOUNT, action: 'sold_out',
      items: [{ channelListingId: LISTING }, { channelListingOptionIds: [OPTION] }], idempotencyKey: 'bulk-1',
    }, noSleep);

    expect(starts).toEqual([{
      action: 'operation.start',
      kind: 'channels.registration',
      scope: {
        executionKind: 'sold_out', channelAccountId: ACCOUNT,
        items: [{ channelListingId: LISTING }, { channelListingOptionIds: [OPTION] }], idempotencyKey: 'bulk-1', submit: false,
      },
      idempotencyKey: 'bulk-1',
    }]);
    expect(run).toMatchObject({ started: true, operation: { state: 'needs_confirmation' } });
  });

  it('resume도 같은 명령이다(별도 경로 없음)', async () => {
    const starts = extension();
    vi.mocked(apiClient.get).mockResolvedValue({ operation: operation({}) });
    await sendMallAvailability({ mallKey: 'kakao', channelAccountId: ACCOUNT, action: 'resume', items: [{ channelListingId: LISTING }] }, noSleep);
    expect(starts[0]?.scope).toMatchObject({ executionKind: 'resume' });
  });

  it('그 몰의 쓰기 사이트가 없는 빌드는 업데이트 문장으로 거절한다', async () => {
    const starts = extension();
    await expect(sendMallAvailability({ mallKey: 'art09', channelAccountId: ACCOUNT, action: 'sold_out', items: [{ channelListingId: LISTING }] }, noSleep))
      .rejects.toThrow('확장 프로그램을 업데이트해 주세요.');
    expect(starts).toEqual([]);
  });

  it('같은 계정의 실행이 이미 돌면 다시 보내지 않고 그 실행을 보인다', async () => {
    vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
      const body = message as Record<string, unknown>;
      if (body.action === 'ping') {
        return { success: true, capabilities: { operationRuntime: true, channelsRegistrationOperationKindV1: true, 'mallWriteSite.coupang': true } } as never;
      }
      return { success: false, errorCode: 'OPERATION_IN_PROGRESS', error: '같은 대상의 다른 실행이 진행 중입니다.', details: { existing: { operationId: OPERATION_ID } } } as never;
    });
    vi.mocked(apiClient.get).mockResolvedValue({ operation: operation({ status: 'executing', finishedAt: null }) });
    const run = await sendMallAvailability({ mallKey: 'coupang', channelAccountId: ACCOUNT, action: 'sold_out', items: [{ channelListingId: LISTING }] }, noSleep);
    expect(run).toMatchObject({ started: false, message: '같은 대상의 다른 실행이 진행 중입니다.', operation: { state: 'running' } });
  });
});

describe('몰 지금 재고', () => {
  it('쿠팡 윙 · 카카오 톡스토어 · 올웨이즈 · 아트공구 · 롯데ON 은 지금 재고를 읽는다', () => {
    expect(canReadMallAvailability('lotte-on')).toBe(true);
    expect(canReadMallAvailability('kkomangse')).toBe(true);
    expect(canReadMallAvailability('teacher-mall')).toBe(true);
    expect(canReadMallAvailability('coupang')).toBe(true);
    expect(canReadMallAvailability('kakao')).toBe(true);
    expect(canReadMallAvailability('always')).toBe(true);
    expect(canReadMallAvailability('art09')).toBe(true);
    expect(canReadMallAvailability('icecream-mall')).toBe(true);
    expect(canReadMallAvailability('kidsnote')).toBe(true);
    for (const mall of ['gmarket', 'auction', '11st', 'smartstore', 'kidkids', 'thirtymall']) expect(canReadMallAvailability(mall)).toBe(true);
    expect(canReadMallAvailability('domeggook')).toBe(false);
  });

  it('재고 수를 주지 않는 몰(올웨이즈)은 판매중이면 "판매 가능"만 말한다', () => {
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: null, rocket: false }])).toEqual({ tone: 'on_sale', label: '판매 가능' });
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }])).toEqual({ tone: 'sold_out', label: '품절 · 재고 0', badge: '품절' });
    // 품절인지만 주는 몰은 '재고 0' 이라고 적지 않는다 — 판매안함(아트공구)은 재고가 0 인 것이 아니다.
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }], 'art09')).toEqual({ tone: 'sold_out', label: '품절', badge: '품절' });
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }], 'always')).toEqual({ tone: 'sold_out', label: '품절', badge: '품절' });
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }], 'lotte-on')).toEqual({ tone: 'sold_out', label: '품절', badge: '품절' });
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }], 'icecream-mall')).toEqual({ tone: 'sold_out', label: '품절', badge: '품절' });
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }], 'kidsnote')).toEqual({ tone: 'sold_out', label: '품절', badge: '품절' });
    // ESM · 11번가 · 스마트스토어는 품절을 판매중지로 보낸다 — 그 몰의 말 그대로 적는다.
    for (const mall of ['gmarket', 'auction', '11st', 'smartstore', 'thirtymall']) {
      expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false }], mall)).toEqual({ tone: 'sold_out', label: '판매중지', badge: '판매중지' });
    }
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: null, rocket: false }], 'smartstore')).toEqual({ tone: 'on_sale', label: '판매 가능' });
    // 몰이 준 상태 글자가 있으면 그대로 적는다 — 11번가 품절(재고 0)은 판매중지가 아니다.
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false, state: '품절' }], '11st')).toEqual({ tone: 'sold_out', label: '품절', badge: '품절' });
    expect(summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false, state: '판매종료' }], 'icecream-mall')).toEqual({ tone: 'ended', label: '판매종료', badge: '판매종료' });
  });

  /**
   * 옥션이 막은 판매불가를 칸이 '품절' 로 적어 우리가 품절 처리한 것처럼 보였다(사장님 2026-09-19 "품절이 아니라 미승인이나
   * 판매불가로 해줘야지"). 칸은 몰의 말로, 까닭마다 다른 색으로 적는다.
   */
  it('못 사는 까닭을 품절로 뭉개지 않는다 — 판매불가 · 미승인 · 판매종료는 그 말로 적는다', () => {
    const stated = (state: string, mall = 'auction') => summarizeLiveAvailability([{ optionCode: 'a', stock: 0, rocket: false, state }], mall);
    expect(stated('판매불가')).toEqual({ tone: 'blocked', label: '판매불가 — 몰이 막은 상태라 판매 재개로 풀리지 않습니다', badge: '판매불가' });
    expect(stated('판매금지', 'smartstore')).toMatchObject({ tone: 'blocked', badge: '판매금지' });
    expect(stated('등록대기')).toEqual({ tone: 'pending', label: '미승인 · 등록대기', badge: '미승인' });
    expect(stated('승인대기', '11st')).toEqual({ tone: 'pending', label: '미승인 · 승인대기', badge: '미승인' });
    expect(stated('판매대기', 'smartstore')).toEqual({ tone: 'pending', label: '판매대기', badge: '판매대기' });
    expect(stated('전시전', '11st')).toMatchObject({ tone: 'pending', badge: '전시전' });
    expect(stated('숨김', 'kidsnote')).toEqual({ tone: 'ended', label: '숨김', badge: '숨김' });
    // 품절 처리가 만드는 상태는 빨간 품절 계열 그대로다.
    expect(stated('판매중지')).toEqual({ tone: 'sold_out', label: '판매중지', badge: '판매중지' });
    expect(stated('SKU품절', 'gmarket')).toEqual({ tone: 'sold_out', label: 'SKU품절', badge: 'SKU품절' });
  });

  it('롯데ON 은 보낸 직후 다시 읽지 않는다 — 조회가 옛 판매상태를 섞어 준다', () => {
    expect(mallReadLagsAfterSend('lotte-on')).toBe(true);
    expect(mallReadLagsAfterSend('coupang')).toBe(false);
    expect(mallReadLagsAfterSend('art09')).toBe(false);
  });

  it('⭐ 판매 상태 읽기 실행을 시작하고 결과 행을 상품별 옵션 재고로 돌려준다', async () => {
    const starts = extension();
    vi.mocked(apiClient.get).mockResolvedValue({ operation: operation({
      kind: 'channels.mall_availability_read',
      result: {
        rowCount: 3,
        missingExternalListingIds: ['404'],
        rows: [
          { externalListingId: '16340985357', externalOptionId: '95903875495', available: false, stock: 0, rocket: false, observedStatus: '품절', observedAt: '2026-09-27T09:00:30.000Z' },
          { externalListingId: '16340985357', externalOptionId: '95903875496', available: true, stock: 12, rocket: true, observedStatus: null, observedAt: '2026-09-27T09:00:30.000Z' },
          { externalListingId: '777', externalOptionId: null, available: true, stock: null, rocket: false, observedStatus: '판매중', observedAt: '2026-09-27T09:00:30.000Z' },
        ],
      },
    }) });

    const products = await readMallAvailabilityMany({ mallKey: 'coupang', channelAccountId: ACCOUNT, codes: ['16340985357', '777', '404'] }, noSleep);

    expect(starts).toEqual([{
      action: 'operation.start',
      kind: 'channels.mall_availability_read',
      scope: { channelAccountId: ACCOUNT, mallKey: 'coupang', externalListingIds: ['16340985357', '777', '404'] },
    }]);
    expect(products.get('16340985357')).toEqual([
      { optionCode: '95903875495', stock: 0, rocket: false, state: '품절' },
      // 로켓그로스 옵션은 쿠팡 재고라 칸이 세지 않는다 — 행의 `rocket`을 그대로 옮긴다.
      { optionCode: '95903875496', stock: 12, rocket: true },
    ]);
    expect(products.get('777')).toEqual([{ optionCode: '777', stock: null, rocket: false }]);
    expect(products.has('404')).toBe(false);
  });

  it('몰에 없는 상품이면 그렇게 말한다', async () => {
    extension();
    vi.mocked(apiClient.get).mockResolvedValue({ operation: operation({
      kind: 'channels.mall_availability_read', result: { rowCount: 0, missingExternalListingIds: ['1'], rows: [] },
    }) });
    await expect(readMallAvailability({ mallKey: 'coupang', channelAccountId: ACCOUNT, code: '1' }, noSleep))
      .rejects.toThrow('이 상품을 몰에서 찾지 못했습니다.');
  });

  it('읽기 실행이 실패하면 운영자 문장으로 던진다(원문 코드 금지)', async () => {
    extension();
    vi.mocked(apiClient.get).mockResolvedValue({ operation: operation({
      kind: 'channels.mall_availability_read', status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: 'login required',
    }) });
    const read = readMallAvailabilityMany({ mallKey: 'coupang', channelAccountId: ACCOUNT, codes: ['1'] }, noSleep);
    await expect(read).rejects.toThrow();
    await expect(read).rejects.not.toThrow(/SITE_LOGIN_REQUIRED|login required/);
  });

  it('읽기 실행이 몰의 아이디·비밀번호 거절로 끝나면 그 몰의 자동 로그인을 멈춘다(D10)', async () => {
    extension();
    vi.mocked(apiClient.get).mockResolvedValue({ operation: operation({
      kind: 'channels.mall_availability_read', status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', finishedAt: new Date().toISOString(),
      result: { login: { reason: 'credentials_rejected', mallMessage: null } },
    }) });
    await expect(readMallAvailabilityMany({ mallKey: 'coupang', channelAccountId: ACCOUNT, codes: ['1'] }, noSleep)).rejects.toThrow();
    expect(isMallAutoLoginBlocked('coupang')).toBe(true);
  });

  it('한 실행이 읽는 상품 수 상한(500)을 넘으면 나눠 시작한다', async () => {
    const starts = extension();
    vi.mocked(apiClient.get).mockResolvedValue({ operation: operation({
      kind: 'channels.mall_availability_read', result: { rowCount: 0, missingExternalListingIds: [], rows: [] },
    }) });
    const many = Array.from({ length: 501 }, (_, index) => String(1000 + index));
    await readMallAvailabilityMany({ mallKey: 'coupang', channelAccountId: ACCOUNT, codes: many }, noSleep);
    expect(starts.map((start) => (start.scope as { externalListingIds: string[] }).externalListingIds.length)).toEqual([500, 1]);
  });

  it('재고 0 이면 품절, 일부면 몇 개 품절, 아니면 판매 가능이다', () => {
    const option = (stock: number, rocket = false) => ({ optionCode: String(stock), stock, rocket });
    expect(summarizeLiveAvailability([option(0)])).toEqual({ tone: 'sold_out', label: '품절 · 재고 0', badge: '품절' });
    expect(summarizeLiveAvailability([option(0), option(0)])).toEqual({ tone: 'sold_out', label: '품절 · 옵션 2개 모두 재고 0', badge: '품절' });
    expect(summarizeLiveAvailability([option(0), option(5)])).toEqual({ tone: 'partial', label: '옵션 2개 중 1개 품절', badge: '일부 품절' });
    expect(summarizeLiveAvailability([option(1861)])).toEqual({ tone: 'on_sale', label: '판매 가능 · 재고 1,861' });
    expect(summarizeLiveAvailability([option(3), option(5)])).toEqual({ tone: 'on_sale', label: '판매 가능 · 옵션 2개 재고 있음' });
    expect(summarizeLiveAvailability([option(0, true)]).tone).toBe('rocket');
    expect(summarizeLiveAvailability([option(0), option(9, true)])).toEqual({ tone: 'sold_out', label: '품절 · 재고 0', badge: '품절' });
  });
});

describe('품절 문장', () => {
  it('판매중지로 보내는 몰은 판매중지라고 말하고, 조사는 받침에 맞춘다', () => {
    expect(mallSoldOutWord('gmarket')).toBe('판매중지');
    expect(mallSoldOutWord('kakao')).toBe('품절');
    expect(withObjectParticle('판매 재개')).toBe('판매 재개를');
    expect(withObjectParticle('품절')).toBe('품절을');
    expect(withObjectParticle('판매중지')).toBe('판매중지를');
    expect(mallSoldOutNote('auction')).toContain('90일');
    expect(mallSoldOutNote('gmarket')).toContain('13개월');
    expect(mallSoldOutNote('11st')).toContain('판매중지');
    expect(mallSoldOutNote('kakao')).toBeNull();
  });
});
