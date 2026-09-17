import type { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { detectOrderCollectionExtensionRuntime } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import {
  coupangDirectshipCollectionSource,
  coupangDirectshipStartAlreadyRunning,
} from './coupang-directship-collection-source';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));

const CHANNEL_ACCOUNT_ID = '99999999-9999-4999-8999-999999999999';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const RUNNING_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const COMPLETE_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const ATTEMPT_TOKEN = '44444444-4444-4444-8444-444444444444';

function status(patch: Partial<OrderCollectionSourceStatus> = {}): OrderCollectionSourceStatus {
  return {
    mallKey: null,
    channelAccountId: CHANNEL_ACCOUNT_ID,
    running: null,
    lastComplete: null,
    lastAttempt: null,
    ...patch,
  };
}

function adapter(handOff = vi.fn().mockResolvedValue(undefined)) {
  return {
    handOff,
    source: coupangDirectshipCollectionSource({
      channelAccountId: CHANNEL_ACCOUNT_ID,
      handOff,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({
    status: 'ready',
    extensionId: 'order-extension',
    version: '1',
  });
});

describe('coupangDirectshipCollectionSource', () => {
  it('keys the source by the Rocket account it collects for', () => {
    const { source } = adapter();

    expect(source.sourceKey).toBe(`orders.coupang_directship:${CHANNEL_ACCOUNT_ID}`);
  });

  it('shows the owner running attempt and stops naming it once the lease expired', () => {
    const { source } = adapter();

    expect(source.readRunning(status({
      running: {
        attemptId: RUNNING_ATTEMPT_ID,
        collectionMode: 'browser',
        startedAt: '2026-09-15T01:00:00.000Z',
        expiresAt: '2026-09-15T01:30:00.000Z',
      },
    }))?.attemptId).toBe(RUNNING_ATTEMPT_ID);
    expect(source.readRunning(status({
      lastAttempt: {
        attemptId: RUNNING_ATTEMPT_ID,
        state: 'FAILED',
        errorCode: 'ATTEMPT_EXPIRED',
        errorMessage: '수집 시도가 만료되었습니다.',
        endedAt: '2026-09-15T01:30:00.000Z',
      },
    }))).toBeNull();
  });

  it('names the latest complete attempt', () => {
    const { source } = adapter();

    expect(source.readCompleteId(status({
      lastComplete: {
        attemptId: COMPLETE_ATTEMPT_ID,
        completedAt: '2026-09-15T01:10:00.000Z',
        publicationSequence: null,
      },
    }))).toBe(COMPLETE_ATTEMPT_ID);
  });

  it('stops the running attempt through the owner cancel route, without an attempt token', async () => {
    const { source } = adapter();
    vi.mocked(apiClient.post).mockResolvedValue({});

    await source.cancelOnServer!(RUNNING_ATTEMPT_ID, { status: undefined });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/orders/collection/coupang-directship/attempts/${RUNNING_ATTEMPT_ID}/cancel`,
    );
  });

  it('reads the owner conflict as the account already collecting', async () => {
    const { handOff, source } = adapter();
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError(409, 'conflict', '이미 진행 중입니다.', {
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: RUNNING_ATTEMPT_ID,
      }),
    );

    expect(await source.start!({}, { status: undefined }))
      .toEqual({ outcome: 'running', attemptId: RUNNING_ATTEMPT_ID });
    expect(handOff).not.toHaveBeenCalled();
  });

  it('hands the opened attempt to the extension run', async () => {
    const { handOff, source } = adapter();
    vi.mocked(apiClient.post).mockResolvedValue({
      attemptId: ATTEMPT_ID,
      sourceImportRunId: ATTEMPT_ID,
      state: 'RUNNING',
      attemptToken: ATTEMPT_TOKEN,
      plan: {
        sourceType: 'coupang_direct_order_capture',
        parserVersion: 'coupang-direct-order-v1',
        channelAccountId: CHANNEL_ACCOUNT_ID,
        captureMode: 'browser',
        transportScope: 'ALL',
      },
      expiresAt: '2026-09-15T01:30:00.000Z',
      artifactId: null,
      contentChecksum: null,
      errorCode: null,
      errorMessage: null,
    });

    expect(await source.start!({}, { status: undefined }))
      .toEqual({ outcome: 'started', attemptId: ATTEMPT_ID });
    expect(handOff).toHaveBeenCalledWith(expect.objectContaining({
      extensionId: 'order-extension',
      attempt: expect.objectContaining({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN }),
    }));
  });

  /**
   * KID-106 Q6. 입고예정일 달력은 아직 자기 시작을 들고 있다. 그 시작이 409 를
   * 받으면 실패가 아니라 진행 중이며, 카드의 공용 컨트롤이 그 수집을 그리도록
   * owner 상태를 다시 읽어야 한다.
   */
  it('reads the calendar start conflict as the account already collecting and re-reads the owner', () => {
    const queryClient = { invalidateQueries: vi.fn() } as unknown as QueryClient;

    expect(coupangDirectshipStartAlreadyRunning(
      queryClient,
      CHANNEL_ACCOUNT_ID,
      new ApiError(409, 'conflict', '이미 진행 중입니다.', {
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: RUNNING_ATTEMPT_ID,
      }),
    )).toBe(true);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.orders.coupangDirectshipSource(CHANNEL_ACCOUNT_ID),
      exact: true,
    });
  });

  it('leaves every other start failure a failure', () => {
    const queryClient = { invalidateQueries: vi.fn() } as unknown as QueryClient;

    expect(coupangDirectshipStartAlreadyRunning(
      queryClient,
      CHANNEL_ACCOUNT_ID,
      new ApiError(500, 'server_error', '서버 오류', {}),
    )).toBe(false);
    expect(coupangDirectshipStartAlreadyRunning(
      queryClient,
      CHANNEL_ACCOUNT_ID,
      new Error('주문수집 확장프로그램을 찾을 수 없습니다.'),
    )).toBe(false);
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('offers no start until a Rocket account is chosen', () => {
    const source = coupangDirectshipCollectionSource({
      channelAccountId: null,
      handOff: vi.fn(),
    });

    expect(source.start).toBeUndefined();
    expect(source.statusQuery.enabled).toBe(false);
  });
});

/**
 * 몰 카드는 몰 키가 아니라 원천이 답한 것만 본다(KID-255). 직배송 카드가 무엇을 수집할지
 * 먼저 고르는 화면을 여는 것도, 로켓 계정이 없을 때 시작을 막는 것도 이 원천의 답이다.
 */
describe('coupangDirectshipCollectionSource — 카드가 이 원천을 세우는 법', () => {
  it('카드를 누르면 무엇을 수집할지 먼저 고르는 화면(입고예정일 달력)이 열린다', () => {
    expect(adapter().source.card.opensChooser).toBe(true);
  });

  it('로켓 계정을 고르기 전에는 시작 자리에 그 이유가 선다', () => {
    expect(coupangDirectshipCollectionSource({
      channelAccountId: null,
      handOff: vi.fn(),
    }).card.startBlockedReason).toBe('쿠팡 로켓 계정을 먼저 선택해 주세요.');
    expect(adapter().source.card.startBlockedReason).toBeNull();
  });
});
