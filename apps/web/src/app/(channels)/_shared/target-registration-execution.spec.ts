import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import type { MallPublishAdapter, MallPublishItem } from './mall-publish-adapter';

// 등록 대상 실행 = `channels.registration` 실행 하나(KID-364). 시작·대기 경계(`registration-operation`)만 가짜이고,
// 값 합치기·검증·폼 만들기·결과 풀이는 진짜다.
const start = vi.hoisted(() => vi.fn());
const wait = vi.hoisted(() => vi.fn());
const read = vi.hoisted(() => vi.fn());
vi.mock('./registration-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./registration-operation')>()),
  startRegistrationOperation: start,
  waitForRegistrationOperation: wait,
  readRegistrationOperation: read,
}));
vi.mock('@/lib/sales-product-api', () => ({ salesProductApi: { get: vi.fn() } }));

const { RegistrationOperationInProgress, describeRegistrationOperation } = await import('./registration-operation');
const { executeTargetRegistration, valuesForTarget } = await import('./target-registration-execution');
const { salesProductApi } = await import('@/lib/sales-product-api');

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

function operation(patch: Partial<OperationView>): OperationView {
  return {
    id: OPERATION, kind: 'channels.registration', status: 'executing', lockKeys: [], plan: null, progress: null,
    result: null, window: null, errorCode: null, errorMessage: null, startedAt: '2026-09-27T09:00:00.000Z',
    finishedAt: null, expiresAt: '2026-09-27T09:30:00.000Z', attempts: 1, maxAttempts: 1, scheduledFor: null,
    ...patch,
  };
}

const fill = { steps: ['상품명'], warnings: [], manualSteps: [], dialogs: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(salesProductApi.get).mockResolvedValue({
    id: PRODUCT, channelOverrides: [{ mallKey: 'art09', adapterValues: { namePrefix: '[키드]' } }],
  } as never);
  start.mockResolvedValue({ operationId: OPERATION, reused: false });
});

describe('executeTargetRegistration', () => {
  it('⭐ 대상 값으로 폼을 만들고 register 실행 하나를 시작한다 — 제출 의도·버전·폼이 scope에 실린다', async () => {
    const mall = adapter();
    wait.mockResolvedValue(describeRegistrationOperation(operation({
      status: 'succeeded',
      result: { providerOutcome: 'succeeded', mallOutcome: 'confirmed', submitted: true, submitSkipped: null,
        externalListingId: '9001', mallMessage: null, fill, evidence: null },
    })));

    const run = await executeTargetRegistration({
      target, mallKey: 'art09', adapter: mall, item, adapterValues: { quantity: '3' }, idempotencyKey: 'reg-1',
    });

    expect(mall.buildForm).toHaveBeenCalledWith({
      item: { ...item, registrationInput: target.registrationInput, detailPageRevisionId: target.selectedDetailPageRevisionId },
      values: expect.objectContaining({ quantity: '3', namePrefix: '[키드]', supplyPrice: '1200', mallCategoryKey: 'C-1' }),
    });
    expect(start).toHaveBeenCalledWith({
      mallKey: 'art09',
      idempotencyKey: 'reg-1',
      scope: {
        executionKind: 'register',
        registrationTargetId: TARGET,
        expectedVersion: 4,
        submit: true,
        applyCompositionTemplate: false,
        adapterDefaults: { quantity: '1' },
        adapterValues: { quantity: '3' },
        form: { url: 'https://art09.example/new', manualSteps: [], quantity: '3' },
      },
    });
    expect(run.started).toBe(true);
    expect(run.outcome).toMatchObject({ ok: true, confirmed: true, submitted: true, productNo: '9001' });
    expect(run.operation?.state).toBe('confirmed');
  });

  it('⭐ 몰에 제출했지만 결과를 못 읽었으면(reconciling) "확인 필요" — 성공으로 적지 않는다', async () => {
    wait.mockResolvedValue(describeRegistrationOperation(operation({
      status: 'reconciling',
      result: { providerOutcome: 'uncertain', mallOutcome: 'submitted', submitted: true, submitSkipped: null,
        externalListingId: null, mallMessage: null, fill, evidence: null },
    })));
    const run = await executeTargetRegistration({ target, mallKey: 'art09', adapter: adapter(), item, idempotencyKey: 'reg-2' });
    expect(run.operation?.state).toBe('needs_confirmation');
    expect(run.outcome).toMatchObject({ ok: false, confirmed: false, submitted: true });
    expect(run.outcome.manualSteps.join(' ')).toContain('등록상품ID');
  });

  it('관문이 [등록]을 거르면 폼만 채운 것 — 사람이 누를 일을 적는다', async () => {
    wait.mockResolvedValue(describeRegistrationOperation(operation({
      status: 'succeeded',
      result: { providerOutcome: 'not_attempted', mallOutcome: 'not_submitted', submitted: false,
        submitSkipped: '이 몰은 [등록]을 사람이 누릅니다.', externalListingId: null, mallMessage: null,
        fill: { ...fill, manualSteps: ['배송비 확인'] }, evidence: null },
    })));
    const run = await executeTargetRegistration({ target, mallKey: 'art09', adapter: adapter(), item, idempotencyKey: 'reg-3' });
    expect(run.outcome).toMatchObject({ ok: true, confirmed: false, submitted: false });
    expect(run.outcome.manualSteps).toEqual(['이 몰은 [등록]을 사람이 누릅니다.', '배송비 확인']);
  });

  it('어댑터가 막으면 실행을 시작하지 않는다', async () => {
    const run = await executeTargetRegistration({
      target, mallKey: 'art09', adapter: adapter({ validate: () => ['수량은 1 이상이어야 합니다.'] }), item, idempotencyKey: 'reg-4',
    });
    expect(start).not.toHaveBeenCalled();
    expect(run).toMatchObject({ started: false, operation: null, outcome: { ok: false, submitted: false, error: '수량은 1 이상이어야 합니다.' } });
  });

  it('폼을 만들지 못하면 실행을 시작하지 않는다(반쯤 빈 폼 금지)', async () => {
    const run = await executeTargetRegistration({
      target, mallKey: 'art09', idempotencyKey: 'reg-5', item,
      adapter: adapter({ buildForm: vi.fn().mockRejectedValue(new Error('상세 이미지가 없습니다.')) }),
    });
    expect(start).not.toHaveBeenCalled();
    expect(run.outcome).toMatchObject({ ok: false, submitted: false, error: '상세 이미지가 없습니다.' });
  });

  it('⭐ 같은 대상의 실행이 이미 있으면 다시 보내지 않고 그 실행을 보여 준다', async () => {
    start.mockRejectedValue(new RegistrationOperationInProgress('같은 대상의 다른 실행이 진행 중입니다.', OPERATION));
    read.mockResolvedValue(describeRegistrationOperation(operation({ status: 'reconciling' })));
    const run = await executeTargetRegistration({ target, mallKey: 'art09', adapter: adapter(), item, idempotencyKey: 'reg-6' });
    expect(start).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledWith(OPERATION);
    expect(run.started).toBe(false);
    expect(run.operation?.state).toBe('needs_confirmation');
    expect(run.outcome.warnings).toContain('같은 대상의 다른 실행이 진행 중입니다.');
  });

  it('수정(update)·구성 변경은 그 kind와 몰 상품·전이를 싣는다', async () => {
    wait.mockResolvedValue(describeRegistrationOperation(operation({ status: 'executing' })));
    await executeTargetRegistration({
      target, mallKey: 'art09', adapter: adapter(), item, idempotencyKey: 'comp-1',
      executionKind: 'composition_change', applyCompositionTemplate: true, channelListingId: TARGET,
      optionTransitions: [{ channelListingOptionId: TARGET, salesProductOptionId: PRODUCT }],
    });
    expect(start.mock.calls[0]?.[0].scope).toMatchObject({
      executionKind: 'composition_change', applyCompositionTemplate: true, channelListingId: TARGET,
      optionTransitions: [{ channelListingOptionId: TARGET, salesProductOptionId: PRODUCT }],
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
