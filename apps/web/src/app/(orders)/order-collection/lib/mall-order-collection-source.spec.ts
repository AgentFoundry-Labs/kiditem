import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { detectOrderCollectionExtensionRuntime } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { mallOrderCollectionSource } from './mall-order-collection-source';
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

const ACCOUNT = {
  key: 'icecream-mall',
  name: '아이스크림몰',
  enabled: true,
} as unknown as OrderCollectionMallAccount;

function status(patch: Partial<OrderCollectionSourceStatus> = {}): OrderCollectionSourceStatus {
  return {
    mallKey: ACCOUNT.key,
    channelAccountId: null,
    running: null,
    lastComplete: null,
    lastAttempt: null,
    ...patch,
  };
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
  it('reads the mall as its own source key and status query', () => {
    const { source } = adapter();

    expect(source.sourceKey).toBe(`orders.mall:${ACCOUNT.key}`);
    expect(source.statusQuery.queryKey).toEqual(
      queryKeys.orders.collectionSource(ORGANIZATION_ID, ACCOUNT.key),
    );
  });

  it('shows the owner running attempt under the mall name', () => {
    const { source } = adapter();

    expect(source.readRunning(status({
      running: {
        attemptId: RUNNING_ATTEMPT_ID,
        collectionMode: 'browser',
        startedAt: '2026-09-15T01:00:00.000Z',
        expiresAt: '2026-09-15T01:30:00.000Z',
      },
    }))).toEqual({ attemptId: RUNNING_ATTEMPT_ID, scopeLabel: ACCOUNT.name });
  });

  it('is not running when the lease expired and the owner reports only the last attempt', () => {
    const { source } = adapter();

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

  it('names the latest complete attempt, since order owners assign no publication number', () => {
    const { source } = adapter();

    expect(source.readCompleteId(status({
      lastComplete: {
        attemptId: COMPLETE_ATTEMPT_ID,
        completedAt: '2026-09-15T01:10:00.000Z',
        publicationSequence: null,
      },
    }))).toBe(COMPLETE_ATTEMPT_ID);
    expect(source.readCompleteId(status())).toBeNull();
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
    vi.mocked(apiClient.post).mockResolvedValue({
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
    });

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
});
