import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import type { RegistrationTarget } from '@kiditem/shared/sales-product';

// 몰 가격 보내기 = 등록 실행 `update` + `updateFields: ['salePrice']` 하나(KID-364). 시작·대기·읽기 경계만 가짜다.
const start = vi.hoisted(() => vi.fn());
const wait = vi.hoisted(() => vi.fn());
const read = vi.hoisted(() => vi.fn());
vi.mock('@/app/(channels)/_shared/registration-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(channels)/_shared/registration-operation')>()),
  startRegistrationOperation: start,
  waitForRegistrationOperation: wait,
  readRegistrationOperation: read,
}));

const { describeRegistrationOperation, RegistrationOperationInProgress } = await import('@/app/(channels)/_shared/registration-operation');
const { executeTargetMallPrice } = await import('./mall-price-execution');

const OPTION = '22222222-2222-4222-8222-222222222222';
const TARGET = {
  id: 'target', salesProductId: 'product', channelAccountId: 'account', version: 3,
  resolved: { name: '카카오', options: [{ salesProductOptionId: OPTION, salePrice: 3000 }] },
} as unknown as RegistrationTarget;
const INPUT = {
  salesProductId: 'product', channelAccountId: 'account', expectedPrice: 3000, listingId: '11111111-1111-4111-8111-111111111111',
  mallKey: 'kakao', idempotencyKey: 'price-1', salesProductOptionId: OPTION,
};

function operation(patch: Partial<OperationView>): OperationView {
  return {
    id: '33333333-3333-4333-8333-333333333333', kind: 'channels.registration', status: 'succeeded', lockKeys: [],
    plan: null, progress: null, result: null, window: null, errorCode: null, errorMessage: null,
    startedAt: '2026-09-27T09:00:00.000Z', finishedAt: '2026-09-27T09:01:00.000Z', expiresAt: '2026-09-27T09:30:00.000Z',
    attempts: 1, maxAttempts: 1, scheduledFor: null, ...patch,
  };
}

const fill = { steps: [], warnings: [], manualSteps: [], dialogs: [] };
const resolveTarget = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  resolveTarget.mockResolvedValue(TARGET);
  start.mockResolvedValue({ operationId: 'op-1', reused: false });
});

describe('executeTargetMallPrice', () => {
  it('⭐ 등록 대상 · 버전 · 몰 상품으로 가격 수정 실행 하나를 시작한다 — 값은 서버가 얼린다', async () => {
    wait.mockResolvedValue(describeRegistrationOperation(operation({
      result: { providerOutcome: 'succeeded', mallOutcome: 'confirmed', submitted: true, submitSkipped: null,
        externalListingId: 'mall-code', mallMessage: null, fill, evidence: null },
    })));

    const result = await executeTargetMallPrice(INPUT, resolveTarget);

    expect(resolveTarget).toHaveBeenCalledWith({ salesProductId: 'product', channelAccountId: 'account' });
    expect(start).toHaveBeenCalledWith({
      mallKey: 'kakao',
      idempotencyKey: 'price-1',
      scope: {
        executionKind: 'update',
        updateFields: ['salePrice'],
        registrationTargetId: 'target',
        expectedVersion: 3,
        channelListingId: INPUT.listingId,
        applyCompositionTemplate: false,
        submit: true,
      },
    });
    expect(result).toMatchObject({ sent: true, confirmed: true, message: '몰 가격을 확인했습니다.' });
  });

  it('보냈지만 몰에서 확인하지 못했으면(reconciling) 확인 필요 — 다시 보내지 않는다', async () => {
    wait.mockResolvedValue(describeRegistrationOperation(operation({ status: 'reconciling', finishedAt: null })));
    const result = await executeTargetMallPrice(INPUT, resolveTarget);
    expect(result).toMatchObject({ sent: true, confirmed: false, failed: false });
    expect(result.message).toContain('몰에서 확인');
  });

  it('키즈노트는 승인 전까지 확인이 아니다 — 몰이 붙인 안내를 그대로', async () => {
    wait.mockResolvedValue(describeRegistrationOperation(operation({ status: 'reconciling', finishedAt: null })));
    const result = await executeTargetMallPrice({ ...INPUT, mallKey: 'kidsnote' }, resolveTarget);
    expect(result.message).toBe('키즈노트는 가격을 바꾸면 본사 승인 전까지 그 상품 판매가 멈춥니다.');
  });

  it('실패로 끝나면 운영자 문장으로, 새 시작을 허락한다', async () => {
    wait.mockResolvedValue(describeRegistrationOperation(operation({ status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED' })));
    const result = await executeTargetMallPrice(INPUT, resolveTarget);
    expect(result).toMatchObject({ confirmed: false, failed: true });
    expect(result.message).not.toContain('SITE_LOGIN_REQUIRED');
  });

  it('⭐ 같은 몰 상품의 실행이 이미 있으면 다시 보내지 않고 그 실행을 보인다', async () => {
    start.mockRejectedValue(new RegistrationOperationInProgress('같은 대상의 다른 실행이 진행 중입니다.', 'op-0'));
    read.mockResolvedValue(describeRegistrationOperation(operation({ id: '44444444-4444-4444-8444-444444444444', status: 'executing', finishedAt: null })));
    const result = await executeTargetMallPrice(INPUT, resolveTarget);
    expect(read).toHaveBeenCalledWith('op-0');
    expect(wait).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sent: false, confirmed: false, failed: false, message: '같은 대상의 다른 실행이 진행 중입니다.' });
  });

  it('⭐ 사람이 본 가격과 등록 설정의 확정 가격이 다르면 보내지 않는다(그사이 가격이 바뀌었다)', async () => {
    resolveTarget.mockResolvedValue({ ...TARGET, resolved: { name: '카카오', options: [{ salesProductOptionId: OPTION, salePrice: 3500 }] } });
    await expect(executeTargetMallPrice(INPUT, resolveTarget)).rejects.toThrow('가격이 바뀌었습니다. 몰에서 보일 가격을 다시 확인한 뒤 보내세요.');
    expect(start).not.toHaveBeenCalled();
  });

  it('등록 설정이 그 옵션을 고르지 않았으면 보내지 않는다', async () => {
    resolveTarget.mockResolvedValue({ ...TARGET, resolved: { name: '카카오', options: [] } });
    await expect(executeTargetMallPrice(INPUT, resolveTarget)).rejects.toThrow('가격이 바뀌었습니다');
    expect(start).not.toHaveBeenCalled();
  });

  it('등록 설정의 상품·계정이 다르면 시작하지 않는다', async () => {
    resolveTarget.mockResolvedValue({ ...TARGET, channelAccountId: 'other' });
    await expect(executeTargetMallPrice(INPUT, resolveTarget)).rejects.toThrow('몰별 등록 설정의 상품과 계정을 확인할 수 없습니다.');
    expect(start).not.toHaveBeenCalled();
  });
});
