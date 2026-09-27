import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegistrationTarget } from '@kiditem/shared/sales-product';

// 몰 가격 보내기 = 등록 실행 `update` + `updateFields: ['salePrice']` 하나(KID-364). 가짜는 확장 메시지 · 서버 HTTP ·
// 저장 자격 경계뿐이고, 시작 · 대기는 진짜로 돌아 확장에 보낸 scope가 계약 스키마를 통과하는지 본다.
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/lib/order-mall-account-api', () => ({ orderMallAccountApi: { password: vi.fn().mockResolvedValue({ loginId: null, password: null }) } }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/registration-target-api', () => ({ registrationTargetApi: { resolve: vi.fn() } }));

const { apiClient } = await import('@/lib/api-client');
const { executeTargetMallPrice } = await import('./mall-price-execution');
const { fakeRegistrationExtension, parsedRegistrationScope, registrationOperationResponse } = await import('@/test/fixtures/registration-operation');

const TARGET_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT = '55555555-5555-4555-8555-555555555555';
const ACCOUNT = '66666666-6666-4666-8666-666666666666';
const LISTING = '11111111-1111-4111-8111-111111111111';
const OPTION = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const TARGET = {
  id: TARGET_ID, salesProductId: PRODUCT, channelAccountId: ACCOUNT, version: 3,
  resolved: { name: '카카오', options: [{ salesProductOptionId: OPTION, salePrice: 3000 }] },
} as unknown as RegistrationTarget;
const INPUT = {
  salesProductId: PRODUCT, channelAccountId: ACCOUNT, expectedPrice: 3000, listingId: LISTING,
  mallKey: 'kakao', idempotencyKey: 'price-1', salesProductOptionId: OPTION,
};

const fill = { steps: [], warnings: [], manualSteps: [], dialogs: [] };
const resolveTarget = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  resolveTarget.mockResolvedValue(TARGET);
});

describe('executeTargetMallPrice', () => {
  it('⭐ 등록 대상 · 버전 · 몰 상품으로 가격 수정 실행 하나를 시작한다 — 값은 서버가 얼린다', async () => {
    const starts = fakeRegistrationExtension(['kakao']);
    vi.mocked(apiClient.get).mockResolvedValue(registrationOperationResponse({
      status: 'succeeded',
      result: { providerOutcome: 'succeeded', mallOutcome: 'confirmed', submitted: true, submitSkipped: null,
        externalListingId: 'mall-code', mallMessage: null, fill, evidence: null },
    }));

    const result = await executeTargetMallPrice(INPUT, resolveTarget);

    expect(resolveTarget).toHaveBeenCalledWith({ salesProductId: PRODUCT, channelAccountId: ACCOUNT });
    expect(starts).toHaveLength(1);
    expect(parsedRegistrationScope(starts[0])).toEqual({
      executionKind: 'update',
      updateFields: ['salePrice'],
      registrationTargetId: TARGET_ID,
      expectedVersion: 3,
      channelListingId: LISTING,
      applyCompositionTemplate: false,
      submit: true,
      idempotencyKey: 'price-1',
    });
    expect(result).toMatchObject({ sent: true, confirmed: true, message: '몰 가격을 확인했습니다.' });
  });

  it('보냈지만 몰에서 확인하지 못했으면(reconciling) 확인 필요 — 다시 보내지 않는다', async () => {
    fakeRegistrationExtension(['kakao']);
    vi.mocked(apiClient.get).mockResolvedValue(registrationOperationResponse({ status: 'reconciling' }));
    const result = await executeTargetMallPrice(INPUT, resolveTarget);
    expect(result).toMatchObject({ sent: true, confirmed: false, failed: false });
    expect(result.message).toContain('몰에서 확인');
  });

  it('키즈노트는 승인 전까지 확인이 아니다 — 몰이 붙인 안내를 그대로', async () => {
    fakeRegistrationExtension(['kidsnote']);
    vi.mocked(apiClient.get).mockResolvedValue(registrationOperationResponse({ status: 'reconciling' }));
    const result = await executeTargetMallPrice({ ...INPUT, mallKey: 'kidsnote' }, resolveTarget);
    expect(result.message).toBe('키즈노트는 가격을 바꾸면 본사 승인 전까지 그 상품 판매가 멈춥니다.');
  });

  it('실패로 끝나면 운영자 문장으로, 새 시작을 허락한다', async () => {
    fakeRegistrationExtension(['kakao']);
    vi.mocked(apiClient.get).mockResolvedValue(registrationOperationResponse({
      status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', finishedAt: '2026-09-27T09:01:00.000Z',
    }));
    const result = await executeTargetMallPrice(INPUT, resolveTarget);
    expect(result).toMatchObject({ confirmed: false, failed: true });
    expect(result.message).not.toContain('SITE_LOGIN_REQUIRED');
  });

  it('⭐ 같은 몰 상품의 실행이 이미 있으면 다시 보내지 않고 그 실행을 보인다', async () => {
    const starts = fakeRegistrationExtension(['kakao'], [{
      success: false, errorCode: 'OPERATION_IN_PROGRESS', error: '같은 대상의 다른 실행이 진행 중입니다.',
      details: { existing: { operationId: OTHER } },
    }]);
    vi.mocked(apiClient.get).mockResolvedValue(registrationOperationResponse({ id: OTHER, status: 'executing' }));
    const result = await executeTargetMallPrice(INPUT, resolveTarget);
    expect(starts).toHaveLength(1);
    expect(apiClient.get).toHaveBeenCalledWith(`/api/operations/${OTHER}`);
    expect(result).toMatchObject({ sent: false, confirmed: false, failed: false, message: '같은 대상의 다른 실행이 진행 중입니다.' });
  });

  it('⭐ 사람이 본 가격과 등록 설정의 확정 가격이 다르면 보내지 않는다(그사이 가격이 바뀌었다)', async () => {
    const starts = fakeRegistrationExtension(['kakao']);
    resolveTarget.mockResolvedValue({ ...TARGET, resolved: { name: '카카오', options: [{ salesProductOptionId: OPTION, salePrice: 3500 }] } });
    await expect(executeTargetMallPrice(INPUT, resolveTarget)).rejects.toThrow('가격이 바뀌었습니다. 몰에서 보일 가격을 다시 확인한 뒤 보내세요.');
    expect(starts).toEqual([]);
  });

  it('등록 설정이 그 옵션을 고르지 않았으면 보내지 않는다', async () => {
    const starts = fakeRegistrationExtension(['kakao']);
    resolveTarget.mockResolvedValue({ ...TARGET, resolved: { name: '카카오', options: [] } });
    await expect(executeTargetMallPrice(INPUT, resolveTarget)).rejects.toThrow('가격이 바뀌었습니다');
    expect(starts).toEqual([]);
  });

  it('등록 설정의 상품·계정이 다르면 시작하지 않는다', async () => {
    const starts = fakeRegistrationExtension(['kakao']);
    resolveTarget.mockResolvedValue({ ...TARGET, channelAccountId: OTHER });
    await expect(executeTargetMallPrice(INPUT, resolveTarget)).rejects.toThrow('몰별 등록 설정의 상품과 계정을 확인할 수 없습니다.');
    expect(starts).toEqual([]);
  });
});
