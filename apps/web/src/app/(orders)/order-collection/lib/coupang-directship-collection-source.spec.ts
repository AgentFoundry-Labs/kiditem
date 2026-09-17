import { readFileSync } from 'node:fs';
import path from 'node:path';
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

describe('coupangDirectshipCollectionSource — 이 몰 키의 주인', () => {
  const routeRoot = path.resolve(import.meta.dirname, '..');
  const srcRoot = path.resolve(routeRoot, '../../..');
  const MALL_KEY_LITERAL = /['"`]coupang-direct['"`]/;
  const MALL_KEY_NAME = /COUPANG_DIRECT_MALL_KEY/;

  /** 공용 몰 수집 루프와 화면의 코드. 이 키를 문자열로도 이름으로도 부르지 않는다. */
  const LOOP_AND_SCREEN = [
    'lib/browser-mall-collection.ts',
    'lib/order-collection-page-model.ts',
    'lib/mall-order-collection-source.ts',
    'lib/order-collection-source-adapter.ts',
    'components/OrderCollectionWorkspace.tsx',
    'components/MallAccountSection.tsx',
    'components/MallAccountGroups.tsx',
    'components/MallCollectionControl.tsx',
  ].map((file) => path.join(routeRoot, file))
    .concat(path.join(srcRoot, 'hooks/useAllMarketplaceOrderCollection.ts'));

  /**
   * 그 스펙들. 스펙은 이 원천에서 상수를 받아 쓸 수 있다 — 키가 하나라는 사실을 오히려
   * 보여 준다. 다만 문자열을 제 손으로 다시 적으면 그 키가 코드로 돌아오므로 그것만 막는다.
   */
  const LOOP_AND_SCREEN_SPECS = [
    'lib/browser-mall-collection.spec.ts',
    'lib/order-collection-page-model.spec.ts',
    'components/OrderCollectionWorkspace.spec.tsx',
    'components/MallAccountSection.spec.tsx',
    'components/MallAccountGroups.spec.tsx',
    'components/MallCollectionControl.spec.tsx',
  ].map((file) => path.join(routeRoot, file))
    .concat(path.join(srcRoot, 'hooks/useAllMarketplaceOrderCollection.spec.tsx'));

  /**
   * 이 몰 키를 아는 곳은 이 원천의 파일 하나다. 공용 몰 수집 루프와 화면이 여섯 곳에서
   * 이 키를 특례로 알아보던 동안, 루프를 고칠 때마다 직배송을 따로 검증해야 했다(KID-255).
   *
   * 문자열만 막으면 상수를 받아다 `account.key === COUPANG_DIRECT_MALL_KEY` 로 같은 분기를
   * 되살릴 수 있다 — 코드에서는 이름도 막는다. 루프와 화면은 그 원천이 답한 것만 본다.
   */
  it('⭐ 루프도 화면도 이 몰 키를 문자열로도 이름으로도 부르지 않는다', () => {
    for (const file of LOOP_AND_SCREEN) {
      const source = readFileSync(file, 'utf8');
      // `coupang-directship-*` 모듈을 가리키는 import 경로는 그 원천을 부르는 길이지 키 분기가 아니다.
      expect([file, MALL_KEY_LITERAL.test(source), MALL_KEY_NAME.test(source)])
        .toEqual([file, false, false]);
    }
  });

  it('⭐ 그 스펙들도 이 몰 키를 제 손으로 적지 않는다 — 쓸 일이 있으면 이 원천에서 받아 쓴다', () => {
    for (const file of LOOP_AND_SCREEN_SPECS) {
      expect([file, MALL_KEY_LITERAL.test(readFileSync(file, 'utf8'))])
        .toEqual([file, false]);
    }
  });
});
