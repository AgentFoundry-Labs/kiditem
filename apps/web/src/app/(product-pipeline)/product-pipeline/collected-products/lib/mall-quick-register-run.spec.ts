import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';

// 빠른 등록 = 등록 대상 없이 폼만 채우는 등록 실행(KID-364). 가짜는 확장 메시지 · 서버 HTTP · 저장 자격 경계뿐이고,
// 시작 · 대기 · 어댑터 검증 · 값 합치기는 진짜다 — 확장에 보낸 scope가 계약 스키마를 통과하는지 본다.
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/lib/order-mall-account-api', () => ({ orderMallAccountApi: { password: vi.fn().mockResolvedValue({ loginId: null, password: null }) } }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));

const { apiClient } = await import('@/lib/api-client');
const { fakeRegistrationExtension, parsedRegistrationScope, registrationOperationResponse } = await import('@/test/fixtures/registration-operation');
const {
  coupangWingAdapter,
  domeggookAdapter,
  elevenStAdapter,
  kidsnoteAdapter,
} = await import('@/app/(channels)/_shared/adapters');
const { EMPTY_MALL_REGISTER_VALUES, mallRegisterValuesWithDefaults } = await import('@/app/(channels)/_shared/mall-register-values');
const { runMallRegistrations, runOneMallRegistration, summarizeMallRun } = await import('./mall-quick-register-run');

/**
 * 몰 등록 실행기(빠른 등록).
 *
 *  1. **묶음으로 열되 한꺼번에 다 열지는 않는다.** 폼 채움은 몰마다 탭 하나를 점유한다.
 *  2. **막힌 몰에서 멈추지 않는다.** 하나 때문에 전부 못 하면 '한번에 등록하기' 는 쓸모가 없다.
 *  3. **막히면 실행을 시작하지 않는다.** 반쯤 빈 폼이 열리면 사람이 그대로 제출한다.
 *  4. **제출하지 않는다.** 폼만 채운 실행이다(`submit: false`).
 */

const RECORD = '11111111-1111-4111-8111-111111111111';
const DRAFT = '22222222-2222-4222-8222-222222222222';
const item = { candidateId: RECORD, name: '할로윈 LED 거미줄', salePrice: 3500, thumbnailUrl: null, source: 'candidate' as const, salesProductId: DRAFT };
const ACCOUNT = '77777777-7777-4777-8777-777777777777';
const FORM = { url: 'https://mall.example/new', manualSteps: [] };

const filled = (categoryPath = '문구/사무용품>디자인/팬시용품>기능성 팬시') => {
  const values = mallRegisterValuesWithDefaults(EMPTY_MALL_REGISTER_VALUES);
  values.byMall['11st'] = { ...values.byMall['11st'], categoryPath };
  return values;
};

const FILLED_ONLY: Partial<OperationView> = {
  status: 'succeeded',
  finishedAt: '2026-09-27T09:01:00.000Z',
  result: {
    providerOutcome: 'not_attempted', mallOutcome: 'not_submitted', submitted: false, submitSkipped: null,
    externalListingId: null, mallMessage: null,
    fill: { steps: [], warnings: [], manualSteps: ['열린 탭에서 확인하세요.'], dialogs: [] }, evidence: null,
  },
};

let starts: ReturnType<typeof fakeRegistrationExtension>;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  starts = fakeRegistrationExtension(['kidsnote', 'domeggook', '11st', 'coupang']);
  vi.mocked(apiClient.get).mockResolvedValue(registrationOperationResponse(FILLED_ONLY));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('몰 하나 실행', () => {
  it('⭐ 폼을 채우면 채웠다고만 말한다 — 등록 대상 없이 제출하지 않는 실행 하나', async () => {
    const build = vi.spyOn(kidsnoteAdapter, 'buildForm').mockResolvedValue(FORM);
    const outcome = await runOneMallRegistration('kidsnote', item, filled(), ACCOUNT);
    expect(outcome.status).toBe('filled');
    expect(outcome.message).toBe('폼을 채웠습니다. [등록]은 누르지 않았습니다 — 열린 탭에서 값을 확인하세요.');
    expect(outcome.manualSteps).toContain('열린 탭에서 확인하세요.');
    expect(build).toHaveBeenCalledOnce();
    expect(starts).toHaveLength(1);
    expect(parsedRegistrationScope(starts[0])).toEqual({
      executionKind: 'register', submit: false, channelAccountId: ACCOUNT, sourceProductId: RECORD, salesProductId: DRAFT, form: FORM,
      idempotencyKey: expect.any(String),
    });
  });

  it('공통 값을 몰 값과 합쳐 넘긴다', async () => {
    const build = vi.spyOn(domeggookAdapter, 'buildForm').mockResolvedValue(FORM);
    const values = filled();
    values.shared = { ...values.shared, certNumber: 'CB065R1579-2008' };
    await runOneMallRegistration('domeggook', item, values, ACCOUNT);
    expect(build.mock.calls[0]![0].values.certNumber).toBe('CB065R1579-2008');
  });

  it('막힌 몰은 실행을 시작하지 않는다', async () => {
    // 11번가 분류는 등록 후 바꾸기 어렵다. 비운 채로 열면 사람이 대충 고른다.
    const build = vi.spyOn(elevenStAdapter, 'buildForm').mockResolvedValue(FORM);
    const outcome = await runOneMallRegistration('11st', item, filled(''), ACCOUNT);
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toContain('분류');
    expect(build).not.toHaveBeenCalled();
    expect(starts).toEqual([]);
  });

  it('계정 행이 없는 몰은 막는다', async () => {
    const outcome = await runOneMallRegistration('kidsnote', item, filled(), null);
    expect(outcome).toMatchObject({ status: 'blocked', message: expect.stringContaining('계정 정보') });
    expect(starts).toEqual([]);
  });

  it('실행이 실패로 끝나면 왜 못 했는지 운영자 문장으로 남긴다', async () => {
    vi.spyOn(kidsnoteAdapter, 'buildForm').mockResolvedValue(FORM);
    vi.mocked(apiClient.get).mockResolvedValue(registrationOperationResponse({ status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', finishedAt: '2026-09-27T09:01:00.000Z' }));
    const outcome = await runOneMallRegistration('kidsnote', item, filled(), ACCOUNT);
    expect(outcome.status).toBe('failed');
    expect(outcome.message).not.toContain('SITE_LOGIN_REQUIRED');
  });

  it('던진 예외도 결과의 한 줄로 접는다 — 실행기는 던지지 않는다', async () => {
    vi.spyOn(kidsnoteAdapter, 'buildForm').mockRejectedValue(new Error('상세페이지를 먼저 확정하세요.'));
    const outcome = await runOneMallRegistration('kidsnote', item, filled(), ACCOUNT);
    expect(outcome).toMatchObject({ status: 'failed', message: '상세페이지를 먼저 확정하세요.' });
  });

  it('같은 몰 계정에서 도는 실행이 있으면 그 말을 남긴다', async () => {
    vi.spyOn(kidsnoteAdapter, 'buildForm').mockResolvedValue(FORM);
    starts = fakeRegistrationExtension(['kidsnote'], [{ success: false, errorCode: 'OPERATION_IN_PROGRESS', error: '같은 대상의 다른 실행이 진행 중입니다.' }]);
    const outcome = await runOneMallRegistration('kidsnote', item, filled(), ACCOUNT);
    expect(outcome).toMatchObject({ status: 'failed', message: '같은 대상의 다른 실행이 진행 중입니다.' });
  });

  it('상품이 없으면 막는다', async () => {
    const outcome = await runOneMallRegistration('kidsnote', null, filled(), ACCOUNT);
    expect(outcome).toMatchObject({ status: 'blocked', message: '보낼 상품이 없습니다.' });
  });

  it('모르는 몰은 이 흐름에 태우지 않는다', async () => {
    const outcome = await runOneMallRegistration('없는몰', item, filled(), ACCOUNT);
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toContain('어댑터가 없습니다');
  });

  it('확인 창이 필요한 몰(쿠팡 WING)은 버튼 하나로 보내지 않는다 — 확인 창에서 계정과 값을 정한다', async () => {
    const outcome = await runOneMallRegistration('coupang', item, filled(), ACCOUNT);
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toContain('확인 창');
  });
});

describe('확인 창을 거친 몰 하나 실행', () => {
  const account = { id: '88888888-8888-4888-8888-888888888888', channel: 'coupang', name: '본점', externalAccountId: null, vendorId: 'A00012345', sellerId: null, isPrimary: true };

  it('확인 창의 값과 계정으로 폼만 채운다 — 등록 대상 없이, 확인 창의 계정으로', async () => {
    const build = vi.spyOn(coupangWingAdapter, 'buildForm').mockResolvedValue({ productName: '고친 이름' });
    const outcome = await runOneMallRegistration('coupang', item, filled(), null, {
      values: { wingCategoryKey: '64687', productName: '고친 이름' },
      channelAccount: account,
    });

    expect(outcome.status).toBe('filled');
    expect(build).toHaveBeenCalledWith({
      item,
      values: expect.objectContaining({ wingCategoryKey: '64687', productName: '고친 이름' }),
      channelAccount: account,
    });
    const scope = parsedRegistrationScope(starts[0]);
    expect(scope).toMatchObject({ submit: false, channelAccountId: account.id });
    expect(scope).not.toHaveProperty('registrationTargetId');
  });
});

describe('여러 몰 실행', () => {
  const accounts = { kidsnote: ACCOUNT, domeggook: ACCOUNT };

  it('묶음으로 동시에 열되 한꺼번에 다 열지는 않는다 — 탭을 빨리 많이 만들면 주입이 깨진다', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(apiClient.get).mockImplementation(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        setTimeout(() => { inFlight -= 1; resolve(registrationOperationResponse(FILLED_ONLY)); }, 5);
      });
    });
    vi.spyOn(kidsnoteAdapter, 'buildForm').mockResolvedValue(FORM);
    vi.spyOn(domeggookAdapter, 'buildForm').mockResolvedValue(FORM);

    await runMallRegistrations({ mallKeys: ['kidsnote', 'domeggook'], item, values: filled(), channelAccountIds: accounts });
    // 둘은 함께 돈다. 상한(4)은 넘지 않는다 — 2026-09-10 에 일곱을 연달아 열자 깨졌다.
    expect(maxInFlight).toBe(2);
    expect(maxInFlight).toBeLessThanOrEqual(4);
  });

  it('한 몰이 실패해도 나머지를 계속한다', async () => {
    vi.spyOn(kidsnoteAdapter, 'buildForm').mockRejectedValue(new Error('열지 못했습니다.'));
    const domeggook = vi.spyOn(domeggookAdapter, 'buildForm').mockResolvedValue(FORM);

    const outcomes = await runMallRegistrations({ mallKeys: ['kidsnote', 'domeggook'], item, values: filled(), channelAccountIds: accounts });
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['failed', 'filled']);
    expect(domeggook).toHaveBeenCalledOnce();
  });

  it('몰마다 시작과 끝을 알린다 — 화면이 어느 몰이 도는지 보여 준다', async () => {
    vi.spyOn(kidsnoteAdapter, 'buildForm').mockResolvedValue(FORM);
    vi.spyOn(domeggookAdapter, 'buildForm').mockResolvedValue(FORM);
    const events: string[] = [];

    await runMallRegistrations({
      mallKeys: ['kidsnote', 'domeggook'],
      item,
      values: filled(),
      channelAccountIds: accounts,
      onStart: (mallKey) => events.push(`start:${mallKey}`),
      onOutcome: (outcome) => events.push(`done:${outcome.mallKey}`),
    });
    // 함께 도므로 끝나는 차례는 정해지지 않는다. 몰마다 시작과 끝이 한 번씩 오면 된다.
    expect(events.filter((event) => event.startsWith('start:')).sort())
      .toEqual(['start:domeggook', 'start:kidsnote']);
    expect(events.filter((event) => event.startsWith('done:')).sort())
      .toEqual(['done:domeggook', 'done:kidsnote']);
  });

  it('보낼 몰이 없으면 아무것도 하지 않는다', async () => {
    expect(await runMallRegistrations({ mallKeys: [], item, values: filled(), channelAccountIds: accounts })).toEqual([]);
    expect(starts).toEqual([]);
  });
});

describe('결과 요약', () => {
  const outcome = (mallName: string, status: 'filled' | 'failed', message = '') =>
    ({ mallKey: mallName, mallName, status, message, manualSteps: [] });

  it('전부 성공하면 [등록]은 누르지 않았다고 말한다 — 등록됐다고 하지 않는다', () => {
    const summary = summarizeMallRun([outcome('키즈노트', 'filled'), outcome('도매꾹', 'filled')]);
    expect(summary).toMatchObject({ filled: 2, title: '2개 몰 폼을 채웠어요' });
    expect(summary.description).toContain('[등록]은 누르지 않았습니다');
    expect(summary.description).not.toMatch(/직접 등록하세요|등록했|등록됨/);
  });

  it('일부 실패하면 어느 몰이 왜 실패했는지 남긴다', () => {
    const summary = summarizeMallRun([
      outcome('키즈노트', 'filled'),
      outcome('11번가', 'failed', '분류를 입력하세요.'),
    ]);
    expect(summary.title).toBe('1개 몰은 채우고 1개는 못 채웠어요');
    expect(summary.description).toBe('11번가: 분류를 입력하세요.');
  });

  it('전부 실패하면 그렇게 말한다', () => {
    const summary = summarizeMallRun([outcome('11번가', 'failed', '분류를 입력하세요.')]);
    expect(summary).toMatchObject({ filled: 0, title: '폼을 채우지 못했어요' });
  });
});
