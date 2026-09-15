import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { detectOrderCollectionExtensionRuntime } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import {
  mallOrderCollectionSource,
  readMallOrderCollectionSources,
} from './mall-order-collection-source';
import {
  readActiveOrderCollectionAttempt,
  rememberActiveOrderCollectionAttempt,
} from './order-collection-source-owner';
import type { OrderCollectionMallAccount } from './order-mall-account-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));

const ORGANIZATION_ID = '99999999-9999-4999-8999-999999999999';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const RUNNING_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const COMPLETE_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const ATTEMPT_TOKEN = '44444444-4444-4444-8444-444444444444';
const STORED_KEY = '55555555-5555-4555-8555-555555555555';
const BROWSER_KEY = '66666666-6666-4666-8666-666666666666';

const ACCOUNT = {
  key: 'icecream-mall',
  name: '아이스크림몰',
  enabled: true,
} as unknown as OrderCollectionMallAccount;

const OTHER_MALL_KEY = 'kidsnote';
const CHANNEL_ACCOUNT_ID = '77777777-7777-4777-8777-777777777777';

function status(patch: Partial<OrderCollectionSourceStatus> = {}): OrderCollectionSourceStatus {
  return {
    mallKey: ACCOUNT.key,
    channelAccountId: CHANNEL_ACCOUNT_ID,
    running: null,
    lastComplete: null,
    lastAttempt: null,
    ...patch,
  };
}

/** owner 는 화면이 띄우는 몰을 한 번에 답한다. 카드마다 자기 칸을 골라 읽는다. */
function sources(
  ...entries: readonly Partial<OrderCollectionSourceStatus>[]
): OrderCollectionSourceStatus[] {
  return entries.length === 0 ? [status()] : entries.map((entry) => status(entry));
}

function runningAt(attemptId: string): OrderCollectionSourceStatus['running'] {
  return {
    attemptId,
    collectionMode: 'browser',
    startedAt: '2026-09-15T01:00:00.000Z',
    expiresAt: '2026-09-15T01:30:00.000Z',
  };
}

function openedAttempt() {
  return {
    attemptId: ATTEMPT_ID,
    sourceImportRunId: ATTEMPT_ID,
    state: 'RUNNING',
    attemptToken: ATTEMPT_TOKEN,
    plan: {
      sourceType: 'order_collection_mall',
      parserVersion: 'icecream-v1',
      mallKey: ACCOUNT.key,
      mallName: ACCOUNT.name,
      channelAccountId: ORGANIZATION_ID,
      collectionDate: '2026-09-15',
      collectionMode: 'browser',
    },
    expiresAt: '2026-09-15T01:30:00.000Z',
    artifactId: null,
    coverageStartDate: null,
    coverageEndDate: null,
    errorCode: null,
    errorMessage: null,
  };
}

/** 다른 탭이 중단했거나 임대가 만료돼 이미 끝난 시도. owner 는 재생 키에 이것을 돌려준다. */
function endedAttempt() {
  return {
    ...openedAttempt(),
    attemptId: RUNNING_ATTEMPT_ID,
    sourceImportRunId: RUNNING_ATTEMPT_ID,
    state: 'FAILED',
    expiresAt: null,
    errorCode: 'USER_CANCELLED',
    errorMessage: '운영자가 수집을 중단했습니다.',
  };
}

/** 이 화면이 owner 에게 보낸 시작 요청들의 멱등 키. */
function beginKeys(): (string | undefined)[] {
  return vi.mocked(apiClient.post).mock.calls
    .filter(([path]) => path === '/api/orders/collection/attempts')
    .map(([, , options]) => (options as { headers?: Record<string, string> } | undefined)
      ?.headers?.['Idempotency-Key']);
}

function manualUploadSource(handOff = vi.fn().mockResolvedValue(undefined)) {
  return mallOrderCollectionSource({
    organizationId: ORGANIZATION_ID,
    account: ACCOUNT,
    collectionMode: 'manual-upload',
    handOff,
  });
}

function adapter(handOff = vi.fn().mockResolvedValue(undefined)) {
  return {
    handOff,
    source: mallOrderCollectionSource({
      organizationId: ORGANIZATION_ID,
      account: ACCOUNT,
      collectionMode: 'browser',
      handOff,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(detectOrderCollectionExtensionRuntime).mockResolvedValue({
    status: 'ready',
    extensionId: 'order-extension',
    version: '1',
  });
});

describe('mallOrderCollectionSource', () => {
  /**
   * 카드 20장이 각자 자기 몰을 물으면 폴링만으로 전역 throttler 를 넘긴다. 몰마다 키를
   * 따로 두지 않고 화면 하나가 목록 한 번을 읽는다(KID-170 D2).
   */
  it('reads the mall as its own source key and the screen`s one shared status query', async () => {
    const { source } = adapter();
    vi.mocked(apiClient.getParsed).mockResolvedValue({ malls: sources() });

    expect(source.sourceKey).toBe(`orders.mall:${ACCOUNT.key}`);
    expect(source.statusQuery.queryKey).toEqual(
      queryKeys.orders.collectionSources(ORGANIZATION_ID),
    );

    await expect(readMallOrderCollectionSources()).resolves.toEqual(sources());
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/orders/collection/sources',
      expect.anything(),
    );
  });

  it('shows the owner running attempt under the mall name', () => {
    const { source } = adapter();

    expect(source.readRunning(sources({ running: runningAt(RUNNING_ATTEMPT_ID) })))
      .toEqual({ attemptId: RUNNING_ATTEMPT_ID, scopeLabel: ACCOUNT.name });
  });

  /** 한 몰이 수집 중이라고 옆 카드까지 수집 중으로 보이면 안 된다. */
  it('reads only its own mall`s slot out of the shared list', () => {
    const { source } = adapter();
    const list = sources(
      { mallKey: OTHER_MALL_KEY, running: runningAt(RUNNING_ATTEMPT_ID) },
      { mallKey: ACCOUNT.key },
    );

    expect(source.readRunning(list)).toBeNull();
    expect(source.readCompleteId(list)).toBeNull();
  });

  /** 목록에 아직 이 몰 칸이 없으면(읽기 직후의 옛 목록) 진행 중이라고 말하지 않는다. */
  it('says nothing about a mall the list does not carry', () => {
    const { source } = adapter();

    expect(source.readRunning(sources({ mallKey: OTHER_MALL_KEY }))).toBeNull();
    expect(source.readCompleteId(sources({ mallKey: OTHER_MALL_KEY }))).toBeNull();
  });

  it('is not running when the lease expired and the owner reports only the last attempt', () => {
    const { source } = adapter();

    expect(source.readRunning(sources({
      lastAttempt: {
        attemptId: RUNNING_ATTEMPT_ID,
        state: 'FAILED',
        errorCode: 'ATTEMPT_EXPIRED',
        errorMessage: '수집 시도가 만료되었습니다.',
        endedAt: '2026-09-15T01:30:00.000Z',
      },
    }))).toBeNull();
  });

  it('names the latest complete attempt, since order owners assign no publication number', () => {
    const { source } = adapter();

    expect(source.readCompleteId(sources({
      lastComplete: {
        attemptId: COMPLETE_ATTEMPT_ID,
        completedAt: '2026-09-15T01:10:00.000Z',
        publicationSequence: null,
      },
    }))).toBe(COMPLETE_ATTEMPT_ID);
    expect(source.readCompleteId(sources())).toBeNull();
  });

  it('stops the running attempt through the owner cancel route, without an attempt token', async () => {
    const { source } = adapter();
    vi.mocked(apiClient.post).mockResolvedValue({});

    await source.cancelOnServer!(RUNNING_ATTEMPT_ID, { status: undefined });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/orders/collection/attempts/${RUNNING_ATTEMPT_ID}/cancel`,
    );
  });

  it('hands the opened attempt to the extension run', async () => {
    const { handOff, source } = adapter();
    vi.mocked(apiClient.post).mockResolvedValue(openedAttempt());

    const outcome = await source.start!({}, { status: undefined });

    expect(outcome).toEqual({ outcome: 'started', attemptId: ATTEMPT_ID });
    expect(handOff).toHaveBeenCalledWith(expect.objectContaining({
      extensionId: 'order-extension',
      attempt: expect.objectContaining({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN }),
    }));
  });

  it('reads the owner conflict as the mall already collecting, not as a failed start', async () => {
    const { handOff, source } = adapter();
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError(409, 'conflict', '이미 진행 중입니다.', {
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: RUNNING_ATTEMPT_ID,
      }),
    );

    const outcome = await source.start!({}, { status: undefined });

    expect(outcome).toEqual({ outcome: 'running', attemptId: RUNNING_ATTEMPT_ID });
    expect(handOff).not.toHaveBeenCalled();
  });

  /**
   * begin 응답이 유실되면(네트워크 오류) owner 에는 RUNNING 시도가 남는데 확장은
   * 그것을 받지 못한다. 다음 시작이 새 멱등 키를 쓰면 owner 가 409 로 "진행 중"만
   * 알려 줄 뿐 아무도 그 시도를 이어받지 못한다. 답을 못 받은 키는 남겨 두었다가
   * 다시 써야 owner 가 같은 시도를 그대로 돌려주고 핸드오프가 이어진다.
   */
  it('replays the unanswered begin key so a lost ACK still reaches the extension', async () => {
    const { handOff, source } = adapter();
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new ApiError(0, 'network_error', '수집 서버에 연결하지 못했습니다.', {}))
      .mockResolvedValueOnce(openedAttempt());

    await expect(source.start!({}, { status: undefined })).rejects.toThrow();
    const outcome = await source.start!({}, { status: undefined });

    const keys = beginKeys();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(outcome).toEqual({ outcome: 'started', attemptId: ATTEMPT_ID });
    expect(handOff).toHaveBeenCalledTimes(1);
  });

  /** owner 는 같은 키에 다른 요청이 오면 재사용으로 거절한다. 그러면 새 키로 시작한다. */
  it('drops the unanswered key when the next start asks for another day', async () => {
    const { source } = adapter();
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new ApiError(0, 'network_error', '수집 서버에 연결하지 못했습니다.', {}))
      .mockResolvedValueOnce(openedAttempt());

    await expect(source.start!({ collectionDate: '2026-09-15' }, { status: undefined }))
      .rejects.toThrow();
    await source.start!({ collectionDate: '2026-09-14' }, { status: undefined });

    const keys = beginKeys();
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('starts fresh once the owner answered the last begin', async () => {
    const { source } = adapter();
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new ApiError(409, 'conflict', '이미 진행 중입니다.', {
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: RUNNING_ATTEMPT_ID,
      }))
      .mockResolvedValueOnce(openedAttempt());

    await source.start!({}, { status: undefined });
    await source.start!({}, { status: undefined });

    const keys = beginKeys();
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('starts fresh again once the replayed attempt was handed off', async () => {
    const { source } = adapter();
    vi.mocked(apiClient.post).mockResolvedValue(openedAttempt());

    await source.start!({}, { status: undefined });
    await source.start!({}, { status: undefined });

    const keys = beginKeys();
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  /**
   * owner 는 `collectionMode` 까지 넣어 요청 지문을 만든다
   * (`order-collection-source.repository.ts:91-98`). 힌트가 모드를 적어 두지 않으면
   * 다음 시작은 모드가 다른 키를 재생해 `SOURCE_IDEMPOTENCY_KEY_REUSED` 로 거절당한다.
   */
  it('replays an unanswered key only for the collection mode it was sent under', async () => {
    const { source } = adapter();
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new ApiError(0, 'network_error', '수집 서버에 연결하지 못했습니다.', {}));

    await expect(source.start!({}, { status: undefined })).rejects.toThrow();

    // 브라우저 수집이 남긴 키는 그 모드로 적힌다.
    expect(readActiveOrderCollectionAttempt(ORGANIZATION_ID, undefined, ACCOUNT.key))
      .toMatchObject({ idempotencyKey: beginKeys()[0], collectionMode: 'browser' });

    // 모드를 적지 않은 옛 키는 나머지 필드가 같아도 수동 업로드 시작이 재생하지 않는다.
    rememberActiveOrderCollectionAttempt(ORGANIZATION_ID, {
      attemptId: null,
      idempotencyKey: STORED_KEY,
      mallKey: ACCOUNT.key,
      collectionDate: null,
    }, undefined, ACCOUNT.key);
    vi.mocked(apiClient.post).mockResolvedValue(openedAttempt());
    await manualUploadSource().start!({}, { status: undefined });

    expect(beginKeys()[1]).not.toBe(STORED_KEY);

    // 브라우저 모드로 적힌 키도 마찬가지다.
    rememberActiveOrderCollectionAttempt(ORGANIZATION_ID, {
      attemptId: null,
      idempotencyKey: BROWSER_KEY,
      mallKey: ACCOUNT.key,
      collectionDate: null,
      collectionMode: 'browser',
    }, undefined, ACCOUNT.key);
    await manualUploadSource().start!({}, { status: undefined });

    expect(beginKeys()[2]).not.toBe(BROWSER_KEY);
  });

  /**
   * ACK 를 잃은 뒤 다른 탭이 그 시도를 끝내면 owner 는 재생 키에 종료된 시도를 돌려준다.
   * 이어받을 것이 없으니 그 키를 버리고 새 키로 다시 열어야 핸드오프가 일어난다.
   */
  it('begins again with a new key when the replayed attempt already ended', async () => {
    const { handOff, source } = adapter();
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new ApiError(0, 'network_error', '수집 서버에 연결하지 못했습니다.', {}))
      .mockResolvedValueOnce(endedAttempt())
      .mockResolvedValueOnce(openedAttempt());

    await expect(source.start!({}, { status: undefined })).rejects.toThrow();
    const outcome = await source.start!({}, { status: undefined });

    const keys = beginKeys();
    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(outcome).toEqual({ outcome: 'started', attemptId: ATTEMPT_ID });
    expect(handOff).toHaveBeenCalledTimes(1);
  });

  /** 429 는 owner 가 시작을 결정하지 못한 답이다. 네트워크 오류처럼 키를 남긴다. */
  it('keeps the unanswered key when the owner answered without deciding', async () => {
    const { source } = adapter();
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new ApiError(429, 'too_many_requests', '잠시 후 다시 시도해 주세요.', {}))
      .mockResolvedValueOnce(openedAttempt());

    await expect(source.start!({}, { status: undefined })).rejects.toThrow();
    await source.start!({}, { status: undefined });

    const keys = beginKeys();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
});
