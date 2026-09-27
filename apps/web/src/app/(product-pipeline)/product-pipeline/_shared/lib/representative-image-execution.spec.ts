import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import { OperationStartFailure } from '@/lib/operation-start';

// 대표이미지 몰 반영 = 등록 실행 `thumbnail_update` 하나(KID-364). 시작·대기·읽기·확인·닫기 경계만 가짜다.
const op = vi.hoisted(() => ({ start: vi.fn(), wait: vi.fn(), read: vi.fn(), confirm: vi.fn(), close: vi.fn() }));
vi.mock('@/app/(channels)/_shared/registration-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(channels)/_shared/registration-operation')>()),
  startRegistrationOperation: op.start,
  waitForRegistrationOperation: op.wait,
  readRegistrationOperation: op.read,
  confirmRegistrationOperation: op.confirm,
  closeRegistrationOperation: op.close,
}));
vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn(), get: vi.fn() } }));

const { describeRegistrationOperation } = await import('@/app/(channels)/_shared/registration-operation');
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

function operation(patch: Partial<OperationView>): OperationView {
  return {
    id: OPERATION_ID, kind: 'channels.registration', status: 'reconciling', lockKeys: [],
    plan: { executionKind: 'thumbnail_update', salesProductId: PRODUCT, channelListingId: LISTING, externalListingId: 'MALL-7' },
    progress: null, result: null, window: null, errorCode: null, errorMessage: null, startedAt: '2026-09-27T09:00:00.000Z',
    finishedAt: null, expiresAt: '2026-09-27T09:30:00.000Z', attempts: 1, maxAttempts: 1, scheduledFor: null, ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  op.start.mockResolvedValue({ operationId: OPERATION_ID, reused: false });
});

describe('submitRepresentativeImageViaExtension', () => {
  it('⭐ 판매 상품·자산(·고른 리스팅)으로 thumbnail_update 실행 하나를 시작하고, 몰 화면에 올린 것은 저장 대기(reconciling)다', async () => {
    op.wait.mockResolvedValue(describeRegistrationOperation(operation({})));

    const result = await submitRepresentativeImageViaExtension(SUBJECT, { channelListingId: LISTING });

    expect(op.start).toHaveBeenCalledWith({
      mallKey: 'coupang',
      idempotencyKey: expect.any(String),
      scope: { executionKind: 'thumbnail_update', salesProductId: PRODUCT, assetId: ASSET, channelListingId: LISTING },
    });
    expect(result).toMatchObject({ executionId: OPERATION_ID, salesProductId: PRODUCT, status: 'reconciling', success: false });
    expect(representativeImageUploadReached(result)).toBe(true);
  });

  it('실패로 끝나면 운영자 문장을 실어 던진다', async () => {
    op.wait.mockResolvedValue(describeRegistrationOperation(operation({ status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: 'login' })));
    await expect(submitRepresentativeImageViaExtension(SUBJECT)).rejects.toThrow();
    await expect(submitRepresentativeImageViaExtension(SUBJECT)).rejects.not.toThrow(/SITE_LOGIN_REQUIRED/);
  });

  it('리스팅이 여럿이라 서버가 거절하면 운영자에게 고르게 한다', async () => {
    op.start.mockRejectedValue(new OperationStartFailure('어느 리스팅에 올릴지 골라 주세요.', 'ambiguous_listing'));
    await expect(submitRepresentativeImageViaExtension(SUBJECT)).rejects.toBeInstanceOf(ListingChoiceRequiredError);
  });
});

describe('확인 중 실행의 출구', () => {
  it('"반영됨으로 표시"는 그 몰 상품번호로 실행을 확인한다', async () => {
    op.read.mockResolvedValue(describeRegistrationOperation(operation({})));
    op.confirm.mockResolvedValue(describeRegistrationOperation(operation({ status: 'succeeded' })));
    await expect(confirmRepresentativeImageApplied(OPERATION_ID)).resolves.toMatchObject({ success: true, status: 'succeeded' });
    expect(op.confirm).toHaveBeenCalledWith(OPERATION_ID, { externalListingId: 'MALL-7' });
  });

  it('"반영 안 됨으로 표시"는 실행을 닫는다', async () => {
    op.close.mockResolvedValue(describeRegistrationOperation(operation({ status: 'failed' })));
    await markRepresentativeImageNotApplied(OPERATION_ID);
    expect(op.close).toHaveBeenCalledWith(OPERATION_ID, '운영자가 몰에서 확인: 반영되지 않음');
  });

  it('"다시 보내기"는 확인 중 실행을 닫고 같은 판매 상품·리스팅으로 새 실행을 연다(같은 실행을 두 번 보내지 않는다)', async () => {
    op.read.mockResolvedValue(describeRegistrationOperation(operation({})));
    op.wait.mockResolvedValue(describeRegistrationOperation(operation({ id: '00000000-0000-4000-8000-0000000000e2' })));
    await resendRepresentativeImageViaExtension(OPERATION_ID);
    expect(op.close).toHaveBeenCalledWith(OPERATION_ID, '운영자가 다시 보내기로 닫음');
    expect(op.start.mock.calls[0]![0].scope).toEqual({ executionKind: 'thumbnail_update', salesProductId: PRODUCT, channelListingId: LISTING });
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
