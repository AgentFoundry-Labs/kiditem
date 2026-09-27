import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MallPublishAdapter, MallPublishItem } from './mall-publish-adapter';

// 등록 대상 실행 = `channels.registration` 실행 하나(KID-364). 가짜는 확장 메시지 · 서버 HTTP · 저장 자격 경계뿐이다 —
// 시작 · 대기는 진짜로 돌아 확장에 보낸 scope가 계약 스키마를 통과하는지 본다.
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/lib/order-mall-account-api', () => ({ orderMallAccountApi: { password: vi.fn().mockResolvedValue({ loginId: null, password: null }) } }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/sales-product-api', () => ({ salesProductApi: { get: vi.fn() } }));

const { apiClient } = await import('@/lib/api-client');
const { executeTargetRegistration, valuesForTarget } = await import('./target-registration-execution');
const { salesProductApi } = await import('@/lib/sales-product-api');
const {
  REGISTRATION_OPERATION_ID,
  fakeRegistrationExtension,
  parsedRegistrationScope,
  registrationOperationResponse,
} = await import('@/test/fixtures/registration-operation');

const TARGET = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const OPERATION = '33333333-3333-4333-8333-333333333333';

const item: MallPublishItem = { candidateId: PRODUCT, name: '딸깍 키링', salePrice: 2200, thumbnailUrl: null, source: 'sales_product' };

const target = {
  id: TARGET,
  version: 4,
  selectedDetailPageRevisionId: '44444444-4444-4444-8444-444444444444',
  registrationInput: {
    mallCategory: { key: 'C-1', label: '완구' },
    mallFields: { promoText: '특가' },
    adapter: { art09: { supplyPrice: 1200 }, kakao: { other: 'x' } },
    name: '대상 문서의 다른 칸은 값이 아니다',
  },
};

function adapter(patch: Partial<MallPublishAdapter> = {}): MallPublishAdapter {
  return {
    mallKey: 'art09',
    mallName: '아트공구',
    mode: 'form',
    batchSize: 1,
    requiresOperatorSubmit: true,
    fields: [{ key: 'quantity', label: '수량', origin: 'override', control: 'text', defaultValue: '1', required: true }],
    preview: () => [],
    validate: () => [],
    buildForm: vi.fn(async ({ values }) => ({ url: 'https://art09.example/new', manualSteps: [], quantity: values.quantity })),
    ...patch,
  };
}

const fill = { steps: ['상품명'], warnings: [], manualSteps: [], dialogs: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(salesProductApi.get).mockResolvedValue({
    id: PRODUCT, channelOverrides: [{ mallKey: 'art09', adapterValues: { namePrefix: '[키드]' } }],
  } as never);
  window.localStorage.clear();
});

function serveOperation(patch: Parameters<typeof registrationOperationResponse>[0]) {
  vi.mocked(apiClient.get).mockResolvedValue(registrationOperationResponse(patch));
}

describe('executeTargetRegistration', () => {
  it('⭐ 대상 값으로 폼을 만들고 register 실행 하나를 시작한다 — 제출 의도·버전·폼이 계약 scope로 실린다', async () => {
    const starts = fakeRegistrationExtension(['art09']);
    const mall = adapter();
    serveOperation({
      status: 'succeeded',
      result: { providerOutcome: 'succeeded', mallOutcome: 'confirmed', submitted: true, submitSkipped: null,
        externalListingId: '9001', mallMessage: null, fill, evidence: null },
    });

    const run = await executeTargetRegistration({
      target, mallKey: 'art09', adapter: mall, item, adapterValues: { quantity: '3' }, idempotencyKey: 'reg-1',
    });

    expect(mall.buildForm).toHaveBeenCalledWith({
      item: { ...item, registrationInput: target.registrationInput, detailPageRevisionId: target.selectedDetailPageRevisionId },
      values: expect.objectContaining({ quantity: '3', namePrefix: '[키드]', supplyPrice: '1200', mallCategoryKey: 'C-1' }),
    });
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ kind: 'channels.registration', idempotencyKey: 'reg-1' });
    expect(parsedRegistrationScope(starts[0])).toEqual({
      executionKind: 'register',
      registrationTargetId: TARGET,
      expectedVersion: 4,
      idempotencyKey: 'reg-1',
      submit: true,
      applyCompositionTemplate: false,
      adapterDefaults: { quantity: '1' },
      adapterValues: { quantity: '3' },
      form: { url: 'https://art09.example/new', manualSteps: [], quantity: '3' },
    });
    expect(apiClient.get).toHaveBeenCalledWith(`/api/operations/${REGISTRATION_OPERATION_ID}`);
    expect(run.started).toBe(true);
    expect(run.outcome).toMatchObject({ ok: true, confirmed: true, submitted: true, productNo: '9001' });
    expect(run.operation?.state).toBe('confirmed');
  });

  it('⭐ 몰에 제출했지만 결과를 못 읽었으면(reconciling) "확인 필요" — 성공으로 적지 않는다', async () => {
    fakeRegistrationExtension(['art09']);
    serveOperation({
      status: 'reconciling',
      result: { providerOutcome: 'uncertain', mallOutcome: 'submitted', submitted: true, submitSkipped: null,
        externalListingId: null, mallMessage: null, fill, evidence: null },
    });
    const run = await executeTargetRegistration({ target, mallKey: 'art09', adapter: adapter(), item, idempotencyKey: 'reg-2' });
    expect(run.operation?.state).toBe('needs_confirmation');
    expect(run.outcome).toMatchObject({ ok: false, confirmed: false, submitted: true });
    expect(run.outcome.manualSteps.join(' ')).toContain('등록상품ID');
  });

  it('관문이 [등록]을 거르면 폼만 채운 것 — 사람이 누를 일을 적는다', async () => {
    fakeRegistrationExtension(['art09']);
    serveOperation({
      status: 'succeeded',
      result: { providerOutcome: 'not_attempted', mallOutcome: 'not_submitted', submitted: false,
        submitSkipped: '이 몰은 [등록]을 사람이 누릅니다.', externalListingId: null, mallMessage: null,
        fill: { ...fill, manualSteps: ['배송비 확인'] }, evidence: null },
    });
    const run = await executeTargetRegistration({ target, mallKey: 'art09', adapter: adapter(), item, idempotencyKey: 'reg-3' });
    expect(run.outcome).toMatchObject({ ok: true, confirmed: false, submitted: false });
    expect(run.outcome.manualSteps).toEqual(['이 몰은 [등록]을 사람이 누릅니다.', '배송비 확인']);
  });

  it('어댑터가 막으면 실행을 시작하지 않는다', async () => {
    const starts = fakeRegistrationExtension(['art09']);
    const run = await executeTargetRegistration({
      target, mallKey: 'art09', adapter: adapter({ validate: () => ['수량은 1 이상이어야 합니다.'] }), item, idempotencyKey: 'reg-4',
    });
    expect(starts).toEqual([]);
    expect(run).toMatchObject({ started: false, operation: null, outcome: { ok: false, submitted: false, error: '수량은 1 이상이어야 합니다.' } });
  });

  it('폼을 만들지 못하면 실행을 시작하지 않는다(반쯤 빈 폼 금지)', async () => {
    const starts = fakeRegistrationExtension(['art09']);
    const run = await executeTargetRegistration({
      target, mallKey: 'art09', idempotencyKey: 'reg-5', item,
      adapter: adapter({ buildForm: vi.fn().mockRejectedValue(new Error('상세 이미지가 없습니다.')) }),
    });
    expect(starts).toEqual([]);
    expect(run.outcome).toMatchObject({ ok: false, submitted: false, error: '상세 이미지가 없습니다.' });
  });

  it('⭐ 같은 대상의 실행이 이미 있으면 다시 보내지 않고 그 실행을 보여 준다', async () => {
    const starts = fakeRegistrationExtension(['art09'], [{
      success: false, errorCode: 'OPERATION_IN_PROGRESS', error: '같은 대상의 다른 실행이 진행 중입니다.',
      details: { existing: { operationId: OPERATION } },
    }]);
    serveOperation({ id: OPERATION, status: 'reconciling' });
    const run = await executeTargetRegistration({ target, mallKey: 'art09', adapter: adapter(), item, idempotencyKey: 'reg-6' });
    expect(starts).toHaveLength(1);
    expect(apiClient.get).toHaveBeenCalledWith(`/api/operations/${OPERATION}`);
    expect(run.started).toBe(false);
    expect(run.operation?.state).toBe('needs_confirmation');
    expect(run.outcome.warnings).toContain('같은 대상의 다른 실행이 진행 중입니다.');
  });

  it('구성 변경은 그 kind와 몰 상품·전이, 그리고 폼을 싣는다(제출 의도 없음)', async () => {
    const starts = fakeRegistrationExtension(['art09']);
    serveOperation({ status: 'reconciling' });
    await executeTargetRegistration({
      target, mallKey: 'art09', adapter: adapter(), item, idempotencyKey: 'comp-1', submit: false,
      executionKind: 'composition_change', applyCompositionTemplate: true, channelListingId: TARGET,
      optionTransitions: [{ channelListingOptionId: TARGET, salesProductOptionId: PRODUCT }],
    });
    expect(parsedRegistrationScope(starts[0])).toMatchObject({
      executionKind: 'composition_change', submit: false, applyCompositionTemplate: true, channelListingId: TARGET,
      optionTransitions: [{ channelListingOptionId: TARGET, salesProductOptionId: PRODUCT }],
      form: { url: 'https://art09.example/new' },
    });
  });
});

describe('valuesForTarget', () => {
  it('어댑터 기본값 < 판매상품 몰별 값 < 대상 몰 문서 < 이번 편집 순으로 이긴다', () => {
    const values = valuesForTarget({
      registrationInput: target.registrationInput,
      mallKey: 'art09',
      adapterDefaults: { quantity: '1', namePrefix: '' },
      overrideValues: { namePrefix: '[키드]', supplyPrice: '999' },
      adapterValues: { quantity: '5' },
    });
    expect(values).toEqual({
      quantity: '5', namePrefix: '[키드]', supplyPrice: '1200', mallCategoryKey: 'C-1', mallCategoryLabel: '완구', promoText: '특가',
    });
  });

  it('대상 몰 문서에서는 몰 카테고리 · 몰 전용 칸 · 이 몰 namespace만 읽는다', () => {
    const values = valuesForTarget({ registrationInput: target.registrationInput, mallKey: 'art09' });
    expect(values).not.toHaveProperty('name');
    expect(values).not.toHaveProperty('other');
  });
});
