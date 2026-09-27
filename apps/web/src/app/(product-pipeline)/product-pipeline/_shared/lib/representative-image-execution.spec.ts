import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';

// 대표이미지 몰 반영 = 등록 실행 `thumbnail_update` 하나(KID-364). 가짜는 확장 메시지 · 서버 HTTP · 저장 자격 경계뿐이고,
// 시작 · 대기 · 확인 · 닫기는 진짜로 돌아 확장에 보낸 scope가 계약 스키마를 통과하는지 본다.
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/lib/order-mall-account-api', () => ({ orderMallAccountApi: { password: vi.fn().mockResolvedValue({ loginId: null, password: null }) } }));
vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn(), get: vi.fn() } }));

const { apiClient } = await import('@/lib/api-client');
const { fakeRegistrationExtension, parsedRegistrationScope, registrationOperationResponse } = await import('@/test/fixtures/registration-operation');
const {
  ListingChoiceRequiredError,
  confirmRepresentativeImageApplied,
  fetchRepresentativeImageListingChoices,
  markRepresentativeImageNotApplied,
  representativeImageUploadReached,
  representativeImageUploadedMessage,
  resendRepresentativeImageViaExtension,
  submitRepresentativeImageViaExtension,
} = await import('./representative-image-execution');

const PRODUCT = '11111111-1111-4111-8111-111111111111';
const ASSET = '22222222-2222-4222-8222-222222222222';
const LISTING = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = '00000000-0000-4000-8000-0000000000e1';
const SUBJECT = { salesProductId: PRODUCT, assetId: ASSET };

const checking = (patch: Partial<OperationView> = {}) => registrationOperationResponse({
  id: OPERATION_ID,
  plan: { executionKind: 'thumbnail_update', salesProductId: PRODUCT, channelListingId: LISTING, externalListingId: 'MALL-7' },
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('submitRepresentativeImageViaExtension', () => {
  it('⭐ 판매 상품·자산(·고른 리스팅)으로 thumbnail_update 실행 하나를 시작하고, 몰 화면에 올린 것은 저장 대기(reconciling)다', async () => {
    const starts = fakeRegistrationExtension(['coupang'], [{ success: true, operationId: OPERATION_ID, reused: false }]);
    vi.mocked(apiClient.get).mockResolvedValue(checking());

    const result = await submitRepresentativeImageViaExtension(SUBJECT, { channelListingId: LISTING });

    expect(parsedRegistrationScope(starts[0])).toEqual({
      executionKind: 'thumbnail_update', salesProductId: PRODUCT, assetId: ASSET, channelListingId: LISTING,
      idempotencyKey: expect.any(String), submit: false,
    });
    expect(result).toMatchObject({ executionId: OPERATION_ID, salesProductId: PRODUCT, status: 'reconciling', success: false });
    expect(representativeImageUploadReached(result)).toBe(true);
  });

  it('실패로 끝나면 운영자 문장을 실어 던진다', async () => {
    fakeRegistrationExtension(['coupang']);
    vi.mocked(apiClient.get).mockResolvedValue(checking({ status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: 'login' }));
    const submitted = submitRepresentativeImageViaExtension(SUBJECT);
    await expect(submitted).rejects.toThrow();
    await expect(submitted).rejects.not.toThrow(/SITE_LOGIN_REQUIRED/);
  });

  it('리스팅이 여럿이라 서버가 거절하면(VALIDATION_FAILED + ambiguous_listing) 운영자에게 고르게 한다', async () => {
    fakeRegistrationExtension(['coupang'], [{
      success: false, errorCode: 'VALIDATION_FAILED', error: '어느 리스팅에 올릴지 골라 주세요.', details: { reason: 'ambiguous_listing' },
    }]);
    await expect(submitRepresentativeImageViaExtension(SUBJECT)).rejects.toBeInstanceOf(ListingChoiceRequiredError);
  });
});

describe('확인 중 실행의 출구', () => {
  it('"반영됨으로 표시"는 그 몰 상품번호로 실행을 확인한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(checking());
    vi.mocked(apiClient.post).mockResolvedValue(checking({ status: 'succeeded' }));
    await expect(confirmRepresentativeImageApplied(OPERATION_ID)).resolves.toMatchObject({ success: true, status: 'succeeded' });
    expect(apiClient.post).toHaveBeenCalledWith(`/api/channels/registration-operations/${OPERATION_ID}/confirm`, { externalListingId: 'MALL-7' });
  });

  it('"반영 안 됨으로 표시"는 실행을 닫는다', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(checking({ status: 'failed' }));
    await markRepresentativeImageNotApplied(OPERATION_ID);
    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/channels/registration-operations/${OPERATION_ID}/close`,
      { reason: '운영자가 몰에서 확인: 반영되지 않음' },
    );
  });

  it('"다시 보내기"는 확인 중 실행을 닫고 같은 판매 상품·리스팅으로 새 실행을 연다(같은 실행을 두 번 보내지 않는다)', async () => {
    const NEXT = '00000000-0000-4000-8000-0000000000e2';
    const starts = fakeRegistrationExtension(['coupang'], [{ success: true, operationId: NEXT, reused: false }]);
    vi.mocked(apiClient.get).mockImplementation(async (href: string) => (href.endsWith(NEXT) ? checking({ id: NEXT }) : checking()));
    vi.mocked(apiClient.post).mockResolvedValue(checking({ status: 'failed' }));
    await resendRepresentativeImageViaExtension(OPERATION_ID);
    expect(apiClient.post).toHaveBeenCalledWith(`/api/channels/registration-operations/${OPERATION_ID}/close`, { reason: '운영자가 다시 보내기로 닫음' });
    expect(parsedRegistrationScope(starts[0])).toEqual({
      executionKind: 'thumbnail_update', salesProductId: PRODUCT, channelListingId: LISTING, idempotencyKey: expect.any(String), submit: false,
    });
  });
});

describe('fetchRepresentativeImageListingChoices', () => {
  it('reads the listings the operator can pick from Channels', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [{ channelListingId: 'listing-2', channelName: '두번째', channelAccountName: 'Wing', externalId: '99' }] });

    await expect(fetchRepresentativeImageListingChoices('product-1')).resolves.toEqual([
      { channelListingId: 'listing-2', channelName: '두번째', channelAccountName: 'Wing', externalId: '99' },
    ]);
    expect(apiClient.get).toHaveBeenCalledWith('/api/channels/thumbnail-executions/listing-choices?salesProductId=product-1');
  });
});

describe('representativeImageUploadedMessage', () => {
  it('names the channel that takes representative images from the registry, never a hard-coded screen', () => {
    const message = representativeImageUploadedMessage();
    expect(message).toBe('쿠팡 WING 상품 수정 화면에 올렸습니다 — 저장한 뒤 반영됨으로 표시하세요');
    expect(representativeImageUploadedMessage({ uploaded: 3 })).toBe(
      '쿠팡 WING 상품 수정 화면에 3장 올렸습니다 — 저장한 뒤 반영됨으로 표시하세요',
    );
    expect(representativeImageUploadedMessage({ uploaded: 2, failed: 1 })).toBe(
      '쿠팡 WING 상품 수정 화면에 2장 올림 / 실패 1 — 올린 것은 저장 뒤 반영됨으로 표시하세요',
    );
    expect(representativeImageUploadedMessage({ resent: true })).toBe(
      '쿠팡 WING 상품 수정 화면에 다시 올렸습니다 — 저장한 뒤 반영됨으로 표시하세요',
    );
  });
});
